-- Trainers can cancel their own workouts. Everyone booked is cancelled and refunded automatically,
-- people on the waitlist are removed, and every affected member gets a message that is shown
-- at the top of the site until they dismiss it.
-- Run AFTER 0012. Safe to run more than once.
--
-- Same rules as the rest of the project: the app never writes tables directly, it calls
-- security-definer functions that check who is calling.

-- 1) A workout can now be cancelled (never deleted, so bookings, refunds and reviews keep their history)
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS cancel_reason text;

-- 2) Messages for members
CREATE TABLE IF NOT EXISTS public.member_notifications (
  notification_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id bigint NOT NULL REFERENCES public.members(member_id),
  kind text NOT NULL CHECK (kind IN ('workout_cancelled', 'waitlist_cancelled')),
  workout_id bigint REFERENCES public.workouts(workout_id),
  workout_title text NOT NULL,
  workout_start timestamptz NOT NULL,
  trainer_name text,
  refund_amount numeric(8,2) NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS member_notifications_unread ON public.member_notifications(member_id) WHERE read_at IS NULL;

GRANT SELECT ON public.member_notifications TO authenticated;
GRANT ALL ON public.member_notifications TO service_role;
ALTER TABLE public.member_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read own notifications" ON public.member_notifications;
CREATE POLICY "Members read own notifications" ON public.member_notifications
  FOR SELECT TO authenticated USING (member_id = public.current_member_id());

-- Members can only mark their OWN messages as read
CREATE OR REPLACE FUNCTION public.dismiss_notification(p_notification_id bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.member_notifications SET read_at = now()
  WHERE notification_id = p_notification_id AND member_id = public.current_member_id() AND read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_all_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.member_notifications SET read_at = now()
  WHERE member_id = public.current_member_id() AND read_at IS NULL;
$$;

-- 3) Nobody can book or join the waitlist of a cancelled workout (covers book_workout, book_session,
--    the waitlist auto-promote and anything added later, without rewriting those functions).
CREATE OR REPLACE FUNCTION public.trg_block_booking_on_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'upcoming'
     AND EXISTS (SELECT 1 FROM public.workouts WHERE workout_id = NEW.workout_id AND cancelled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This workout was cancelled by the trainer.';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS bookings_block_cancelled_workout ON public.bookings;
CREATE TRIGGER bookings_block_cancelled_workout
BEFORE INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_block_booking_on_cancelled();

CREATE OR REPLACE FUNCTION public.trg_block_waitlist_on_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workouts WHERE workout_id = NEW.workout_id AND cancelled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This workout was cancelled by the trainer.';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS waitlist_block_cancelled_workout ON public.waitlist;
CREATE TRIGGER waitlist_block_cancelled_workout
BEFORE INSERT ON public.waitlist
FOR EACH ROW EXECUTE FUNCTION public.trg_block_waitlist_on_cancelled();

-- 3b) join_waitlist from 0004 plus ONE new line: say "cancelled" instead of "still has free spots, book it".
--     (The trigger above already blocks the insert; this only gives a correct message.)
CREATE OR REPLACE FUNCTION public.join_waitlist(p_member_id bigint, p_workout_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE w public.workouts; taken int; wid bigint;
BEGIN
  IF p_member_id IS DISTINCT FROM public.current_member_id() THEN RAISE EXCEPTION 'You can only join the waitlist for your own account.'; END IF;
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found.'; END IF;
  IF w.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'This workout was cancelled by the trainer.'; END IF;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This session has already started.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM members WHERE member_id = p_member_id) THEN RAISE EXCEPTION 'Member not found.'; END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE member_id = p_member_id AND workout_id = p_workout_id AND status <> 'cancelled')
    THEN RAISE EXCEPTION 'You have already booked this session.'; END IF;
  SELECT count(*) INTO taken FROM bookings WHERE workout_id = p_workout_id AND status <> 'cancelled';
  IF taken < w.capacity THEN RAISE EXCEPTION 'This session still has free spots. Book it instead.'; END IF;
  IF EXISTS (SELECT 1 FROM waitlist WHERE member_id = p_member_id AND workout_id = p_workout_id)
    THEN RAISE EXCEPTION 'You are already on the waitlist for this session.'; END IF;
  INSERT INTO waitlist (member_id, workout_id) VALUES (p_member_id, p_workout_id) RETURNING waitlist_id INTO wid;
  INSERT INTO audit_log (member_id, action, details) VALUES (p_member_id, 'join_waitlist', 'workout ' || p_workout_id);
  RETURN wid;
END
$function$;

