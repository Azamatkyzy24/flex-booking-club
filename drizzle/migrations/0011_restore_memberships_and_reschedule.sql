-- ===== 0016: memberships + single visit =====
CREATE TABLE public.membership_plans (
  plan_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  visits_limit integer NOT NULL CHECK (visits_limit > 0),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  price numeric(8,2) NOT NULL CHECK (price > 0),
  active boolean NOT NULL DEFAULT true
);

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

ALTER TABLE public.bookings
  ADD COLUMN visit_type text NOT NULL DEFAULT 'single' CHECK (visit_type IN ('single', 'membership')),
  ADD COLUMN membership_id bigint REFERENCES public.member_memberships(membership_id),
  ADD CONSTRAINT bookings_visit_type_matches_membership
    CHECK ((visit_type = 'membership') = (membership_id IS NOT NULL));
CREATE INDEX bookings_membership ON public.bookings(membership_id) WHERE membership_id IS NOT NULL;

ALTER TABLE public.wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN ('top_up', 'deposit', 'refund', 'membership'));

GRANT SELECT ON public.membership_plans, public.member_memberships TO authenticated;
GRANT ALL ON public.membership_plans, public.member_memberships TO service_role;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read plans" ON public.membership_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members read own memberships" ON public.member_memberships
  FOR SELECT TO authenticated USING (member_id = public.current_member_id());

INSERT INTO public.membership_plans (name, visits_limit, duration_days, price) VALUES
  ('Starter',  4, 30,  60.00),
  ('Standard', 8, 30, 104.00),
  ('Pro',     12, 30, 132.00);

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

