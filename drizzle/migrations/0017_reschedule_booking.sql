-- 0017_reschedule_booking.sql
-- Run AFTER migration 0016.

BEGIN;

-- =====================================================
-- 1. REFUND PROTECTION
-- =====================================================

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS refund_locked
boolean NOT NULL DEFAULT false;


-- Reset refund protection when a cancelled booking
-- is reused for a new independent purchase.

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


-- =====================================================
-- 2. RESCHEDULE BOOKING
-- =====================================================

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

  -- Check authentication

  IF mid IS NULL THEN
    RAISE EXCEPTION 'Please log in.';
  END IF;

  -- Find the original booking

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

  -- Lock both workouts in a consistent order

  PERFORM workout_id
  FROM workouts
  WHERE workout_id IN (
    old_workout_id,
    p_new_workout_id
  )
  ORDER BY workout_id
  FOR UPDATE;

  -- Get original workout

  SELECT * INTO old_w
  FROM workouts
  WHERE workout_id = old_workout_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original workout not found.';
  END IF;

  -- Get selected workout

  SELECT * INTO new_w
  FROM workouts
  WHERE workout_id = p_new_workout_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'New session not found.';
  END IF;

  -- Lock original booking

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

  -- Check original workout

  IF old_w.cancelled_at IS NOT NULL THEN

    RAISE EXCEPTION
      'The original workout was cancelled.';

  END IF;

  IF old_w.start_time <= clock_timestamp() THEN

    RAISE EXCEPTION
      'The workout has already started.';

  END IF;

  -- Check selected workout

  IF new_w.cancelled_at IS NOT NULL THEN

    RAISE EXCEPTION
      'The selected workout was cancelled.';

  END IF;

  IF new_w.start_time <= clock_timestamp() THEN

    RAISE EXCEPTION
      'The selected workout has already started.';

  END IF;

  -- Allow another time of the same workout

  IF new_w.title IS DISTINCT FROM old_w.title
     OR new_w.category IS DISTINCT FROM old_w.category THEN

    RAISE EXCEPTION
      'Choose another time for the same workout.';

  END IF;

  -- Lock member and wallet

  SELECT * INTO m
  FROM members
  WHERE member_id = mid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  -- Prevent duplicate bookings

  SELECT * INTO existing
  FROM bookings
  WHERE member_id = mid
    AND workout_id = p_new_workout_id
  FOR UPDATE;

  IF FOUND AND existing.status <> 'cancelled' THEN

    RAISE EXCEPTION
      'You have already booked this session.';

  END IF;

  -- Check available spots

  SELECT count(*) INTO taken
  FROM bookings
  WHERE workout_id = p_new_workout_id
    AND status <> 'cancelled';

  IF taken >= new_w.capacity THEN
    RAISE EXCEPTION 'SESSION_FULL';
  END IF;

  -- Membership booking

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

    -- Single visit booking

    new_deposit := new_w.deposit_amount;

  END IF;

  -- Final time validation

  checked_at := clock_timestamp();

  IF old_w.start_time <= checked_at
     OR new_w.start_time <= checked_at THEN

    RAISE EXCEPTION
      'The workout has already started.';

  END IF;

  -- Preserve refund restrictions

  lock_refund :=
    b.refund_locked
    OR (
      old_w.start_time - checked_at
      <= interval '12 hours'
    );

  -- Calculate transferable deposit

  IF lock_refund THEN

    -- No excess deposit refund after the deadline

    transferable_deposit :=
      LEAST(b.deposit_paid, new_deposit);

  ELSE

    transferable_deposit := b.deposit_paid;

  END IF;

  -- Calculate required payment or refund

  difference := new_deposit - transferable_deposit;

  IF difference > 0
     AND m.wallet_balance < difference THEN

    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';

  END IF;

  -- Reactivate an existing cancelled booking

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

    -- Create new booking

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

  -- Transfer deposit and adjust wallet

  IF b.visit_type = 'single' THEN

    UPDATE members
    SET wallet_balance = wallet_balance - difference
    WHERE member_id = mid;

    -- Record transferable portion of old deposit

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

    -- Record new deposit

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

  -- Remove unnecessary waitlist entries

  DELETE FROM waitlist
  WHERE member_id = mid
    AND workout_id IN (
      old_workout_id,
      p_new_workout_id
    );

  -- Cancel original booking and release its spot
  -- Existing trigger handles waitlist promotion

  UPDATE bookings
  SET status = 'cancelled'
  WHERE booking_id = b.booking_id;

  -- Save operation in audit log

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


-- =====================================================
-- 3. UPDATE CANCELLATION FUNCTION
-- =====================================================

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

  -- Check authentication

  IF mid IS NULL THEN
    RAISE EXCEPTION 'Please log in.';
  END IF;

  -- Find member's booking

  SELECT workout_id INTO wid
  FROM bookings
  WHERE booking_id = p_booking_id
    AND member_id = mid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  -- Lock workout first

  SELECT * INTO w
  FROM workouts
  WHERE workout_id = wid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workout not found.';
  END IF;

  -- Lock booking second

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

  -- Lock member before changing balance

  PERFORM member_id
  FROM members
  WHERE member_id = mid
  FOR UPDATE;

  checked_at := clock_timestamp();

  -- Block cancellation after workout starts

  IF w.start_time <= checked_at THEN

    RAISE EXCEPTION
      'This session has already started.';

  END IF;

  -- Preserve the 12-hour refund policy

  refundable :=
    NOT b.refund_locked
    AND (
      w.start_time - checked_at
      > interval '12 hours'
    );

  -- Cancel booking

  UPDATE bookings
  SET status = 'cancelled'
  WHERE booking_id = b.booking_id;

  -- Membership cancellation

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

  -- Refund eligible single-visit booking

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

    -- Late or refund-locked cancellation

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

  -- Check remaining waitlist

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


-- =====================================================
-- 4. FUNCTION PERMISSIONS
-- =====================================================

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

COMMIT;