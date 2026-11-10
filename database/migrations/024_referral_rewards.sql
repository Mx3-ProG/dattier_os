-- Gamified referral program. Rules mirrored in src/features/platform/referrals.ts:
--  * free tier: 39 € → 3 paying referrals, 69 € → 5, 99 € → 10;
--  * reaching a higher plan's tier unlocks that plan's features (bonus_plan);
--  * 1 month offered to the referrer per referral, at its first activation;
--  * 1 month offered to the referred organisation (welcome);
--  * monthly challenge: 2 activations in a calendar month → 1 extra month.
-- Billing stays manual: rewards are a ledger the operator consumes
-- (scripts/billing-statement.ts).
ALTER TABLE app.referral_codes ADD COLUMN leaderboard_public boolean NOT NULL DEFAULT false;
ALTER TABLE app.organization_plans ADD COLUMN bonus_plan integer NOT NULL DEFAULT 0 CHECK (bonus_plan IN (0,39,69,99));

CREATE TABLE app.referral_rewards (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('referral','welcome','challenge')),
  months integer NOT NULL DEFAULT 1 CHECK (months > 0),
  source_organization_id text REFERENCES public.organizations ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  UNIQUE (organization_id, key)
);
CREATE INDEX referral_rewards_available ON app.referral_rewards(organization_id) WHERE consumed_at IS NULL;
CREATE INDEX referrals_activated ON app.referrals(activated_at) WHERE activated_at IS NOT NULL;
REVOKE ALL ON app.referral_rewards FROM PUBLIC, atacuisine_app;

-- Plan whose features the organisation can use: the paid plan, or a higher one
-- unlocked by referrals. Nothing is unlocked before a paid activation.
CREATE FUNCTION app.effective_plan(paid integer, bonus integer) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN paid > 0 THEN greatest(paid, bonus) ELSE 0 END $$;

CREATE FUNCTION app.referral_bonus_plan(paying integer) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN paying >= 10 THEN 99 WHEN paying >= 5 THEN 69 WHEN paying >= 3 THEN 39 ELSE 0 END
$$;

CREATE FUNCTION app.refresh_referrer(oid text) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE app.organization_plans SET bonus_plan=app.referral_bonus_plan(app.paying_referrals(oid))
  WHERE organization_id=oid AND bonus_plan IS DISTINCT FROM app.referral_bonus_plan(app.paying_referrals(oid));
END $$;
REVOKE ALL ON FUNCTION app.refresh_referrer(text) FROM PUBLIC, atacuisine_app;

CREATE OR REPLACE FUNCTION app.referral_plan_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  referrer text;
  first_activation boolean := false;
  referred_name text;
BEGIN
  IF NEW.plan > 0 THEN
    PERFORM app.ensure_referral_code(NEW.organization_id);
    UPDATE app.referrals SET activated_at=now()
    WHERE referred_organization_id=NEW.organization_id AND activated_at IS NULL
    RETURNING referrer_organization_id INTO referrer;
    first_activation := referrer IS NOT NULL;
  END IF;
  IF referrer IS NULL THEN
    SELECT referrer_organization_id INTO referrer FROM app.referrals
    WHERE referred_organization_id=NEW.organization_id;
  END IF;
  IF referrer IS NULL THEN RETURN NEW; END IF;

  IF first_activation THEN
    INSERT INTO app.referral_rewards(organization_id,key,kind,source_organization_id)
    VALUES (referrer,'referral:'||NEW.organization_id,'referral',NEW.organization_id)
    ON CONFLICT DO NOTHING;
    IF (SELECT count(*) FROM app.referrals WHERE referrer_organization_id=referrer
        AND activated_at >= date_trunc('month', now())) >= 2 THEN
      INSERT INTO app.referral_rewards(organization_id,key,kind)
      VALUES (referrer,'challenge:'||to_char(now(),'YYYY-MM'),'challenge')
      ON CONFLICT DO NOTHING;
    END IF;
    SELECT name INTO referred_name FROM organizations WHERE id=NEW.organization_id;
    INSERT INTO notifications(id,restaurant_id,message)
    SELECT gen_random_uuid()::text, r.id,
      'Parrainage : '||referred_name||' vient de s’abonner grâce à vous. 1 mois offert ajouté à vos gains.'
    FROM restaurants r WHERE r.organization_id=referrer AND r.archived_at IS NULL;
  END IF;
  PERFORM app.refresh_referrer(referrer);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.attach_referral(oid text, referral text) RETURNS boolean
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
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO app.referral_rewards(organization_id,key,kind,source_organization_id)
  VALUES (oid,'welcome','welcome',referrer) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

