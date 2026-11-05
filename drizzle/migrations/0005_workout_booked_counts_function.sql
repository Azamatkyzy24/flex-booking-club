-- Spots-left counting for all members without exposing other members' bookings
CREATE OR REPLACE FUNCTION public.workout_booked_counts()
RETURNS TABLE(workout_id bigint, booked bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT b.workout_id, count(*)::bigint
  FROM public.bookings b
  WHERE b.status <> 'cancelled'
  GROUP BY b.workout_id
$function$;

GRANT EXECUTE ON FUNCTION public.workout_booked_counts() TO authenticated;