-- Course description + client reviews (feedback and a 1-5 rating after the session).
-- Follows the project convention: tables are read-only to the app, changes go through
-- security-definer functions (submit_review), cross-member reads go through
-- security-definer functions (workout_rating_summary, workout_reviews).

-- 1) Description for every workout (the "what is this course" text shown on cards)
ALTER TABLE public.workouts ADD COLUMN description text;

UPDATE public.workouts SET description = CASE title
  WHEN 'CrossFit WOD' THEN 'High-intensity workout of the day: functional movements, weights and cardio, scaled to your level.'
  WHEN 'HIIT Burn' THEN '45 minutes of short, intense intervals to burn calories and build endurance.'
  WHEN 'Power Yoga' THEN 'A dynamic yoga flow that builds strength, balance and flexibility.'
  WHEN 'Pilates Core' THEN 'Controlled exercises that strengthen the core and improve posture and stability.'
  WHEN 'Fat Loss Coaching' THEN 'One-on-one session with a trainer: a personal fat loss plan with training and nutrition guidance.'
  WHEN 'Strength 1:1' THEN 'Personal strength training: technique, progressive weights and a plan for your goals.'
  WHEN 'Spin Cycle' THEN 'Indoor cycling class with rhythm-based intervals for cardio endurance and leg strength.'
  WHEN 'Boxing Fundamentals' THEN 'Learn basic boxing technique: stance, punches and footwork, plus conditioning.'
  WHEN 'Mobility & Recovery' THEN 'Stretching and mobility work to improve flexibility and recover after hard training.'
  WHEN 'Sunrise Yoga' THEN 'A gentle morning yoga flow to wake up the body, improve flexibility and start the day calm.'
  WHEN 'HIIT Blast' THEN 'Short, fast high-intensity intervals that raise your heart rate and burn calories.'
  WHEN 'Mobility 1:1' THEN 'Personal mobility session: targeted stretching and movement drills tailored to your body.'
  WHEN 'Evening Pilates' THEN 'Evening Pilates class focused on core control, posture and releasing the tension of the day.'
  WHEN 'Morning Run Club' THEN 'Group run with a coach: steady pace, running technique and endurance for all levels.'
  WHEN 'Power Lifting PT' THEN 'Personal powerlifting coaching: squat, bench press and deadlift technique with progressive loading.'
  WHEN 'Aqua Aerobics' THEN 'Low-impact water workout that builds cardio fitness and strength while protecting your joints.'
  ELSE description
END;

-- 2) Reviews: one review per booking. The member and the workout are reached through
--    the booking, so no ID is stored twice. Rating is required, feedback text is optional.
CREATE TABLE public.reviews (
  review_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL UNIQUE REFERENCES public.bookings(booking_id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own reviews" ON public.reviews
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.bookings b
            WHERE b.booking_id = reviews.booking_id AND b.member_id = public.current_member_id())
  );

-- 3) Submit a review. Rules: own booking, not cancelled, session already finished,
--    rating 1-5, one review per booking, feedback up to 500 characters.
CREATE OR REPLACE FUNCTION public.submit_review(p_booking_id bigint, p_rating integer, p_comment text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE b public.bookings; w public.workouts; rid bigint; c text;
BEGIN
  SELECT * INTO b FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;
  IF b.member_id IS DISTINCT FROM public.current_member_id() THEN RAISE EXCEPTION 'You can only review your own bookings.'; END IF;
  IF b.status = 'cancelled' THEN RAISE EXCEPTION 'You cannot review a cancelled booking.'; END IF;
  SELECT * INTO w FROM workouts WHERE workout_id = b.workout_id;
  IF w.start_time + make_interval(mins => w.duration_minutes) > now() THEN RAISE EXCEPTION 'You can review a session after it has finished.'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Rating must be between 1 and 5.'; END IF;
  IF EXISTS (SELECT 1 FROM reviews WHERE booking_id = p_booking_id) THEN RAISE EXCEPTION 'You have already reviewed this session.'; END IF;
  c := NULLIF(btrim(p_comment), '');
  IF c IS NOT NULL AND char_length(c) > 500 THEN RAISE EXCEPTION 'Feedback must be 500 characters or fewer.'; END IF;
  INSERT INTO reviews (booking_id, rating, comment) VALUES (p_booking_id, p_rating, c) RETURNING review_id INTO rid;
  INSERT INTO audit_log (member_id, action, details)
    VALUES (b.member_id, 'submit_review', 'booking ' || b.booking_id || ', rating ' || p_rating);
  RETURN rid;
END
$function$;

-- 4) Average rating of a course. A course = same title and trainer, so upcoming sessions
--    show the rating earned by earlier sessions of the same class. Computed, never stored.
CREATE OR REPLACE FUNCTION public.workout_rating_summary()
RETURNS TABLE(workout_id bigint, avg_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.workout_id, round(avg(r.rating)::numeric, 1), count(r.review_id)::bigint
  FROM public.workouts w
  JOIN public.workouts w2 ON w2.title = w.title AND w2.trainer_id = w.trainer_id
  JOIN public.bookings b ON b.workout_id = w2.workout_id
  JOIN public.reviews r ON r.booking_id = b.booking_id
  GROUP BY w.workout_id
$function$;

-- 5) Latest reviews of a course (first name only, so other members' bookings stay private)
CREATE OR REPLACE FUNCTION public.workout_reviews(p_workout_id bigint)
RETURNS TABLE(review_id bigint, rating integer, comment text, created_at timestamptz, reviewer text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.review_id, r.rating, r.comment, r.created_at, split_part(m.full_name, ' ', 1)
  FROM public.workouts w
  JOIN public.workouts w2 ON w2.title = w.title AND w2.trainer_id = w.trainer_id
  JOIN public.bookings b ON b.workout_id = w2.workout_id
  JOIN public.reviews r ON r.booking_id = b.booking_id
  JOIN public.members m ON m.member_id = b.member_id
  WHERE w.workout_id = p_workout_id
  ORDER BY r.created_at DESC
  LIMIT 20
$function$;

REVOKE ALL ON FUNCTION public.submit_review(bigint, integer, text), public.workout_rating_summary(), public.workout_reviews(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review(bigint, integer, text), public.workout_rating_summary(), public.workout_reviews(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review(bigint, integer, text), public.workout_rating_summary(), public.workout_reviews(bigint) TO service_role;

-- 6) One demo review for Alex's seeded completed booking, so the rating is visible in the demo.
INSERT INTO public.reviews (booking_id, rating, comment)
SELECT b.booking_id, 5, 'Great energy, the trainer kept the pace motivating.'
FROM public.bookings b
JOIN public.members m ON m.member_id = b.member_id AND m.email = 'alex.morgan@example.com'
JOIN public.workouts w ON w.workout_id = b.workout_id AND w.title = 'Spin Cycle'
WHERE b.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.booking_id)
ORDER BY b.booking_id
LIMIT 1;