-- Feature access now follows the effective plan.
CREATE OR REPLACE FUNCTION app.restaurant_plan(rid text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.effective_plan(p.plan,p.bonus_plan) FROM restaurants r JOIN app.organization_plans p ON p.organization_id=r.organization_id
  JOIN organizations o ON o.id=r.organization_id
  WHERE r.id=rid AND r.archived_at IS NULL AND o.status='active' AND (app.has_restaurant(rid) OR (session_user=current_user AND current_setting('role')='none'))
$$;
DROP FUNCTION app.organization_plan(text);
CREATE FUNCTION app.organization_plan(oid text) RETURNS TABLE(plan integer,seats integer,occupied integer,paid_plan integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.effective_plan(p.plan,p.bonus_plan),p.seats,(SELECT count(*)::int FROM restaurants r WHERE r.organization_id=oid AND r.archived_at IS NULL),p.plan
  FROM app.organization_plans p WHERE p.organization_id=oid AND app.org_member(oid)
$$;
CREATE OR REPLACE FUNCTION app.resolve_domain(host text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT d.restaurant_id FROM restaurant_domains d JOIN restaurants r ON r.id=d.restaurant_id JOIN organizations o ON o.id=r.organization_id WHERE d.hostname=lower(host) AND d.verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM app.organization_plans p WHERE p.organization_id=o.id AND app.effective_plan(p.plan,p.bonus_plan)>=69) AND r.archived_at IS NULL AND o.status='active' $$;
CREATE OR REPLACE FUNCTION app.reward_plan_allowed(reward_token text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM promo_codes c JOIN restaurants r ON r.id=c.restaurant_id
  JOIN organizations o ON o.id=r.organization_id JOIN app.organization_plans p ON p.organization_id=o.id
  WHERE c.token=reward_token AND app.effective_plan(p.plan,p.bonus_plan)>=69 AND r.archived_at IS NULL AND o.status='active')
$$;
CREATE OR REPLACE FUNCTION app.platform_sites() RETURNS TABLE(restaurant_id text,published_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,v.published_at FROM restaurants r
 JOIN organizations o ON o.id=r.organization_id AND o.status='active'
 JOIN restaurant_cms c ON c.restaurant_id=r.id
 JOIN cms_versions v ON v.id=c.published_version_id AND v.restaurant_id=r.id
 JOIN app.organization_plans p ON p.organization_id=o.id AND app.effective_plan(p.plan,p.bonus_plan)>=69
 WHERE r.archived_at IS NULL AND (v.config #>> '{seo,noIndex}')='false' AND app.primary_domain(r.id) IS NULL
 ORDER BY r.id LIMIT 50000 $$;

-- Dashboard summary, owners and administrators only.
DROP FUNCTION app.referral_summary(text);
CREATE FUNCTION app.referral_summary(oid text) RETURNS TABLE(
  referral_code text, leaderboard_public boolean, referrals jsonb,
  paying_referrals integer, activated_total integer, activated_month integer,
  credits integer, rewards jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT c.code, coalesce(c.leaderboard_public,false),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'name', o.name, 'created_at', f.created_at, 'activated_at', f.activated_at,
      'paying', o.status='active' AND p.plan > 0
    ) ORDER BY f.created_at DESC)
    FROM app.referrals f
    JOIN organizations o ON o.id=f.referred_organization_id
    JOIN app.organization_plans p ON p.organization_id=f.referred_organization_id
    WHERE f.referrer_organization_id=oid), '[]'::jsonb),
    app.paying_referrals(oid),
    (SELECT count(*)::int FROM app.referrals WHERE referrer_organization_id=oid AND activated_at IS NOT NULL),
    (SELECT count(*)::int FROM app.referrals WHERE referrer_organization_id=oid AND activated_at >= date_trunc('month', now())),
    (SELECT coalesce(sum(months),0)::int FROM app.referral_rewards WHERE organization_id=oid AND consumed_at IS NULL),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'kind', w.kind, 'months', w.months, 'granted_at', w.granted_at, 'consumed_at', w.consumed_at,
      'source', s.name
    ) ORDER BY w.granted_at DESC)
    FROM app.referral_rewards w LEFT JOIN organizations s ON s.id=w.source_organization_id
    WHERE w.organization_id=oid), '[]'::jsonb)
  FROM (SELECT oid AS id) self LEFT JOIN app.referral_codes c ON c.organization_id=self.id
  WHERE app.org_admin(oid)
$$;

-- Monthly leaderboard: names only for organisations that opted in.
CREATE FUNCTION app.referral_leaderboard(oid text) RETURNS TABLE(rank integer, name text, referrals integer, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH counts AS (
    SELECT f.referrer_organization_id AS id, count(*)::int AS n FROM app.referrals f
    JOIN organizations o ON o.id=f.referrer_organization_id AND o.status='active'
    WHERE f.activated_at >= date_trunc('month', now())
    GROUP BY f.referrer_organization_id
  ), ranked AS (
    SELECT id, n, rank() OVER (ORDER BY n DESC)::int AS r FROM counts
  )
  SELECT k.r, CASE WHEN k.id=oid OR c.leaderboard_public THEN o.name END, k.n, k.id=oid
  FROM ranked k JOIN organizations o ON o.id=k.id
  LEFT JOIN app.referral_codes c ON c.organization_id=k.id
  WHERE app.org_admin(oid) AND (k.r <= 10 OR k.id=oid)
  ORDER BY k.r, k.id=oid DESC, o.name
  LIMIT 11
$$;

CREATE FUNCTION app.set_referral_visibility(oid text, visible boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT app.org_admin(oid) THEN RAISE EXCEPTION 'Administration non autorisée.'; END IF;
  UPDATE app.referral_codes SET leaderboard_public=visible WHERE organization_id=oid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parrainage disponible après activation du forfait.'; END IF;
END $$;

-- Subscription page banner: the referrer's name, for an active paying referrer only.
CREATE FUNCTION app.referral_invitation(referral text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT o.name FROM app.referral_codes c
  JOIN organizations o ON o.id=c.organization_id AND o.status='active'
  JOIN app.organization_plans p ON p.organization_id=c.organization_id AND p.plan > 0
  WHERE c.code=upper(referral)
$$;

SELECT app.refresh_referrer(organization_id) FROM app.referral_codes;

INSERT INTO schema_versions(version) VALUES (24);
