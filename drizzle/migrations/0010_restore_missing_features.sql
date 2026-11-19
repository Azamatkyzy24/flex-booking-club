-- ===== 0009: waitlist auto-promote =====
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
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND OR w.start_time <= now() THEN
    RETURN 0;
  END IF;
  FOR cand IN
    SELECT waitlist_id, member_id
    FROM waitlist
    WHERE workout_id = p_workout_id
    ORDER BY created_at, waitlist_id
  LOOP
    SELECT count(*) INTO taken
      FROM bookings
      WHERE workout_id = p_workout_id AND status <> 'cancelled';
    EXIT WHEN taken >= w.capacity;
    SELECT * INTO m FROM members WHERE member_id = cand.member_id FOR UPDATE;
    IF NOT FOUND THEN
      DELETE FROM waitlist WHERE waitlist_id = cand.waitlist_id;
      CONTINUE;
    END IF;
    SELECT * INTO existing
      FROM bookings
      WHERE member_id = cand.member_id AND workout_id = p_workout_id;
    IF FOUND AND existing.status <> 'cancelled' THEN
      DELETE FROM waitlist WHERE waitlist_id = cand.waitlist_id;
      CONTINUE;
    END IF;
    IF m.wallet_balance < w.deposit_amount THEN
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

REVOKE ALL ON FUNCTION public.promote_from_waitlist(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_promote_on_booking_cancel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_promote_on_capacity_increase() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_from_waitlist(bigint) TO service_role;

-- ===== 0012: trainer portal functions =====
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS trainers_user_id_unique ON public.trainers(user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_trainer_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT trainer_id FROM public.trainers WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_trainer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.current_trainer_id() IS NOT NULL;
$$;

UPDATE public.trainers t SET user_id = u.id
FROM auth.users u
WHERE t.user_id IS NULL AND t.email IS NOT NULL AND lower(u.email) = lower(t.email)
  AND NOT EXISTS (SELECT 1 FROM public.trainers x WHERE x.user_id = u.id);

INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'trainer' FROM public.trainers WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.members (full_name, email, membership_type, wallet_balance, user_id)
  VALUES (
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    'Flex (pay per session)',
    0,
    NEW.id
  )
  ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  UPDATE public.trainers SET user_id = NEW.id
    WHERE user_id IS NULL AND email IS NOT NULL AND lower(email) = lower(NEW.email);
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'trainer') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.trainer_workout_stats()
RETURNS TABLE(workout_id bigint, booked bigint, waitlisted bigint, deposits numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.workout_id,
    (SELECT count(*) FROM public.bookings b WHERE b.workout_id = w.workout_id AND b.status <> 'cancelled'),
    (SELECT count(*) FROM public.waitlist q WHERE q.workout_id = w.workout_id),
    COALESCE((SELECT sum(b.deposit_paid) FROM public.bookings b WHERE b.workout_id = w.workout_id AND b.status <> 'cancelled'), 0)
  FROM public.workouts w
  WHERE w.trainer_id = public.current_trainer_id()
$$;

CREATE OR REPLACE FUNCTION public.trainer_roster(p_workout_id bigint)
RETURNS TABLE(booking_id bigint, member_name text, status text, booked_at timestamptz, deposit_paid numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.booking_id, m.full_name, b.status, b.booked_at, b.deposit_paid
  FROM public.bookings b
  JOIN public.members m ON m.member_id = b.member_id
  JOIN public.workouts w ON w.workout_id = b.workout_id
  WHERE b.workout_id = p_workout_id
    AND w.trainer_id = public.current_trainer_id()
    AND b.status <> 'cancelled'
  ORDER BY m.full_name
$$;

CREATE OR REPLACE FUNCTION public.trainer_reviews()
RETURNS TABLE(review_id bigint, workout_title text, rating integer, comment text, created_at timestamptz, reviewer text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.review_id, w.title, r.rating, r.comment, r.created_at, split_part(m.full_name, ' ', 1)
  FROM public.reviews r
  JOIN public.bookings b ON b.booking_id = r.booking_id
  JOIN public.workouts w ON w.workout_id = b.workout_id
  JOIN public.members m ON m.member_id = b.member_id
  WHERE w.trainer_id = public.current_trainer_id()
  ORDER BY r.created_at DESC
  LIMIT 50
$$;

CREATE OR REPLACE FUNCTION public.trainer_update_profile(
  p_professional_title text, p_biography text, p_philosophy text,
  p_expertise text[], p_certifications text[], p_photo_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE tid bigint := public.current_trainer_id(); photo text := NULLIF(btrim(p_photo_url), '');
BEGIN
  IF tid IS NULL THEN RAISE EXCEPTION 'Trainers only.'; END IF;
  IF char_length(COALESCE(p_professional_title, '')) > 80 THEN RAISE EXCEPTION 'Title must be 80 characters or fewer.'; END IF;
  IF char_length(COALESCE(p_biography, '')) > 1000 THEN RAISE EXCEPTION 'Biography must be 1000 characters or fewer.'; END IF;
  IF char_length(COALESCE(p_philosophy, '')) > 300 THEN RAISE EXCEPTION 'Philosophy must be 300 characters or fewer.'; END IF;
  IF COALESCE(array_length(p_expertise, 1), 0) > 8 THEN RAISE EXCEPTION 'Add at most 8 areas of expertise.'; END IF;
  IF COALESCE(array_length(p_certifications, 1), 0) > 8 THEN RAISE EXCEPTION 'Add at most 8 certifications.'; END IF;
  IF photo IS NOT NULL AND photo !~ '^(https://|/)' THEN RAISE EXCEPTION 'Photo link must start with https:// or /.'; END IF;
  UPDATE public.trainers SET
    professional_title = NULLIF(btrim(p_professional_title), ''),
    biography = NULLIF(btrim(p_biography), ''),
    philosophy = NULLIF(btrim(p_philosophy), ''),
    expertise = COALESCE(p_expertise, '{}'),
    certifications = COALESCE(p_certifications, '{}'),
    photo_url = photo
  WHERE trainer_id = tid;
  INSERT INTO public.audit_log (member_id, action, details)
    VALUES (NULL, 'trainer_update_profile', 'trainer ' || tid || ', by ' || auth.uid());
END
$function$;

-- ===== 0013: trainer photos =====
UPDATE public.trainers
SET photo_url = '/trainers/' || slug || '.png'
WHERE slug IN ('maya-torres', 'liam-chen', 'jordan-blake', 'ava-patel', 'marcus-reed', 'sofia-grant')
  AND (photo_url IS NULL OR photo_url LIKE '/trainers/trainer-%');

-- ===== 0014: late cancellation keeps deposit =====
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

-- ===== 0015: trainer cancel workout + notifications =====
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS cancel_reason text;

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
  SELECT count(*) INTO taken FROM bookings WHERE member_id = p_member_id AND workout_id = p_workout_id AND status <> 'cancelled';
  IF taken < w.capacity THEN RAISE EXCEPTION 'This session still has free spots. Book it instead.'; END IF;
  IF EXISTS (SELECT 1 FROM waitlist WHERE member_id = p_member_id AND workout_id = p_workout_id)
    THEN RAISE EXCEPTION 'You are already on the waitlist for this session.'; END IF;
  INSERT INTO waitlist (member_id, workout_id) VALUES (p_member_id, p_workout_id) RETURNING waitlist_id INTO wid;
  INSERT INTO audit_log (member_id, action, details) VALUES (p_member_id, 'join_waitlist', 'workout ' || p_workout_id);
  RETURN wid;
END
$function$;

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
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found.'; END IF;
  IF w.trainer_id IS DISTINCT FROM tid THEN RAISE EXCEPTION 'You can only cancel your own workouts.'; END IF;
  IF w.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'This workout is already cancelled.'; END IF;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This workout has already started and can no longer be cancelled.'; END IF;
  SELECT full_name INTO tname FROM trainers WHERE trainer_id = tid;
  UPDATE workouts SET cancelled_at = now(), cancel_reason = reason WHERE workout_id = w.workout_id;
  FOR q IN SELECT waitlist_id, member_id FROM waitlist WHERE workout_id = w.workout_id ORDER BY waitlist_id LOOP
    DELETE FROM waitlist WHERE waitlist_id = q.waitlist_id;
    INSERT INTO member_notifications (member_id, kind, workout_id, workout_title, workout_start, trainer_name, refund_amount, reason)
      VALUES (q.member_id, 'waitlist_cancelled', w.workout_id, w.title, w.start_time, tname, 0, reason);
    waiting := waiting + 1;
  END LOOP;
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
GRANT EXECUTE ON FUNCTION
  public.current_trainer_id(), public.is_trainer(), public.trainer_workout_stats(), public.trainer_roster(bigint),
  public.trainer_reviews(), public.trainer_update_profile(text, text, text, text[], text[], text)
  TO authenticated;