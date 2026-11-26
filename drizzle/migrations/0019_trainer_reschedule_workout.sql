-- Trainers can RESCHEDULE their own workouts. Everyone booked gets a message and chooses:
-- keep their spot at the new time, or get the deposit back. Run AFTER 0012 and 0014. Safe to run more than once.
--
-- THE RULES (change the values in trainer_reschedule_workout below if your team wants different ones):
--   * at least 48 hours before the class starts (min_notice)
--   * the new day must be between 1 and 7 days after the current day (gym time zone)
--   * a workout can be rescheduled only once
--   * the trainer must be free at the new time
-- Same style as the rest of the project: the app never writes tables directly, it calls
-- security-definer functions that check who is calling. Everything runs in one transaction.

-- 1) Remember that (and from when) a workout was moved
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS rescheduled_from timestamptz;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS reschedule_reason text;

-- 2) Two new kinds of member messages, and the extra columns they need
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.member_notifications'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%kind%' LOOP
    EXECUTE format('ALTER TABLE public.member_notifications DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.member_notifications ADD CONSTRAINT member_notifications_kind_check
  CHECK (kind IN ('workout_cancelled', 'waitlist_cancelled', 'workout_rescheduled', 'waitlist_rescheduled'));
ALTER TABLE public.member_notifications ADD COLUMN IF NOT EXISTS new_start timestamptz;
ALTER TABLE public.member_notifications ADD COLUMN IF NOT EXISTS booking_id bigint REFERENCES public.bookings(booking_id);

-- 3) If the trainer cancels a workout later, any unanswered "rescheduled" messages for it are closed
--    (the cancel message replaces them). Done with a trigger so trainer_cancel_workout stays untouched.
CREATE OR REPLACE FUNCTION public.trg_close_reschedule_notices_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.cancelled_at IS NOT NULL AND OLD.cancelled_at IS NULL THEN
    UPDATE public.member_notifications SET read_at = now()
    WHERE workout_id = NEW.workout_id AND kind IN ('workout_rescheduled', 'waitlist_rescheduled') AND read_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS workouts_close_reschedule_notices ON public.workouts;
CREATE TRIGGER workouts_close_reschedule_notices
  AFTER UPDATE OF cancelled_at ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_close_reschedule_notices_on_cancel();

-- 4) THE TRAINER SIDE: move the workout, tell everyone affected
CREATE OR REPLACE FUNCTION public.trainer_reschedule_workout(p_workout_id bigint, p_new_start timestamptz, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  min_notice constant interval := interval '48 hours';   -- how early a trainer must reschedule
  max_days   constant int := 7;                          -- the new day can be at most this many days later
  gym_tz     constant text := 'Asia/Almaty';             -- "day" means a calendar day in the gym's time zone
  tid bigint := public.current_trainer_id();
  w public.workouts;
  tname text;
  reason text := NULLIF(btrim(p_reason), '');
  old_day date; new_day date;
  b record;
  q record;
  notified int := 0;
  waiting int := 0;
BEGIN
  IF tid IS NULL THEN RAISE EXCEPTION 'Trainers only.'; END IF;
  IF p_new_start IS NULL THEN RAISE EXCEPTION 'Choose a new date and time.'; END IF;
  IF reason IS NOT NULL AND char_length(reason) > 200 THEN RAISE EXCEPTION 'Reason must be 200 characters or fewer.'; END IF;

  -- Lock the workout first (same order as booking and cancelling)
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found.'; END IF;
  IF w.trainer_id IS DISTINCT FROM tid THEN RAISE EXCEPTION 'You can only reschedule your own workouts.'; END IF;
  IF w.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'This workout is cancelled and cannot be rescheduled.'; END IF;
  IF w.rescheduled_from IS NOT NULL THEN
    RAISE EXCEPTION 'This workout was already rescheduled once. Cancel it instead if the new time does not work.';
  END IF;
  IF w.start_time < now() + min_notice THEN
    RAISE EXCEPTION 'Workouts can only be rescheduled at least 48 hours before they start.';
  END IF;

  old_day := (w.start_time AT TIME ZONE gym_tz)::date;
  new_day := (p_new_start AT TIME ZONE gym_tz)::date;
  IF new_day < old_day + 1 OR new_day > old_day + max_days THEN
    RAISE EXCEPTION 'Choose a new day between 1 and 7 days after the current one.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workouts o
    WHERE o.trainer_id = tid AND o.cancelled_at IS NULL AND o.workout_id <> w.workout_id
      AND o.start_time < p_new_start + make_interval(mins => w.duration_minutes)
      AND o.start_time + make_interval(mins => o.duration_minutes) > p_new_start
  ) THEN RAISE EXCEPTION 'You already have a workout at that time.'; END IF;

  SELECT full_name INTO tname FROM trainers WHERE trainer_id = tid;

  UPDATE workouts SET start_time = p_new_start, rescheduled_from = w.start_time, reschedule_reason = reason
    WHERE workout_id = w.workout_id;

  -- People on the waitlist: they are taken off it (so nobody is charged automatically for a time they
  -- never agreed to) and told they can join again for the new time.
  FOR q IN SELECT waitlist_id, member_id FROM waitlist WHERE workout_id = w.workout_id ORDER BY waitlist_id LOOP
    DELETE FROM waitlist WHERE waitlist_id = q.waitlist_id;
    INSERT INTO member_notifications (member_id, kind, workout_id, workout_title, workout_start, new_start, trainer_name, refund_amount, reason)
      VALUES (q.member_id, 'waitlist_rescheduled', w.workout_id, w.title, w.start_time, p_new_start, tname, 0, reason);
    waiting := waiting + 1;
  END LOOP;

  -- Everyone booked keeps their spot (and deposit) for now and gets a message with the choice
  FOR b IN SELECT * FROM bookings WHERE workout_id = w.workout_id AND status = 'upcoming' ORDER BY booking_id LOOP
    INSERT INTO member_notifications (member_id, kind, workout_id, booking_id, workout_title, workout_start, new_start, trainer_name, refund_amount, reason)
      VALUES (b.member_id, 'workout_rescheduled', w.workout_id, b.booking_id, w.title, w.start_time, p_new_start, tname, b.deposit_paid, reason);
    INSERT INTO audit_log (member_id, action, details)
      VALUES (b.member_id, 'trainer_reschedule_workout',
              'booking ' || b.booking_id || ', workout ' || w.workout_id || ', from ' || w.start_time || ' to ' || p_new_start || ', by ' || auth.uid());
    notified := notified + 1;
  END LOOP;

  INSERT INTO audit_log (member_id, action, details)
    VALUES (NULL, 'trainer_reschedule_workout_summary',
            'workout ' || w.workout_id || ', trainer ' || tid || ', from ' || w.start_time || ' to ' || p_new_start
            || ', members told ' || notified || ', waitlist removed ' || waiting || ', by ' || auth.uid());

  RETURN jsonb_build_object('notified', notified, 'waitlist', waiting);
