-- Monthly Studio subscription paid through Stripe Checkout.
-- Access follows the Stripe subscription status, written only by the billing
-- role after the server re-reads the subscription from Stripe. Idempotent.
CREATE TABLE IF NOT EXISTS app.plan_subscriptions (
  organization_id text PRIMARY KEY REFERENCES public.organizations ON DELETE CASCADE,
  stripe_customer text,
  stripe_subscription text UNIQUE,
  stripe_session text,
  status text NOT NULL DEFAULT 'pending',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  livemode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.plan_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.plan_subscriptions FROM PUBLIC;

-- Billing summary for members; customer/session ids only for the owner.
CREATE OR REPLACE FUNCTION app.plan_billing_context(oid text)
RETURNS TABLE(owner boolean,stripe_customer text,stripe_subscription text,status text,
  current_period_end timestamptz,cancel_at_period_end boolean,trial_ends_at timestamptz,paid_plan integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT o.is_owner,
    CASE WHEN o.is_owner THEN s.stripe_customer END,
    CASE WHEN o.is_owner THEN s.stripe_subscription END,
    COALESCE(s.status,'none'),s.current_period_end,COALESCE(s.cancel_at_period_end,false),
    p.trial_ends_at,p.plan
  FROM app.organization_plans p
  CROSS JOIN LATERAL (SELECT EXISTS(
    SELECT 1 FROM organization_memberships m JOIN profiles pr ON pr.id=m.profile_id
    WHERE m.organization_id=oid AND m.profile_id=app.user_id() AND m.role='OWNER' AND pr.status='active'
  ) AS is_owner) o
  LEFT JOIN app.plan_subscriptions s ON s.organization_id=p.organization_id
  WHERE p.organization_id=oid AND app.org_member(oid)
$$;
REVOKE ALL ON FUNCTION app.plan_billing_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.plan_billing_context(text) TO atacuisine_app;

-- The owner records the Checkout session it just opened.
CREATE OR REPLACE FUNCTION app.plan_record_session(oid text,session_id text,customer text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships m JOIN profiles pr ON pr.id=m.profile_id
    WHERE m.organization_id=oid AND m.profile_id=app.user_id() AND m.role='OWNER' AND pr.status='active'
  ) THEN RAISE EXCEPTION 'Abonnement réservé au propriétaire.'; END IF;
  IF session_id !~ '^cs_[A-Za-z0-9_]{8,250}$' THEN RAISE EXCEPTION 'Session invalide.'; END IF;
  INSERT INTO app.plan_subscriptions(organization_id,stripe_session,stripe_customer)
  VALUES(oid,session_id,customer)
  ON CONFLICT(organization_id) DO UPDATE SET stripe_session=excluded.stripe_session,
    stripe_customer=COALESCE(app.plan_subscriptions.stripe_customer,excluded.stripe_customer),
    updated_at=now();
END $$;
REVOKE ALL ON FUNCTION app.plan_record_session(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.plan_record_session(text,text,text) TO atacuisine_app;

-- Billing role only: applies the subscription state re-read from Stripe.
CREATE OR REPLACE FUNCTION app.plan_reconcile(oid text,customer text,subscription text,
  new_status text,period_end timestamptz,cancelling boolean,live boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  current_row app.plan_subscriptions;
  granting boolean := new_status IN ('active','trialing','past_due');
  closing boolean := new_status IN ('canceled','unpaid','incomplete_expired');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.organization_plans WHERE organization_id=oid) THEN
    RAISE EXCEPTION 'Organisation inconnue.';
  END IF;
  SELECT * INTO current_row FROM app.plan_subscriptions WHERE organization_id=oid FOR UPDATE;
  -- A late event about an older subscription never overrides a live one.
  IF current_row.stripe_subscription IS NOT NULL AND current_row.stripe_subscription<>subscription
     AND current_row.status IN ('active','trialing','past_due') AND NOT granting THEN
    RETURN;
  END IF;
  INSERT INTO app.plan_subscriptions(organization_id,stripe_customer,stripe_subscription,status,
    current_period_end,cancel_at_period_end,livemode)
  VALUES(oid,customer,subscription,new_status,period_end,cancelling,live)
  ON CONFLICT(organization_id) DO UPDATE SET stripe_customer=excluded.stripe_customer,
    stripe_subscription=excluded.stripe_subscription,status=excluded.status,
    current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,
    livemode=excluded.livemode,updated_at=now();
  IF granting THEN
    UPDATE app.organization_plans SET plan=39,cancelled_at=NULL WHERE organization_id=oid;
  ELSIF closing THEN
    UPDATE app.organization_plans SET plan=0,cancelled_at=COALESCE(cancelled_at,now())
    WHERE organization_id=oid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.plan_reconcile(text,text,text,text,timestamptz,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.plan_reconcile(text,text,text,text,timestamptz,boolean,boolean) TO atacuisine_addon_billing;

INSERT INTO schema_versions(version) VALUES(110) ON CONFLICT DO NOTHING;
