-- Trainer accounts and the trainer portal.
-- Run AFTER 0011. Safe to run more than once.
--
-- How a trainer account works:
--   * A trainer is a row in public.trainers. Its email column decides who may become that trainer.
--   * When someone signs up (or already signed up) with that same email, the account is linked
--     (trainers.user_id) and gets the 'trainer' role. They stay a normal member too, so booking still works.
--   * Nobody can make themselves a trainer from the app: the link is created only here, in the database.
--   * Like the rest of the project, the app never writes tables directly. Trainer actions are
--     security-definer functions that first check "is the caller a trainer?" and only touch that trainer's own data.

ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS trainers_user_id_unique ON public.trainers(user_id) WHERE user_id IS NOT NULL;

-- 1) Who is the current user as a trainer?
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

-- 2) Link accounts that already exist (email match, case-insensitive)
UPDATE public.trainers t SET user_id = u.id
FROM auth.users u
WHERE t.user_id IS NULL AND t.email IS NOT NULL AND lower(u.email) = lower(t.email)
  AND NOT EXISTS (SELECT 1 FROM public.trainers x WHERE x.user_id = u.id);

INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'trainer' FROM public.trainers WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3) Link new signups. Same as the 0004 trigger function, plus the trainer link at the end.
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

-- 4) Per-workout numbers for the trainer's own classes (bookings, waitlist, deposits collected)
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

-- 5) Who is coming to one of my classes (names only: no emails, no wallet data)
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

-- 6) Reviews of my classes (first name of the reviewer only)
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

-- 7) Edit my own public profile
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

-- 8) Schedule a new workout for myself. Existing workouts, bookings and payments are never touched.
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
    WHERE w.trainer_id = tid
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
  public.current_trainer_id(), public.is_trainer(), public.trainer_workout_stats(), public.trainer_roster(bigint),
  public.trainer_reviews(), public.trainer_update_profile(text, text, text, text[], text[], text),
  public.trainer_create_workout(text, text, timestamptz, integer, integer, numeric, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.current_trainer_id(), public.is_trainer(), public.trainer_workout_stats(), public.trainer_roster(bigint),
  public.trainer_reviews(), public.trainer_update_profile(text, text, text, text[], text[], text),
  public.trainer_create_workout(text, text, timestamptz, integer, integer, numeric, numeric, text)
  TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- HOW TO TRY IT (run these by hand, they are not part of the migration):
--   1) Put the email of a test account on a trainer row:
--        UPDATE public.trainers SET email = 'my.test.trainer@gmail.com' WHERE trainer_id = 1;
--   2) Register an account with that email (or, if it already exists, run the whole file again:
--      step 2 above links existing accounts).
--   3) Log in with it: you land on /trainer.
-- ---------------------------------------------------------------------------------------------
