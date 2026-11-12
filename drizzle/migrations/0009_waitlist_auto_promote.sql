-- Auto-promote the first eligible waitlisted member when a spot frees up.
-- Triggered by: a booking becoming 'cancelled', or a workout's capacity increasing.

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_workout_id bigint)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w public.workouts;
  m public.members;
  existing public.bookings;
  cand record;
  taken int;
  bid bigint;
  promoted int := 0;
BEGIN
  -- Same lock order as book_session: workout row first, then member row.
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND OR w.start_time <= now() THEN
    RETURN 0;
  END IF;

  -- Earliest waitlist entry first (FIFO)
  FOR cand IN
    SELECT waitlist_id, member_id
    FROM waitlist
    WHERE workout_id = p_workout_id
    ORDER BY created_at, waitlist_id
  LOOP
    SELECT count(*) INTO taken
      FROM bookings
      WHERE workout_id = p_workout_id AND status <> 'cancelled';
    EXIT WHEN taken >= w.capacity;  -- no free spots left

    SELECT * INTO m FROM members WHERE member_id = cand.member_id FOR UPDATE;
    IF NOT FOUND THEN
      DELETE FROM waitlist WHERE waitlist_id = cand.waitlist_id;
      CONTINUE;
    END IF;

    SELECT * INTO existing
      FROM bookings
      WHERE member_id = cand.member_id AND workout_id = p_workout_id;
    IF FOUND AND existing.status <> 'cancelled' THEN
      -- already booked somehow: just clean the stale waitlist row
      DELETE FROM waitlist WHERE waitlist_id = cand.waitlist_id;
      CONTINUE;
    END IF;

    IF m.wallet_balance < w.deposit_amount THEN
      -- not enough money: stay on the waitlist, try the next person
      INSERT INTO audit_log (member_id, action, details)
        VALUES (cand.member_id, 'waitlist_skipped_insufficient_funds',
                'workout ' || p_workout_id);
      CONTINUE;
    END IF;

    IF existing.booking_id IS NOT NULL THEN
      UPDATE bookings
        SET status = 'upcoming', deposit_paid = w.deposit_amount, booked_at = now()
        WHERE booking_id = existing.booking_id
        RETURNING booking_id INTO bid;
    ELSE
      INSERT INTO bookings (member_id, workout_id, status, deposit_paid, booked_at)
        VALUES (cand.member_id, p_workout_id, 'upcoming', w.deposit_amount, now())
        RETURNING booking_id INTO bid;
    END IF;

    UPDATE members
      SET wallet_balance = wallet_balance - w.deposit_amount
      WHERE member_id = cand.member_id;

    INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
      VALUES (cand.member_id, bid, 'deposit', -w.deposit_amount, now());

    DELETE FROM waitlist WHERE waitlist_id = cand.waitlist_id;

    INSERT INTO audit_log (member_id, action, details)
      VALUES (cand.member_id, 'waitlist_promoted',
              'booking ' || bid || ', workout ' || p_workout_id
              || ', deposit ' || w.deposit_amount);

    promoted := promoted + 1;
  END LOOP;

  RETURN promoted;
END
$function$;

-- Trigger 1: a booking was cancelled
CREATE OR REPLACE FUNCTION public.trg_promote_on_booking_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.promote_from_waitlist(NEW.workout_id);
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS bookings_promote_on_cancel ON public.bookings;
CREATE TRIGGER bookings_promote_on_cancel
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled')
EXECUTE FUNCTION public.trg_promote_on_booking_cancel();

-- Trigger 2: capacity of a workout was increased
CREATE OR REPLACE FUNCTION public.trg_promote_on_capacity_increase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.promote_from_waitlist(NEW.workout_id);
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS workouts_promote_on_capacity ON public.workouts;
CREATE TRIGGER workouts_promote_on_capacity
AFTER UPDATE OF capacity ON public.workouts
FOR EACH ROW
WHEN (NEW.capacity > OLD.capacity)
EXECUTE FUNCTION public.trg_promote_on_capacity_increase();

-- Only the server / triggers may call these directly (not browser users)
REVOKE ALL ON FUNCTION public.promote_from_waitlist(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_promote_on_booking_cancel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_promote_on_capacity_increase() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_from_waitlist(bigint) TO service_role;
