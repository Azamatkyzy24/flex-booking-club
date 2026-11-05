-- Seed workouts for the next 7 days (relative to migration time)
INSERT INTO public.workouts (trainer_id, title, category, start_time, duration_minutes, capacity, price, deposit_amount) VALUES
  (2, 'Sunrise Yoga', 'Group Class', now() + interval '26 hours', 60, 20, 15.00, 5.00),
  (1, 'HIIT Blast', 'Group Class', now() + interval '20 hours', 45, 2, 20.00, 8.00),
  (6, 'Mobility 1:1', 'Personal Training', now() + interval '10 hours', 60, 1, 40.00, 15.00),
  (2, 'Evening Pilates', 'Group Class', now() + interval '6 hours', 50, 15, 18.00, 6.00),
  (3, 'Morning Run Club', 'Group Class', now() + interval '3 hours', 40, 25, 10.00, 4.00),
  (3, 'Power Lifting PT', 'Personal Training', now() + interval '30 hours', 60, 1, 120.00, 60.00),
  (4, 'Aqua Aerobics', 'Group Class', now() + interval '48 hours', 45, 18, 14.00, 5.00),
  (5, 'Boxing Fundamentals', 'Group Class', now() + interval '72 hours', 60, 16, 22.00, 9.00);

-- Seed booking: Alex books HIIT Blast (capacity 2) so exactly 1 spot is left.
-- Mirrors the booking flow: deposit deducted from wallet + wallet_transactions row.
INSERT INTO public.bookings (member_id, workout_id, status, deposit_paid, booked_at)
SELECT 1, w.workout_id, 'upcoming', w.deposit_amount, now()
FROM public.workouts w WHERE w.title = 'HIIT Blast';

UPDATE public.members SET wallet_balance = wallet_balance - 8.00 WHERE member_id = 1;

INSERT INTO public.wallet_transactions (member_id, booking_id, type, amount, created_at)
SELECT 1, b.booking_id, 'deposit', -8.00, now()
FROM public.bookings b
JOIN public.workouts w ON w.workout_id = b.workout_id
WHERE b.member_id = 1 AND w.title = 'HIIT Blast';

-- Seed booking: Sam books Mobility 1:1 (capacity 1) so it is full.
INSERT INTO public.bookings (member_id, workout_id, status, deposit_paid, booked_at)
SELECT 2, w.workout_id, 'upcoming', w.deposit_amount, now()
FROM public.workouts w WHERE w.title = 'Mobility 1:1';

UPDATE public.members SET wallet_balance = wallet_balance - 15.00 WHERE member_id = 2;

INSERT INTO public.wallet_transactions (member_id, booking_id, type, amount, created_at)
SELECT 2, b.booking_id, 'deposit', -15.00, now()
FROM public.bookings b
JOIN public.workouts w ON w.workout_id = b.workout_id
WHERE b.member_id = 2 AND w.title = 'Mobility 1:1';

-- Third demo member with a low wallet balance for testing INSUFFICIENT_BALANCE
INSERT INTO public.members (full_name, email, membership_type, wallet_balance)
VALUES ('Test Low Balance', 'test.lowbalance@example.com', 'Flex (pay per session)', 2.00);