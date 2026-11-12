-- Admin role via the EXISTING public.user_roles table (role = 'admin').
-- Run AFTER 0009. Requires that the 'admin' value is allowed in user_roles.role.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Admins may read everything the admin page needs (OR-ed with existing member policies)
DROP POLICY IF EXISTS "Admins read bookings" ON public.bookings;
CREATE POLICY "Admins read bookings" ON public.bookings
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read members" ON public.members;
CREATE POLICY "Admins read members" ON public.members
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read waitlist" ON public.waitlist;
CREATE POLICY "Admins read waitlist" ON public.waitlist
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Admins read wallet_transactions" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read audit_log" ON public.audit_log;
CREATE POLICY "Admins read audit_log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- Admin action 1: cancel any booking (no 12h limit), refund; trigger promotes next in waitlist
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(p_booking_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE b public.bookings;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only.'; END IF;
  SELECT * INTO b FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'upcoming' THEN
    RAISE EXCEPTION 'Booking is not active.';
  END IF;
  UPDATE bookings SET status = 'cancelled' WHERE booking_id = b.booking_id;
  UPDATE members SET wallet_balance = wallet_balance + b.deposit_paid WHERE member_id = b.member_id;
  INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
    VALUES (b.member_id, b.booking_id, 'refund', b.deposit_paid, now());
  INSERT INTO audit_log (member_id, action, details)
    VALUES (b.member_id, 'admin_cancel_booking',
            'booking ' || b.booking_id || ', refund ' || b.deposit_paid || ', by ' || auth.uid());
END
$function$;

-- Admin action 2: remove someone from the waitlist
CREATE OR REPLACE FUNCTION public.admin_remove_from_waitlist(p_waitlist_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE wl public.waitlist;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only.'; END IF;
  DELETE FROM waitlist WHERE waitlist_id = p_waitlist_id RETURNING * INTO wl;
  IF NOT FOUND THEN RAISE EXCEPTION 'Waitlist entry not found.'; END IF;
  INSERT INTO audit_log (member_id, action, details)
    VALUES (wl.member_id, 'admin_remove_from_waitlist',
            'workout ' || wl.workout_id || ', by ' || auth.uid());
END
$function$;

-- Admin action 3: manually run promotion for a workout (returns number promoted)
CREATE OR REPLACE FUNCTION public.admin_promote_waitlist(p_workout_id bigint)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only.'; END IF;
  n := public.promote_from_waitlist(p_workout_id);
  INSERT INTO audit_log (member_id, action, details)
    VALUES (NULL, 'admin_promote_waitlist',
            'workout ' || p_workout_id || ', promoted ' || n || ', by ' || auth.uid());
  RETURN n;
END
$function$;

REVOKE ALL ON FUNCTION public.admin_cancel_booking(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_from_waitlist(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_promote_waitlist(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_from_waitlist(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_promote_waitlist(bigint) TO authenticated;
