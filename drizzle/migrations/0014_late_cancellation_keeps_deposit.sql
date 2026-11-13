-- Late cancellation: a booking can be cancelled any time before the session starts.
--   * more than 12 hours before start  -> full deposit refund (same as before)
--   * 12 hours or less before start    -> the booking is cancelled and the spot is released,
--                                         but the deposit is KEPT (no refund, no wallet transaction)
-- The website already shows this rule (UI change in branch kuat-tests); this migration makes the
-- database enforce it. Before this migration cancel_booking() rejected every cancellation
-- made 12 hours or less before the start.

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE b public.bookings; w public.workouts; waiting int; refundable boolean;
BEGIN
  SELECT * INTO b FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'upcoming' THEN RAISE EXCEPTION 'This booking can no longer be cancelled.'; END IF;
  IF b.member_id IS DISTINCT FROM public.current_member_id() THEN RAISE EXCEPTION 'You can only cancel your own bookings.'; END IF;
  SELECT * INTO w FROM workouts WHERE workout_id = b.workout_id;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This session has already started.'; END IF;

  refundable := (w.start_time - now() > interval '12 hours');

  -- the AFTER UPDATE trigger from migration 0009 promotes the next person from the waitlist
  UPDATE bookings SET status = 'cancelled' WHERE booking_id = b.booking_id;

  IF refundable THEN
    UPDATE members SET wallet_balance = wallet_balance + b.deposit_paid WHERE member_id = b.member_id;
    INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
      VALUES (b.member_id, b.booking_id, 'refund', b.deposit_paid, now());
    INSERT INTO audit_log (member_id, action, details)
      VALUES (b.member_id, 'cancel_booking', 'booking ' || b.booking_id || ', refund ' || b.deposit_paid);
  ELSE
    INSERT INTO audit_log (member_id, action, details)
      VALUES (b.member_id, 'cancel_booking_late', 'booking ' || b.booking_id || ', deposit kept ' || b.deposit_paid);
  END IF;

  SELECT count(*) INTO waiting FROM waitlist WHERE workout_id = b.workout_id;
  IF waiting > 0 THEN
    INSERT INTO audit_log (member_id, action, details)
      VALUES (NULL, 'waitlist_spot_freed', 'workout ' || b.workout_id || ', ' || waiting || ' waiting');
  END IF;
END
$function$;
