-- Memberships  + single visit .
-- Run AFTER 0015. Safe to run only once (plans are seeded once).
--
-- Two ways to attend a Group Class:
--   * SINGLE VISIT  - what the site always did: pay the deposit from the wallet now, the rest at reception.
--   * MEMBERSHIP    - buy a plan (N visits within D days) from the wallet; every visit is then free to book.
-- Personal Training is always a single visit (it is not included in memberships).
--
-- Project rules kept: tables are read-only to the app, every change goes through a security-definer
-- function, and computed values are never stored (visits used / left are counted from bookings).

-- 1) Plans offered by the gym (read-only for members; the gym changes them in Supabase)
CREATE TABLE public.membership_plans (
  plan_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  visits_limit integer NOT NULL CHECK (visits_limit > 0),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  price numeric(8,2) NOT NULL CHECK (price > 0),
  active boolean NOT NULL DEFAULT true
);

-- 2) Memberships bought by members. Plan terms are copied at purchase time, so changing a plan
--    later never changes a membership somebody already paid for.
CREATE TABLE public.member_memberships (
  membership_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id bigint NOT NULL REFERENCES public.members(member_id),
  plan_id bigint NOT NULL REFERENCES public.membership_plans(plan_id),
  plan_name text NOT NULL,
  visits_limit integer NOT NULL CHECK (visits_limit > 0),
  price_paid numeric(8,2) NOT NULL CHECK (price_paid > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > starts_at)
);
CREATE INDEX member_memberships_member ON public.member_memberships(member_id, expires_at);

-- 3) Every booking is either a single visit or a visit from a membership
ALTER TABLE public.bookings
  ADD COLUMN visit_type text NOT NULL DEFAULT 'single' CHECK (visit_type IN ('single', 'membership')),
  ADD COLUMN membership_id bigint REFERENCES public.member_memberships(membership_id),
  ADD CONSTRAINT bookings_visit_type_matches_membership
    CHECK ((visit_type = 'membership') = (membership_id IS NOT NULL));
CREATE INDEX bookings_membership ON public.bookings(membership_id) WHERE membership_id IS NOT NULL;

-- 4) Wallet history gets a new kind of transaction: buying a membership
ALTER TABLE public.wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN ('top_up', 'deposit', 'refund', 'membership'));

-- 5) Access: read-only for the app
GRANT SELECT ON public.membership_plans, public.member_memberships TO authenticated;
GRANT ALL ON public.membership_plans, public.member_memberships TO service_role;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read plans" ON public.membership_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members read own memberships" ON public.member_memberships
  FOR SELECT TO authenticated USING (member_id = public.current_member_id());

-- 6) Seed plans (example prices - change them freely: a Group Class costs $16-25 as a single visit)
INSERT INTO public.membership_plans (name, visits_limit, duration_days, price) VALUES
  ('Starter',  4, 30,  60.00),
  ('Standard', 8, 30, 104.00),
  ('Pro',     12, 30, 132.00);

-- 7) A membership booking costs nothing, so cancelling it would "refund" 0. The existing cancel
--    functions (member, admin, trainer) insert that refund row; skip rows that move no money.
CREATE OR REPLACE FUNCTION public.trg_skip_zero_refund()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.type = 'refund' AND NEW.amount = 0 THEN RETURN NULL; END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS wallet_transactions_skip_zero_refund ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_skip_zero_refund
BEFORE INSERT ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_skip_zero_refund();

-- 8) When a cancelled booking comes back to life (member books again, or the waitlist promotes someone)
--    it starts as a normal single visit. book_session sets the membership afterwards if needed.
CREATE OR REPLACE FUNCTION public.trg_reset_visit_type_on_reactivation()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    NEW.visit_type := 'single';
    NEW.membership_id := NULL;
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS bookings_reset_visit_type ON public.bookings;
CREATE TRIGGER bookings_reset_visit_type
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_reset_visit_type_on_reactivation();

