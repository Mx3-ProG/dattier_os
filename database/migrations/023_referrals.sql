-- Referral program: one level only. A paying organisation gets a referral code;
-- an organisation created through that code becomes its referral ("filleul").
-- The referral counts while the referred organisation is active on a paid plan.
-- The free-subscription threshold lives in application code (pricing.ts).
CREATE TABLE app.referral_codes (
  organization_id text PRIMARY KEY REFERENCES public.organizations ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-F0-9]{10}$')
);
CREATE TABLE app.referrals (
  referred_organization_id text PRIMARY KEY REFERENCES public.organizations ON DELETE CASCADE,
  referrer_organization_id text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  CHECK (referred_organization_id <> referrer_organization_id)
);
CREATE INDEX referrals_referrer ON app.referrals(referrer_organization_id);
REVOKE ALL ON app.referral_codes, app.referrals FROM PUBLIC, atacuisine_app;

CREATE FUNCTION app.ensure_referral_code(oid text) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE candidate text;
BEGIN
  IF EXISTS(SELECT 1 FROM app.referral_codes WHERE organization_id=oid) THEN RETURN; END IF;
  LOOP
    candidate := upper(substr(encode(sha256(convert_to(oid||random()::text||clock_timestamp()::text,'UTF8')),'hex'),1,10));
    BEGIN
      INSERT INTO app.referral_codes(organization_id,code) VALUES(oid,candidate);
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS(SELECT 1 FROM app.referral_codes WHERE organization_id=oid) THEN RETURN; END IF;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.ensure_referral_code(text) FROM PUBLIC, atacuisine_app;

-- A paid plan gives the organisation its code and activates it as a referral.
CREATE FUNCTION app.referral_plan_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.plan > 0 THEN
    PERFORM app.ensure_referral_code(NEW.organization_id);
    UPDATE app.referrals SET activated_at=now()
    WHERE referred_organization_id=NEW.organization_id AND activated_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER referral_plan_changed AFTER INSERT OR UPDATE OF plan ON app.organization_plans
FOR EACH ROW EXECUTE FUNCTION app.referral_plan_changed();

SELECT app.ensure_referral_code(organization_id) FROM app.organization_plans WHERE plan > 0;

-- Called right after onboarding, by the new organisation's owner. Invalid,
-- self-referral or late codes are ignored rather than blocking the sign-up.
CREATE FUNCTION app.attach_referral(oid text, referral text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE referrer text;
BEGIN
  IF NOT app.org_admin(oid) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM app.organization_plans WHERE organization_id=oid AND plan > 0) THEN RETURN false; END IF;
  SELECT c.organization_id INTO referrer FROM app.referral_codes c
  JOIN organizations o ON o.id=c.organization_id AND o.status='active'
  JOIN app.organization_plans p ON p.organization_id=c.organization_id AND p.plan > 0
  WHERE c.code=upper(referral);
  IF referrer IS NULL OR referrer=oid THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=referrer AND profile_id=app.user_id()) THEN
    RETURN false;
  END IF;
  INSERT INTO app.referrals(referred_organization_id,referrer_organization_id)
  VALUES(oid,referrer) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;

-- Billing side (operator): referrals currently paying for an organisation.
CREATE FUNCTION app.paying_referrals(oid text) RETURNS integer
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT count(*)::int FROM app.referrals f
  JOIN organizations o ON o.id=f.referred_organization_id AND o.status='active'
  JOIN app.organization_plans p ON p.organization_id=f.referred_organization_id AND p.plan > 0
  WHERE f.referrer_organization_id=oid
$$;
REVOKE ALL ON FUNCTION app.paying_referrals(text) FROM PUBLIC, atacuisine_app;

-- Dashboard side: only the organisation's owners and administrators see it.
CREATE FUNCTION app.referral_summary(oid text) RETURNS TABLE(referral_code text, referrals jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT (SELECT c.code FROM app.referral_codes c WHERE c.organization_id=oid),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'name', o.name,
      'created_at', f.created_at,
      'activated_at', f.activated_at,
      'paying', o.status='active' AND p.plan > 0
    ) ORDER BY f.created_at DESC)
    FROM app.referrals f
    JOIN organizations o ON o.id=f.referred_organization_id
    JOIN app.organization_plans p ON p.organization_id=f.referred_organization_id
    WHERE f.referrer_organization_id=oid), '[]'::jsonb)
  WHERE app.org_admin(oid)
$$;

INSERT INTO schema_versions(version) VALUES (23);
