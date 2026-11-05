CREATE TABLE public.members (
  member_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  membership_type text,
  wallet_balance numeric(8,2) NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0)
);
CREATE TABLE public.trainers (
  trainer_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name text NOT NULL,
  specialty text,
  email text UNIQUE
);
CREATE TABLE public.workouts (
  workout_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trainer_id bigint REFERENCES public.trainers(trainer_id),
  title text NOT NULL,
  category text CHECK (category IN ('Group Class','Personal Training')),
  start_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  capacity integer NOT NULL CHECK (capacity > 0),
  price numeric(8,2) NOT NULL CHECK (price > 0),
  deposit_amount numeric(8,2) NOT NULL CHECK (deposit_amount >= 0 AND deposit_amount <= price)
);
CREATE TABLE public.bookings (
  booking_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id bigint NOT NULL REFERENCES public.members(member_id),
  workout_id bigint NOT NULL REFERENCES public.workouts(workout_id),
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','completed','cancelled')),
  deposit_paid numeric(8,2) NOT NULL,
  booked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, workout_id)
);
CREATE TABLE public.wallet_transactions (
  transaction_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id bigint NOT NULL REFERENCES public.members(member_id),
  booking_id bigint REFERENCES public.bookings(booking_id),
  type text NOT NULL CHECK (type IN ('top_up','deposit','refund')),
  amount numeric(8,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.members, public.trainers, public.workouts, public.bookings, public.wallet_transactions TO anon, authenticated;
GRANT ALL ON public.members, public.trainers, public.workouts, public.bookings, public.wallet_transactions TO service_role;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Prototype (no sign-in yet): read-only access; all changes go through the functions below.
CREATE POLICY "Read members (demo)" ON public.members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Read trainers" ON public.trainers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Read workouts" ON public.workouts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Read bookings (demo)" ON public.bookings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Read transactions (demo)" ON public.wallet_transactions FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.book_workout(p_member_id bigint, p_workout_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.workouts; m public.members; taken int; existing public.bookings; bid bigint;
BEGIN
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found.'; END IF;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This session has already started.'; END IF;
  SELECT * INTO m FROM members WHERE member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
  SELECT * INTO existing FROM bookings WHERE member_id = p_member_id AND workout_id = p_workout_id;
  IF FOUND AND existing.status <> 'cancelled' THEN RAISE EXCEPTION 'You have already booked this session.'; END IF;
  SELECT count(*) INTO taken FROM bookings WHERE workout_id = p_workout_id AND status <> 'cancelled';
  IF taken >= w.capacity THEN RAISE EXCEPTION 'This session is full.'; END IF;
  IF m.wallet_balance < w.deposit_amount THEN RAISE EXCEPTION 'Insufficient funds. Please top up your wallet.'; END IF;

  IF existing.booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'upcoming', deposit_paid = w.deposit_amount, booked_at = now()
      WHERE booking_id = existing.booking_id RETURNING booking_id INTO bid;
  ELSE
    INSERT INTO bookings (member_id, workout_id, status, deposit_paid, booked_at)
      VALUES (p_member_id, p_workout_id, 'upcoming', w.deposit_amount, now()) RETURNING booking_id INTO bid;
  END IF;
  UPDATE members SET wallet_balance = wallet_balance - w.deposit_amount WHERE member_id = p_member_id;
  INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
    VALUES (p_member_id, bid, 'deposit', -w.deposit_amount, now());
  RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; w public.workouts;
BEGIN
  SELECT * INTO b FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'upcoming' THEN RAISE EXCEPTION 'This booking can no longer be cancelled.'; END IF;
  SELECT * INTO w FROM workouts WHERE workout_id = b.workout_id;
  IF w.start_time - now() <= interval '12 hours' THEN RAISE EXCEPTION 'This booking can no longer be cancelled.'; END IF;
  UPDATE bookings SET status = 'cancelled' WHERE booking_id = b.booking_id;
  UPDATE members SET wallet_balance = wallet_balance + b.deposit_paid WHERE member_id = b.member_id;
  INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
    VALUES (b.member_id, b.booking_id, 'refund', b.deposit_paid, now());
END $$;

CREATE OR REPLACE FUNCTION public.top_up_wallet(p_member_id bigint, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount NOT IN (20, 50, 100) THEN RAISE EXCEPTION 'Invalid top-up amount.'; END IF;
  UPDATE members SET wallet_balance = wallet_balance + p_amount WHERE member_id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
  INSERT INTO wallet_transactions (member_id, type, amount, created_at) VALUES (p_member_id, 'top_up', p_amount, now());
END $$;

REVOKE ALL ON FUNCTION public.book_workout(bigint, bigint), public.cancel_booking(bigint), public.top_up_wallet(bigint, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_workout(bigint, bigint), public.cancel_booking(bigint), public.top_up_wallet(bigint, numeric) TO anon, authenticated;

-- Seed data
INSERT INTO public.members (full_name, email, membership_type, wallet_balance)
  VALUES ('Alex Morgan', 'alex.morgan@example.com', 'Standard', 85);
INSERT INTO public.trainers (full_name, specialty, email) VALUES
  ('Maya Torres', 'HIIT & CrossFit', 'maya.torres@gymflow.example'),
  ('Liam Chen', 'Yoga & Pilates', 'liam.chen@gymflow.example'),
  ('Jordan Blake', 'Strength & Fat Loss', 'jordan.blake@gymflow.example'),
  ('Ava Patel', 'Indoor Cycling', 'ava.patel@gymflow.example'),
  ('Marcus Reed', 'Boxing', 'marcus.reed@gymflow.example'),
  ('Sofia Grant', 'Mobility & Recovery', 'sofia.grant@gymflow.example');
INSERT INTO public.workouts (trainer_id, title, category, start_time, duration_minutes, capacity, price, deposit_amount)
SELECT t.trainer_id, v.title, v.category, date_trunc('day', now()) + v.off, v.dur, v.cap, v.price, v.dep
FROM (VALUES
  ('Maya Torres','HIIT Burn','Group Class', interval '1 day 7 hours', 45, 16, 20, 5),
  ('Liam Chen','Power Yoga','Group Class', interval '1 day 18 hours 30 minutes', 60, 20, 18, 4.5),
  ('Jordan Blake','Strength 1:1','Personal Training', interval '2 days 9 hours', 60, 1, 70, 21),
  ('Ava Patel','Spin Cycle','Group Class', interval '2 days 19 hours', 45, 24, 16, 4),
  ('Marcus Reed','Boxing Fundamentals','Group Class', interval '3 days 18 hours', 60, 14, 22, 5.5),
  ('Sofia Grant','Mobility & Recovery','Personal Training', interval '4 days 10 hours', 45, 1, 55, 16.5),
  ('Maya Torres','CrossFit WOD','Group Class', interval '5 days 7 hours 30 minutes', 60, 12, 25, 6.25),
  ('Liam Chen','Pilates Core','Group Class', interval '6 days 17 hours', 50, 15, 19, 4.75),
  ('Jordan Blake','Fat Loss Coaching','Personal Training', interval '7 days 8 hours', 60, 1, 75, 22.5),
  ('Ava Patel','Spin Cycle','Group Class', interval '-3 days 19 hours', 45, 24, 16, 4),
  ('Liam Chen','Power Yoga','Group Class', interval '-6 days 18 hours', 60, 20, 18, 4.5)
) AS v(trainer, title, category, off, dur, cap, price, dep)
JOIN public.trainers t ON t.full_name = v.trainer;

INSERT INTO public.bookings (member_id, workout_id, status, deposit_paid, booked_at)
SELECT m.member_id, w.workout_id, v.status, w.deposit_amount, now() - v.ago
FROM (VALUES
  ('Spin Cycle', true, 'upcoming', interval '1 day'),
  ('Spin Cycle', false, 'completed', interval '5 days'),
  ('Power Yoga', false, 'cancelled', interval '8 days')
) AS v(title, future, status, ago)
JOIN public.workouts w ON w.title = v.title AND (w.start_time > now()) = v.future
CROSS JOIN public.members m WHERE m.email = 'alex.morgan@example.com';

INSERT INTO public.wallet_transactions (member_id, booking_id, type, amount, created_at)
SELECT m.member_id, b.booking_id, v.type, v.amount, now() - v.ago
FROM (VALUES
  ('top_up', NULL, 100.00, interval '10 days'),
  ('deposit', 'cancelled', -4.50, interval '8 days'),
  ('refund', 'cancelled', 4.50, interval '7 days'),
  ('deposit', 'completed', -4.00, interval '5 days'),
  ('refund', 'completed', 4.00, interval '5 days' - interval '1 minute'),
  ('deposit', 'upcoming', -4.00, interval '1 day')
) AS v(type, bstatus, amount, ago)
CROSS JOIN public.members m
LEFT JOIN public.bookings b ON b.status = v.bstatus AND b.member_id = m.member_id
WHERE m.email = 'alex.morgan@example.com';