-- 9) Buy a membership. One active membership per member at a time; paid from the wallet.
CREATE OR REPLACE FUNCTION public.buy_membership(p_plan_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE mid bigint := public.current_member_id(); m public.members; p public.membership_plans; new_id bigint;
BEGIN
  IF mid IS NULL THEN RAISE EXCEPTION 'Please log in.'; END IF;
  SELECT * INTO m FROM members WHERE member_id = mid FOR UPDATE;   -- also serializes two purchases
  SELECT * INTO p FROM membership_plans WHERE plan_id = p_plan_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'This plan is not available.'; END IF;
  IF EXISTS (SELECT 1 FROM member_memberships WHERE member_id = mid AND expires_at > now()) THEN
    RAISE EXCEPTION 'You already have an active membership.';
  END IF;
  IF m.wallet_balance < p.price THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  INSERT INTO member_memberships (member_id, plan_id, plan_name, visits_limit, price_paid, starts_at, expires_at)
    VALUES (mid, p.plan_id, p.name, p.visits_limit, p.price, now(), now() + make_interval(days => p.duration_days))
    RETURNING membership_id INTO new_id;
  UPDATE members SET wallet_balance = wallet_balance - p.price WHERE member_id = mid;
  INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
    VALUES (mid, NULL, 'membership', -p.price, now());
  INSERT INTO audit_log (member_id, action, details)
    VALUES (mid, 'buy_membership', 'membership ' || new_id || ', plan ' || p.name || ', price ' || p.price);
  RETURN new_id;
END
$function$;

-- 10) book_session now takes p_use_membership. The old two-argument version is dropped so the
--     app never meets two functions with the same name.
DROP FUNCTION IF EXISTS public.book_session(bigint, bigint);

CREATE OR REPLACE FUNCTION public.book_session(p_workout_id bigint, p_member_id bigint, p_use_membership boolean DEFAULT false)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w public.workouts; m public.members; taken int; existing public.bookings; bid bigint;
  ms public.member_memberships; used int; cost numeric(8,2);
BEGIN
  IF p_member_id IS DISTINCT FROM public.current_member_id() THEN RAISE EXCEPTION 'You can only book for your own account.'; END IF;
  -- Lock order stays: workout row first, then member row (same as the waitlist promotion).
  SELECT * INTO w FROM workouts WHERE workout_id = p_workout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found.'; END IF;
  IF w.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'This workout was cancelled by the trainer.'; END IF;
  IF w.start_time <= now() THEN RAISE EXCEPTION 'This session has already started.'; END IF;
  SELECT * INTO m FROM members WHERE member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
  SELECT * INTO existing FROM bookings WHERE member_id = p_member_id AND workout_id = p_workout_id;
  IF FOUND AND existing.status <> 'cancelled' THEN RAISE EXCEPTION 'You have already booked this session.'; END IF;
  SELECT count(*) INTO taken FROM bookings WHERE workout_id = p_workout_id AND status <> 'cancelled';
  IF taken >= w.capacity THEN RAISE EXCEPTION 'SESSION_FULL'; END IF;

  IF p_use_membership THEN
    IF w.category IS DISTINCT FROM 'Group Class' THEN RAISE EXCEPTION 'MEMBERSHIP_GROUP_ONLY'; END IF;
    -- the membership that is valid on the day of the class (members row is locked, so no race)
    SELECT * INTO ms FROM member_memberships
      WHERE member_id = p_member_id AND starts_at <= now() AND expires_at > now()
      ORDER BY expires_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_MEMBERSHIP'; END IF;
    IF w.start_time > ms.expires_at THEN RAISE EXCEPTION 'MEMBERSHIP_EXPIRES_BEFORE_CLASS'; END IF;
    SELECT count(*) INTO used FROM bookings WHERE membership_id = ms.membership_id AND status <> 'cancelled';
    IF used >= ms.visits_limit THEN RAISE EXCEPTION 'NO_VISITS_LEFT'; END IF;
    cost := 0;
  ELSE
    cost := w.deposit_amount;
    IF m.wallet_balance < cost THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  END IF;

  IF existing.booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'upcoming', deposit_paid = cost, booked_at = now()
      WHERE booking_id = existing.booking_id RETURNING booking_id INTO bid;
  ELSE
    INSERT INTO bookings (member_id, workout_id, status, deposit_paid, booked_at)
      VALUES (p_member_id, p_workout_id, 'upcoming', cost, now()) RETURNING booking_id INTO bid;
  END IF;

  IF p_use_membership THEN
    UPDATE bookings SET visit_type = 'membership', membership_id = ms.membership_id WHERE booking_id = bid;
  ELSE
    UPDATE members SET wallet_balance = wallet_balance - cost WHERE member_id = p_member_id;
    INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
      VALUES (p_member_id, bid, 'deposit', -cost, now());
  END IF;

  DELETE FROM waitlist WHERE member_id = p_member_id AND workout_id = p_workout_id;
  INSERT INTO audit_log (member_id, action, details)
    VALUES (p_member_id, 'book_session',
            'booking ' || bid || ', workout ' || p_workout_id ||
            CASE WHEN p_use_membership THEN ', membership ' || ms.membership_id ELSE ', deposit ' || cost END);
  RETURN bid;
END
$function$;

REVOKE ALL ON FUNCTION public.book_session(bigint, bigint, boolean), public.buy_membership(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_session(bigint, bigint, boolean), public.buy_membership(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_session(bigint, bigint, boolean), public.buy_membership(bigint) TO service_role;
