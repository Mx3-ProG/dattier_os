-- Billing-only reconciliation of capacity and the actual Stripe trial dates.
CREATE OR REPLACE FUNCTION app.plan_reconcile_details(oid text, subscription text, quantity integer,
  trial_start timestamptz, trial_end timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s app.plan_subscriptions;
BEGIN
  SELECT * INTO s FROM app.plan_subscriptions WHERE organization_id=oid FOR UPDATE;
  IF s.stripe_subscription IS DISTINCT FROM subscription THEN RETURN; END IF;
  IF quantity < 1 OR quantity > 100 THEN RAISE EXCEPTION 'Capacité invalide.'; END IF;
  -- Do not grant extra capacity for an unpaid upgrade.
  IF s.status IN ('active','trialing') THEN
    UPDATE app.organization_plans SET seats=quantity WHERE organization_id=oid;
  END IF;
  IF s.status='trialing' AND trial_start IS NOT NULL AND trial_end=trial_start+interval '7 days' THEN
    UPDATE app.organization_plans SET trial_started_at=trial_start,trial_ends_at=trial_end WHERE organization_id=oid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.plan_reconcile_details(text,text,integer,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.plan_reconcile_details(text,text,integer,timestamptz,timestamptz) TO atacuisine_addon_billing;

CREATE OR REPLACE FUNCTION app.plan_checkout_session(oid text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM organization_memberships m JOIN profiles p ON p.id=m.profile_id
    WHERE m.organization_id=oid AND m.profile_id=app.user_id() AND m.role='OWNER' AND p.status='active')
    THEN RAISE EXCEPTION 'Accès non autorisé.'; END IF;
  RETURN (SELECT stripe_session FROM app.plan_subscriptions WHERE organization_id=oid);
END $$;
REVOKE ALL ON FUNCTION app.plan_checkout_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.plan_checkout_session(text) TO atacuisine_app;

-- One reminder per owner every ten hours, shared across devices and tabs.
CREATE TABLE IF NOT EXISTS app.billing_reminders (
  profile_id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  shown_at timestamptz NOT NULL
);
ALTER TABLE app.billing_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.billing_reminders FROM PUBLIC;
CREATE OR REPLACE FUNCTION app.claim_billing_reminder() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oid text; claimed text;
BEGIN
  SELECT p.organization_id INTO oid FROM app.organization_plans p
  JOIN organization_memberships m ON m.organization_id=p.organization_id
  JOIN profiles u ON u.id=m.profile_id
  WHERE m.profile_id=app.user_id() AND m.role='OWNER' AND u.status='active'
    AND p.plan=0 AND coalesce(p.bonus_plan,0)=0 AND p.trial_ends_at<=now()
    AND NOT EXISTS(SELECT 1 FROM app.plan_subscriptions s WHERE s.organization_id=p.organization_id
      AND s.status IN ('active','trialing','past_due'))
  ORDER BY p.trial_ends_at LIMIT 1;
  IF oid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO app.billing_reminders(profile_id,shown_at) VALUES(app.user_id(),now())
    ON CONFLICT(profile_id) DO UPDATE SET shown_at=excluded.shown_at
    WHERE app.billing_reminders.shown_at<=now()-interval '10 hours'
    RETURNING profile_id INTO claimed;
  RETURN CASE WHEN claimed IS NOT NULL THEN oid END;
END $$;
REVOKE ALL ON FUNCTION app.claim_billing_reminder() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_billing_reminder() TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(171) ON CONFLICT DO NOTHING;
