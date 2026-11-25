-- Upgrade a membership to a bigger plan.
-- Run AFTER 0017 (memberships are created in 0016).
--
-- Rules:
--   * only an UPGRADE: the new plan must give more visits AND cost more than the current membership
--   * the member pays the difference:  new plan price - what the current membership cost
--     (price_paid always holds the full price of the current level, so Starter -> Standard -> Pro adds up)
--   * visits already used are kept: every booking made with the old membership moves to the new one,
--     so "visits left" = new plan visits - visits already used
--   * the new membership starts now and lasts the full plan duration; the old one ends now
--
-- Same conventions as the rest of the project: security-definer function, wallet row locked first,
-- one wallet transaction, one audit log row, nothing computed is stored.

CREATE OR REPLACE FUNCTION public.upgrade_membership(p_plan_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mid bigint := public.current_member_id();
  m public.members; cur public.member_memberships; p public.membership_plans;
  new_id bigint; extra numeric(8,2);
BEGIN
  IF mid IS NULL THEN RAISE EXCEPTION 'Please log in.'; END IF;
  SELECT * INTO m FROM members WHERE member_id = mid FOR UPDATE;   -- serializes upgrade / purchase / booking
  SELECT * INTO cur FROM member_memberships
    WHERE member_id = mid AND starts_at <= now() AND expires_at > now()
    ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'You have no active membership to upgrade.'; END IF;
  SELECT * INTO p FROM membership_plans WHERE plan_id = p_plan_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'This plan is not available.'; END IF;
  IF p.visits_limit <= cur.visits_limit OR p.price <= cur.price_paid THEN
    RAISE EXCEPTION 'You can only upgrade to a bigger plan.';
  END IF;

  extra := p.price - cur.price_paid;
  IF m.wallet_balance < extra THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  -- the old membership ends now (kept for history), the new one starts now
  UPDATE member_memberships SET expires_at = now() WHERE membership_id = cur.membership_id;
  INSERT INTO member_memberships (member_id, plan_id, plan_name, visits_limit, price_paid, starts_at, expires_at)
    VALUES (mid, p.plan_id, p.name, p.visits_limit, p.price, now(), now() + make_interval(days => p.duration_days))
    RETURNING membership_id INTO new_id;
  -- visits already used (and upcoming bookings) move to the new membership
  UPDATE bookings SET membership_id = new_id WHERE membership_id = cur.membership_id;

  UPDATE members SET wallet_balance = wallet_balance - extra WHERE member_id = mid;
  INSERT INTO wallet_transactions (member_id, booking_id, type, amount, created_at)
    VALUES (mid, NULL, 'membership', -extra, now());
  INSERT INTO audit_log (member_id, action, details)
    VALUES (mid, 'upgrade_membership',
            'membership ' || cur.membership_id || ' (' || cur.plan_name || ') -> ' || new_id || ' (' || p.name || '), paid ' || extra);
  RETURN new_id;
END
$function$;

REVOKE ALL ON FUNCTION public.upgrade_membership(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upgrade_membership(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_membership(bigint) TO service_role;
