-- Uses the real photos in /public/trainers/ (maya-torres.png, liam-chen.png, ...).
-- File name = the trainer's slug. Replaces the placeholder avatars from the earlier version of this file,
-- but never overwrites a photo link a trainer set themselves.
UPDATE public.trainers
SET photo_url = '/trainers/' || slug || '.png'
WHERE slug IN ('maya-torres', 'liam-chen', 'jordan-blake', 'ava-patel', 'marcus-reed', 'sofia-grant')
  AND (photo_url IS NULL OR photo_url LIKE '/trainers/trainer-%');
