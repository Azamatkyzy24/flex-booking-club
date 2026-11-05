INSERT INTO public.members (full_name, email, membership_type, wallet_balance)
SELECT 'Sam Lee', 'sam.lee@example.com', 'Standard', 100
WHERE NOT EXISTS (SELECT 1 FROM public.members WHERE email = 'sam.lee@example.com');

INSERT INTO public.bookings (member_id, workout_id, status, deposit_paid, booked_at)
SELECT m.member_id, w.workout_id, 'upcoming', w.deposit_amount, now()
FROM public.members m, public.workouts w
WHERE m.email = 'sam.lee@example.com' AND w.title = 'Strength 1:1' AND w.start_time > now()
  AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.member_id = m.member_id AND b.workout_id = w.workout_id);

INSERT INTO public.wallet_transactions (member_id, booking_id, type, amount, created_at)
SELECT b.member_id, NULL, 'top_up', 100 + b.deposit_paid, now() - interval '1 minute'
FROM public.bookings b JOIN public.members m ON m.member_id = b.member_id
JOIN public.workouts w ON w.workout_id = b.workout_id
WHERE m.email = 'sam.lee@example.com' AND w.title = 'Strength 1:1';

INSERT INTO public.wallet_transactions (member_id, booking_id, type, amount, created_at)
SELECT b.member_id, b.booking_id, 'deposit', -b.deposit_paid, now()
FROM public.bookings b JOIN public.members m ON m.member_id = b.member_id
JOIN public.workouts w ON w.workout_id = b.workout_id
WHERE m.email = 'sam.lee@example.com' AND w.title = 'Strength 1:1';