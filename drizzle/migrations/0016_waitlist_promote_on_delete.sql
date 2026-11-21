-- 0016 (run AFTER 0009 and 0010). Safe to run more than once.
-- Part 1: admins can create sessions from the admin page.
-- Part 2: the waitlist is also promoted when an active booking row is DELETED
--         (0004 lets members delete their own bookings; that path never set status = 'cancelled').
 
-- ---------- Part 1: admin_create_workout ----------
CREATE OR REPLACE FUNCTION public.admin_create_workout(
  p_trainer_id bigint, p_title text, p_category text, p_start timestamptz, p_duration integer,
  p_capacity integer, p_price numeric, p_deposit numeric, p_description text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE t text := btrim(COALESCE(p_title, '')); wid bigint;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainers WHERE trainer_id = p_trainer_id) THEN RAISE EXCEPTION 'Choose a trainer.'; END IF;
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
    WHERE w.trainer_id = p_trainer_id AND w.cancelled_at IS NULL
      AND w.start_time < p_start + make_interval(mins => p_duration)
      AND w.start_time + make_interval(mins => w.duration_minutes) > p_start
  ) THEN RAISE EXCEPTION 'This trainer already has a workout at that time.'; END IF;
 
  INSERT INTO public.workouts (trainer_id, title, category, start_time, duration_minutes, capacity, price, deposit_amount, description)
    VALUES (p_trainer_id, t, p_category, p_start, p_duration, p_capacity, p_price, p_deposit, NULLIF(btrim(p_description), ''))
    RETURNING workout_id INTO wid;
  INSERT INTO public.audit_log (member_id, action, details)
    VALUES (NULL, 'admin_create_workout', 'workout ' || wid || ', trainer ' || p_trainer_id || ', by ' || auth.uid());
  RETURN wid;
END
$function$;
 
REVOKE ALL ON FUNCTION public.admin_create_workout(bigint, text, text, timestamptz, integer, integer, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_workout(bigint, text, text, timestamptz, integer, integer, numeric, numeric, text) TO authenticated;
 
-- ---------- Part 2: promote on booking DELETE ----------
CREATE OR REPLACE FUNCTION public.trg_promote_on_booking_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.promote_from_waitlist(OLD.workout_id);
  RETURN NULL;
END
$function$;
 
DROP TRIGGER IF EXISTS bookings_promote_on_delete ON public.bookings;
CREATE TRIGGER bookings_promote_on_delete
AFTER DELETE ON public.bookings
FOR EACH ROW
WHEN (OLD.status <> 'cancelled')
EXECUTE FUNCTION public.trg_promote_on_booking_delete();
 
REVOKE ALL ON FUNCTION public.trg_promote_on_booking_delete() FROM PUBLIC, anon, authenticated;
 