-- 4) The cancel itself. All or nothing: if anything fails, nothing is cancelled and nobody is refunded.
CREATE OR REPLACE FUNCTION public.trainer_cancel_workout(p_workout_id bigint, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tid bigint := public.current_trainer_id();
  w public.workouts;
  tname text;
  reason text := NULLIF(btrim(p_reason), '');
  b record;
  q record;
  refunded int := 0;
  total numeric := 0;
  waiting int := 0;
BEGIN
  IF tid IS NULL THEN RAISE EXCEPTION 'Trainers only.'; END IF;
  IF reason IS NOT NULL AND char_length(reason) > 200 THEN RAISE EXCEPTION 'Reason must be 200 characters or fewer.'; END IF;

  -- Lock the workout first (same order as booking), so nobody can book while we cancel
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found.'; END IF;
  IF w.trainer_id IS DISTINCT FROM tid THEN RAISE EXCEPTION 'You can only cancel your own workouts.'; END IF;
  IF w.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'This workout is already cancelled.'; END IF;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This workout has already started and can no longer be cancelled.'; END IF;

  SELECT full_name INTO tname FROM trainers WHERE trainer_id = tid;
  UPDATE workouts SET cancelled_at = now(), cancel_reason = reason WHERE workout_id = w.workout_id;

  -- Waitlist FIRST. Cancelling a booking normally promotes the next person on the waitlist
  -- (trigger from 0009); with the waitlist already empty nobody can be moved into this workout.
  FOR q IN SELECT waitlist_id, member_id FROM waitlist WHERE workout_id = w.workout_id ORDER BY waitlist_id LOOP
    DELETE FROM waitlist WHERE waitlist_id = q.waitlist_id;
    INSERT INTO member_notifications (member_id, kind, workout_id, workout_title, workout_start, trainer_name, refund_amount, reason)
      VALUES (q.member_id, 'waitlist_cancelled', w.workout_id, w.title, w.start_time, tname, 0, reason);
    waiting := waiting + 1;
  END LOOP;

  -- Every active booking: cancel, refund the deposit in full, record it, tell the member
  FOR b IN SELECT * FROM bookings WHERE workout_id = w.workout_id AND status = 'upcoming' ORDER BY booking_id FOR UPDATE LOOP
    UPDATE bookings SET status = 'cancelled' WHERE booking_id = b.booking_id;
    UPDATE members SET wallet_balance = wallet_balance + b.deposit_paid WHERE member_id = b.member_id;
    INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
      VALUES (b.member_id, b.booking_id, 'refund', b.deposit_paid, now());
    INSERT INTO audit_log (member_id, action, details)
      VALUES (b.member_id, 'trainer_cancel_workout',
              'booking ' || b.booking_id || ', workout ' || w.workout_id || ', refund ' || b.deposit_paid || ', by ' || auth.uid());
    INSERT INTO member_notifications (member_id, kind, workout_id, workout_title, workout_start, trainer_name, refund_amount, reason)
      VALUES (b.member_id, 'workout_cancelled', w.workout_id, w.title, w.start_time, tname, b.deposit_paid, reason);
    refunded := refunded + 1;
    total := total + b.deposit_paid;
  END LOOP;

  INSERT INTO audit_log (member_id, action, details)
    VALUES (NULL, 'trainer_cancel_workout_summary',
            'workout ' || w.workout_id || ', trainer ' || tid || ', refunded ' || refunded || ' bookings (' || total || '), waitlist removed ' || waiting || ', by ' || auth.uid());

  RETURN jsonb_build_object('refunded', refunded, 'total', total, 'waitlist', waiting);
END
$function$;

-- 5) trainer_create_workout again, now ignoring cancelled workouts in the "already have a workout then" check,
--    so a trainer can reuse the slot of a cancelled class. (Same function as 0012 plus one condition.)
CREATE OR REPLACE FUNCTION public.trainer_create_workout(
  p_title text, p_category text, p_start timestamptz, p_duration integer,
  p_capacity integer, p_price numeric, p_deposit numeric, p_description text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE tid bigint := public.current_trainer_id(); t text := btrim(COALESCE(p_title, '')); wid bigint;
BEGIN
  IF tid IS NULL THEN RAISE EXCEPTION 'Trainers only.'; END IF;
  IF char_length(t) < 3 OR char_length(t) > 80 THEN RAISE EXCEPTION 'Title must be 3-80 characters.'; END IF;
  IF p_category NOT IN ('Group Class', 'Personal Training') THEN RAISE EXCEPTION 'Choose Group Class or Personal Training.'; END IF;
  IF p_start IS NULL OR p_start <= now() THEN RAISE EXCEPTION 'Start time must be in the future.'; END IF;
  IF p_duration IS NULL OR p_duration < 15 OR p_duration > 240 THEN RAISE EXCEPTION 'Duration must be 15-240 minutes.'; END IF;
  IF p_capacity IS NULL OR p_capacity < 1 OR p_capacity > 50 THEN RAISE EXCEPTION 'Capacity must be 1-50.'; END IF;
  IF p_price IS NULL OR p_price <= 0 OR p_price > 500 THEN RAISE EXCEPTION 'Price must be above 0 and at most 500.'; END IF;
  IF p_deposit IS NULL OR p_deposit < 0 OR p_deposit > p_price THEN RAISE EXCEPTION 'Deposit must be between 0 and the price.'; END IF;
  IF char_length(COALESCE(p_description, '')) > 500 THEN RAISE EXCEPTION 'Description must be 500 characters or fewer.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workouts w
    WHERE w.trainer_id = tid AND w.cancelled_at IS NULL
      AND w.start_time < p_start + make_interval(mins => p_duration)
      AND w.start_time + make_interval(mins => w.duration_minutes) > p_start
  ) THEN RAISE EXCEPTION 'You already have a workout at that time.'; END IF;
  INSERT INTO public.workouts (trainer_id, title, category, start_time, duration_minutes, capacity, price, deposit_amount, description)
    VALUES (tid, t, p_category, p_start, p_duration, p_capacity, p_price, p_deposit, NULLIF(btrim(p_description), ''))
    RETURNING workout_id INTO wid;
  INSERT INTO public.audit_log (member_id, action, details)
    VALUES (NULL, 'trainer_create_workout', 'workout ' || wid || ', trainer ' || tid || ', by ' || auth.uid());
  RETURN wid;
END
$function$;

REVOKE ALL ON FUNCTION
  public.trainer_cancel_workout(bigint, text), public.dismiss_notification(bigint), public.dismiss_all_notifications(),
  public.trainer_create_workout(text, text, timestamptz, integer, integer, numeric, numeric, text),
  public.trg_block_booking_on_cancelled(), public.trg_block_waitlist_on_cancelled()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_waitlist(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.trainer_cancel_workout(bigint, text), public.dismiss_notification(bigint), public.dismiss_all_notifications(),
  public.trainer_create_workout(text, text, timestamptz, integer, integer, numeric, numeric, text)
  TO authenticated;