END
$function$;

-- 5) THE MEMBER SIDE: keep the spot, or take the deposit back
--    p_keep = true  -> stay booked at the new time
--    p_keep = false -> booking cancelled, deposit refunded in full to the wallet (no matter how close the class is)
CREATE OR REPLACE FUNCTION public.respond_to_reschedule(p_notification_id bigint, p_keep boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mid bigint := public.current_member_id();
  n public.member_notifications;
  w public.workouts;
  bk public.bookings;
BEGIN
  IF mid IS NULL THEN RAISE EXCEPTION 'Members only.'; END IF;

  SELECT * INTO n FROM member_notifications
    WHERE notification_id = p_notification_id AND member_id = mid
      AND kind = 'workout_rescheduled' AND read_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This message is no longer available.'; END IF;

  IF p_keep THEN
    UPDATE member_notifications SET read_at = now() WHERE notification_id = n.notification_id;
    INSERT INTO audit_log (member_id, action, details)
      VALUES (mid, 'reschedule_kept', 'booking ' || n.booking_id || ', workout ' || n.workout_id);
    RETURN jsonb_build_object('result', 'kept');
  END IF;

  -- Refund: workout row first, then the booking (same lock order as everywhere else)
  SELECT * INTO w FROM workouts WHERE workout_id = n.workout_id FOR UPDATE;
  SELECT * INTO bk FROM bookings WHERE booking_id = n.booking_id AND member_id = mid FOR UPDATE;

  IF NOT FOUND OR bk.status <> 'upcoming' THEN
    -- the member already cancelled it some other way (or the class was cancelled): nothing left to refund
    UPDATE member_notifications SET read_at = now() WHERE notification_id = n.notification_id;
    RETURN jsonb_build_object('result', 'already_cancelled', 'amount', 0);
  END IF;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This class has already started.'; END IF;

  UPDATE bookings SET status = 'cancelled' WHERE booking_id = bk.booking_id;
  UPDATE members SET wallet_balance = wallet_balance + bk.deposit_paid WHERE member_id = mid;
  INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
    VALUES (mid, bk.booking_id, 'refund', bk.deposit_paid, now());
  INSERT INTO audit_log (member_id, action, details)
    VALUES (mid, 'reschedule_refund', 'booking ' || bk.booking_id || ', workout ' || w.workout_id || ', refund ' || bk.deposit_paid);
  UPDATE member_notifications SET read_at = now() WHERE notification_id = n.notification_id;

  RETURN jsonb_build_object('result', 'refunded', 'amount', bk.deposit_paid);
END
$function$;

REVOKE ALL ON FUNCTION
  public.trainer_reschedule_workout(bigint, timestamptz, text), public.respond_to_reschedule(bigint, boolean),
  public.trg_close_reschedule_notices_on_cancel()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.trainer_reschedule_workout(bigint, timestamptz, text), public.respond_to_reschedule(bigint, boolean)
  TO authenticated;