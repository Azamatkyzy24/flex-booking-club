-- Members can edit their own profile (full name).
-- The email is the login and is changed through Supabase Auth, not here.
-- Same rules as validateMemberName() in src/lib/profile.ts.

CREATE OR REPLACE FUNCTION public.update_member_profile(p_full_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mid bigint := public.current_member_id();
  n text := regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
BEGIN
  IF mid IS NULL THEN RAISE EXCEPTION 'Please log in.'; END IF;
  IF char_length(n) < 2 OR char_length(n) > 60 THEN RAISE EXCEPTION 'Name must be 2-60 characters.'; END IF;
  IF n !~ '^[[:alpha:]][[:alpha:] ''.-]*$' THEN RAISE EXCEPTION 'Name can contain only letters, spaces, hyphens and apostrophes.'; END IF;

  UPDATE public.members SET full_name = n WHERE member_id = mid;
  INSERT INTO public.audit_log (member_id, action, details)
    VALUES (mid, 'update_member_profile', 'name changed');
END
$function$;

REVOKE ALL ON FUNCTION public.update_member_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_profile(text) TO authenticated;
