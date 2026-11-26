-- Members can upload a profile photo.
--   * the picture is stored in Supabase Storage, bucket "avatars", in the folder <user id>/
--   * members.avatar_url keeps the public link to it (NULL = show initials)
--   * only JPG / PNG / WEBP up to 2 MB, and a member can only write to their own folder

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Avatars are public" ON storage.objects;
CREATE POLICY "Avatars are public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Members upload own avatar" ON storage.objects;
CREATE POLICY "Members upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Members replace own avatar" ON storage.objects;
CREATE POLICY "Members replace own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Members delete own avatar" ON storage.objects;
CREATE POLICY "Members delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Saves (or removes, with NULL) the photo link. Only a link into the member's own avatars folder is accepted,
-- so nobody can point their profile at someone else's picture or at another website.
CREATE OR REPLACE FUNCTION public.update_member_avatar(p_avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mid bigint := public.current_member_id();
  url text := NULLIF(btrim(p_avatar_url), '');
BEGIN
  IF mid IS NULL THEN RAISE EXCEPTION 'Please log in.'; END IF;
  IF url IS NOT NULL AND (
       url !~ '^https://'
       OR position('/storage/v1/object/public/avatars/' || auth.uid()::text || '/' IN url) = 0
     ) THEN
    RAISE EXCEPTION 'Upload the photo from your profile page.';
  END IF;

  UPDATE public.members SET avatar_url = url WHERE member_id = mid;
  INSERT INTO public.audit_log (member_id, action, details)
    VALUES (mid, 'update_member_avatar', CASE WHEN url IS NULL THEN 'photo removed' ELSE 'photo changed' END);
END
$function$;

REVOKE ALL ON FUNCTION public.update_member_avatar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_avatar(text) TO authenticated;
