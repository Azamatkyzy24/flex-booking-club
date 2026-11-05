CREATE TABLE public.waitlist (
  waitlist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id bigint NOT NULL REFERENCES public.members(member_id),
  workout_id bigint NOT NULL REFERENCES public.workouts(workout_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, workout_id)
);
CREATE TABLE public.audit_log (
  log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id bigint REFERENCES public.members(member_id),
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.waitlist TO anon, authenticated;
GRANT ALL ON public.waitlist, public.audit_log TO service_role;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read waitlist (demo)" ON public.waitlist FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.join_waitlist(p_member_id bigint, p_workout_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE w public.workouts; taken int; wid bigint;
BEGIN
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found.'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.book_workout(p_member_id bigint, p_workout_id bigint)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE w public.workouts; m public.members; taken int; existing public.bookings; bid bigint;
BEGIN
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found.'; END IF;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This session has already started.'; END IF;
  SELECT * INTO m FROM members WHERE member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
  SELECT * INTO existing FROM bookings WHERE member_id = p_member_id AND workout_id = p_workout_id;
  IF FOUND AND existing.status <> 'cancelled' THEN RAISE EXCEPTION 'You have already booked this session.'; END IF;
  SELECT count(*) INTO taken FROM bookings WHERE workout_id = p_workout_id AND status <> 'cancelled';
  IF taken >= w.capacity THEN RAISE EXCEPTION 'This session is full.'; END IF;
  IF m.wallet_balance < w.deposit_amount THEN RAISE EXCEPTION 'Insufficient funds. Please top up your wallet.'; END IF;
  IF existing.booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'upcoming', deposit_paid = w.deposit_amount, booked_at = now()
      WHERE booking_id = existing.booking_id RETURNING booking_id INTO bid;
  ELSE
    INSERT INTO bookings (member_id, workout_id, status, deposit_paid, booked_at)
      VALUES (p_member_id, p_workout_id, 'upcoming', w.deposit_amount, now()) RETURNING booking_id INTO bid;
  END IF;
  UPDATE members SET wallet_balance = wallet_balance - w.deposit_amount WHERE member_id = p_member_id;
  INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
    VALUES (p_member_id, bid, 'deposit', -w.deposit_amount, now());
  DELETE FROM waitlist WHERE member_id = p_member_id AND workout_id = p_workout_id;
  INSERT INTO audit_log (member_id, action, details)
    VALUES (p_member_id, 'book_workout', 'booking ' || bid || ', workout ' || p_workout_id || ', deposit ' || w.deposit_amount);
  RETURN bid;
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE b public.bookings; w public.workouts; waiting int;
BEGIN
  SELECT * INTO b FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'upcoming' THEN RAISE EXCEPTION 'This booking can no longer be cancelled.'; END IF;
  SELECT * INTO w FROM workouts WHERE workout_id = b.workout_id;
  IF w.start_time - now() <= interval '12 hours' THEN RAISE EXCEPTION 'This booking can no longer be cancelled.'; END IF;
  UPDATE bookings SET status = 'cancelled' WHERE booking_id = b.booking_id;
  UPDATE members SET wallet_balance = wallet_balance + b.deposit_paid WHERE member_id = b.member_id;
  INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
    VALUES (b.member_id, b.booking_id, 'refund', b.deposit_paid, now());
  INSERT INTO audit_log (member_id, action, details)
    VALUES (b.member_id, 'cancel_booking', 'booking ' || b.booking_id || ', refund ' || b.deposit_paid);
  SELECT count(*) INTO waiting FROM waitlist WHERE workout_id = b.workout_id;
  IF waiting > 0 THEN
    INSERT INTO audit_log (member_id, action, details)
      VALUES (NULL, 'waitlist_spot_freed', 'workout ' || b.workout_id || ', ' || waiting || ' waiting');
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.top_up_wallet(p_member_id bigint, p_amount numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF p_amount NOT IN (20, 50, 100) THEN RAISE EXCEPTION 'Invalid top-up amount.'; END IF;
  UPDATE members SET wallet_balance = wallet_balance + p_amount WHERE member_id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
  INSERT INTO wallet_transactions (member_id, type, amount, created_at) VALUES (p_member_id, 'top_up', p_amount, now());
  INSERT INTO audit_log (member_id, action, details) VALUES (p_member_id, 'top_up_wallet', 'amount ' || p_amount);
END $function$;

GRANT EXECUTE ON FUNCTION public.join_waitlist(bigint, bigint) TO anon, authenticated;