CREATE OR REPLACE FUNCTION public.book_session(p_workout_id bigint, p_member_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE w public.workouts; m public.members; taken int; existing public.bookings; bid bigint;
BEGIN
  IF p_member_id IS DISTINCT FROM public.current_member_id() THEN RAISE EXCEPTION 'You can only book for your own account.'; END IF;
  -- Lock the workout row first: concurrent bookings for this session serialize here,
  -- so the loser re-reads the booking count only after the winner has committed.
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found.'; END IF;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This session has already started.'; END IF;
  SELECT * INTO m FROM members WHERE member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
  SELECT * INTO existing FROM bookings WHERE member_id = p_member_id AND workout_id = p_workout_id;
  IF FOUND AND existing.status <> 'cancelled' THEN RAISE EXCEPTION 'You have already booked this session.'; END IF;
  SELECT count(*) INTO taken FROM bookings WHERE workout_id = p_workout_id AND status <> 'cancelled';
  IF taken >= w.capacity THEN RAISE EXCEPTION 'SESSION_FULL'; END IF;
  IF m.wallet_balance < w.deposit_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
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
    VALUES (p_member_id, 'book_session', 'booking ' || bid || ', workout ' || p_workout_id || ', deposit ' || w.deposit_amount);
  RETURN bid;
END
$function$;

GRANT EXECUTE ON FUNCTION public.book_session(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_session(bigint, bigint) TO service_role;