CREATE OR REPLACE FUNCTION public.buy_membership(p_plan_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE mid bigint := public.current_member_id(); m public.members; p public.membership_plans; new_id bigint;
BEGIN
  IF mid IS NULL THEN RAISE EXCEPTION 'Please log in.'; END IF;
  SELECT * INTO m FROM members WHERE member_id = mid FOR UPDATE;
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

-- ===== 0017: reschedule booking =====
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS refund_locked
boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.reset_booking_refund_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'cancelled'
     AND NEW.status = 'upcoming' THEN
    NEW.refund_locked := false;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reset_booking_refund_lock
ON public.bookings;

CREATE TRIGGER trg_reset_booking_refund_lock
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.reset_booking_refund_lock();

CREATE OR REPLACE FUNCTION public.reschedule_booking(
  p_booking_id bigint,
  p_new_workout_id bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mid bigint := public.current_member_id();
  b public.bookings;
  old_w public.workouts;
  new_w public.workouts;
  m public.members;
  ms public.member_memberships;
  existing public.bookings;
  old_workout_id bigint;
  new_booking_id bigint;
  taken integer;
  new_deposit numeric(8,2);
  difference numeric(8,2);
  transferable_deposit numeric(8,2);
  lock_refund boolean;
  checked_at timestamptz;
BEGIN
  IF mid IS NULL THEN
    RAISE EXCEPTION 'Please log in.';
  END IF;
  SELECT workout_id INTO old_workout_id
  FROM bookings
  WHERE booking_id = p_booking_id
    AND member_id = mid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  IF old_workout_id = p_new_workout_id THEN
    RAISE EXCEPTION 'Please select another session.';
  END IF;
  PERFORM workout_id
  FROM workouts
  WHERE workout_id IN (
    old_workout_id,
    p_new_workout_id
  )
  ORDER BY workout_id
  FOR UPDATE;
  SELECT * INTO old_w
  FROM workouts
  WHERE workout_id = old_workout_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original workout not found.';
  END IF;
  SELECT * INTO new_w
  FROM workouts
  WHERE workout_id = p_new_workout_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'New session not found.';
  END IF;
  SELECT * INTO b
  FROM bookings
  WHERE booking_id = p_booking_id
    AND member_id = mid
  FOR UPDATE;
  IF NOT FOUND
     OR b.status <> 'upcoming'
     OR b.workout_id <> old_workout_id THEN
    RAISE EXCEPTION
      'This booking cannot be rescheduled.';
  END IF;
  IF old_w.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION
      'The original workout was cancelled.';
  END IF;
  IF old_w.start_time <= clock_timestamp() THEN
    RAISE EXCEPTION
      'The workout has already started.';
  END IF;
  IF new_w.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION
      'The selected workout was cancelled.';
  END IF;
  IF new_w.start_time <= clock_timestamp() THEN
    RAISE EXCEPTION
      'The selected workout has already started.';
  END IF;
  IF new_w.title IS DISTINCT FROM old_w.title
     OR new_w.category IS DISTINCT FROM old_w.category THEN
    RAISE EXCEPTION
      'Choose another time for the same workout.';
  END IF;
  SELECT * INTO m
  FROM members
  WHERE member_id = mid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;
  SELECT * INTO existing
  FROM bookings
  WHERE member_id = mid
    AND workout_id = p_new_workout_id
  FOR UPDATE;
  IF FOUND AND existing.status <> 'cancelled' THEN
    RAISE EXCEPTION
      'You have already booked this session.';
  END IF;
  SELECT count(*) INTO taken
  FROM bookings
  WHERE workout_id = p_new_workout_id
    AND status <> 'cancelled';
  IF taken >= new_w.capacity THEN
    RAISE EXCEPTION 'SESSION_FULL';
  END IF;
  IF b.visit_type = 'membership' THEN
    SELECT * INTO ms
    FROM member_memberships
    WHERE membership_id = b.membership_id
      AND member_id = mid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Membership not found.';
    END IF;
    IF new_w.category IS DISTINCT FROM 'Group Class' THEN
      RAISE EXCEPTION
        'Memberships cover group classes only.';
    END IF;
    IF new_w.start_time < ms.starts_at
       OR new_w.start_time >= ms.expires_at THEN
      RAISE EXCEPTION
        'Your membership is not valid for this session.';
    END IF;
    new_deposit := 0;
  ELSE
    new_deposit := new_w.deposit_amount;
  END IF;
  checked_at := clock_timestamp();
  IF old_w.start_time <= checked_at
     OR new_w.start_time <= checked_at THEN
    RAISE EXCEPTION
      'The workout has already started.';
  END IF;
  lock_refund :=
    b.refund_locked
    OR (
      old_w.start_time - checked_at
      <= interval '12 hours'
    );
  IF lock_refund THEN
    transferable_deposit :=
      LEAST(b.deposit_paid, new_deposit);
  ELSE
    transferable_deposit := b.deposit_paid;
  END IF;
  difference := new_deposit - transferable_deposit;
  IF difference > 0
     AND m.wallet_balance < difference THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;
  IF existing.booking_id IS NOT NULL THEN
    UPDATE bookings
    SET status = 'upcoming',
        deposit_paid = new_deposit,
        booked_at = now()
    WHERE booking_id = existing.booking_id
    RETURNING booking_id INTO new_booking_id;
    UPDATE bookings
    SET visit_type = b.visit_type,
        membership_id = b.membership_id,
        refund_locked = lock_refund
    WHERE booking_id = new_booking_id;
  ELSE
    INSERT INTO bookings (
      member_id,
      workout_id,
      status,
      deposit_paid,
      booked_at,
      visit_type,
      membership_id,
      refund_locked
    )
    VALUES (
      mid,
      p_new_workout_id,
      'upcoming',
      new_deposit,
      now(),
      b.visit_type,
      b.membership_id,
      lock_refund
    )
    RETURNING booking_id INTO new_booking_id;
  END IF;
  IF b.visit_type = 'single' THEN
    UPDATE members
    SET wallet_balance = wallet_balance - difference
    WHERE member_id = mid;
    IF transferable_deposit > 0 THEN
      INSERT INTO wallet_transactions (
        member_id,
        booking_id,
        type,
        amount
      )
      VALUES (
        mid,
        b.booking_id,
        'refund',
        transferable_deposit
      );
    END IF;
    IF new_deposit > 0 THEN
      INSERT INTO wallet_transactions (
        member_id,
        booking_id,
        type,
        amount
      )
      VALUES (
        mid,
        new_booking_id,
        'deposit',
        -new_deposit
      );
    END IF;
  END IF;
  DELETE FROM waitlist
  WHERE member_id = mid
    AND workout_id IN (
      old_workout_id,
      p_new_workout_id
    );
  UPDATE bookings
  SET status = 'cancelled'
  WHERE booking_id = b.booking_id;
  INSERT INTO audit_log (
    member_id,
    action,
    details
  )
  VALUES (
    mid,
    'reschedule_booking',
    'Old booking ' || b.booking_id ||
    ', new booking ' || new_booking_id ||
    ', old workout ' || old_workout_id ||
    ', new workout ' || p_new_workout_id ||
    ', deposit difference ' || difference ||
    ', refund locked ' || lock_refund ||
    ', retained deposit ' ||
        (b.deposit_paid - transferable_deposit)
  );
  RETURN new_booking_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mid bigint := public.current_member_id();
  b public.bookings;
  w public.workouts;
  wid bigint;
  waiting integer;
  refundable boolean;
  checked_at timestamptz;
BEGIN
  IF mid IS NULL THEN
    RAISE EXCEPTION 'Please log in.';
  END IF;
  SELECT workout_id INTO wid
  FROM bookings
  WHERE booking_id = p_booking_id
    AND member_id = mid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  SELECT * INTO w
  FROM workouts
  WHERE workout_id = wid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workout not found.';
  END IF;
  SELECT * INTO b
  FROM bookings
  WHERE booking_id = p_booking_id
    AND member_id = mid
  FOR UPDATE;
  IF NOT FOUND
     OR b.status <> 'upcoming'
     OR b.workout_id <> wid THEN
    RAISE EXCEPTION
      'This booking can no longer be cancelled.';
  END IF;
  PERFORM member_id
  FROM members
  WHERE member_id = mid
  FOR UPDATE;
  checked_at := clock_timestamp();
  IF w.start_time <= checked_at THEN
    RAISE EXCEPTION
      'This session has already started.';
  END IF;
  refundable :=
    NOT b.refund_locked
    AND (
      w.start_time - checked_at
      > interval '12 hours'
    );
  UPDATE bookings
  SET status = 'cancelled'
  WHERE booking_id = b.booking_id;
  IF b.visit_type = 'membership' THEN
    INSERT INTO audit_log (
      member_id,
      action,
      details
    )
    VALUES (
      mid,
      'cancel_booking_membership',
      'booking ' || b.booking_id ||
      ', membership visit returned'
    );
  ELSIF refundable THEN
    UPDATE members
    SET wallet_balance =
      wallet_balance + b.deposit_paid
    WHERE member_id = b.member_id;
    IF b.deposit_paid > 0 THEN
      INSERT INTO wallet_transactions (
        member_id,
        booking_id,
        type,
        amount,
        created_at
      )
      VALUES (
        b.member_id,
        b.booking_id,
        'refund',
        b.deposit_paid,
        now()
      );
    END IF;
    INSERT INTO audit_log (
      member_id,
      action,
      details
    )
    VALUES (
      b.member_id,
      'cancel_booking',
      'booking ' || b.booking_id ||
      ', refund ' || b.deposit_paid
    );
  ELSE
    INSERT INTO audit_log (
      member_id,
      action,
      details
    )
    VALUES (
      b.member_id,
      'cancel_booking_late',
      'booking ' || b.booking_id ||
      ', deposit kept ' || b.deposit_paid
    );
  END IF;
  SELECT count(*) INTO waiting
  FROM waitlist
  WHERE workout_id = b.workout_id;
  IF waiting > 0 THEN
    INSERT INTO audit_log (
      member_id,
      action,
      details
    )
    VALUES (
      NULL,
      'waitlist_spot_freed',
      'workout ' || b.workout_id ||
      ', ' || waiting || ' waiting'
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.reschedule_booking(bigint, bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.reschedule_booking(bigint, bigint)
TO authenticated;
REVOKE ALL ON FUNCTION
  public.cancel_booking(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.cancel_booking(bigint)
TO authenticated;
REVOKE ALL ON FUNCTION
  public.reset_booking_refund_lock()
FROM PUBLIC, anon, authenticated;