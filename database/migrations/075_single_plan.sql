-- Single 39 € subscription. Everything formerly reserved to the 69/99 plans
-- (website, SEO, finance, online shop) is included; the custom domain becomes
-- a monthly add-on. Rules mirrored in src/features/platform/pricing.ts and
-- src/features/platform/referrals.ts: change both together.

-- 1. The custom domain is now a paid add-on.
ALTER TABLE public.addon_subscriptions DROP CONSTRAINT addon_subscriptions_addon_check;
ALTER TABLE public.addon_subscriptions ADD CONSTRAINT addon_subscriptions_addon_check
  CHECK (addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain'));
ALTER TABLE public.addon_legacy_grants DROP CONSTRAINT addon_legacy_grants_addon_id_check;
ALTER TABLE public.addon_legacy_grants ADD CONSTRAINT addon_legacy_grants_addon_id_check
  CHECK (addon_id IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain'));

-- Establishments already served on a verified domain keep it for free.
-- Computed before plans are flattened, from the access they had until now.
INSERT INTO public.addon_legacy_grants(restaurant_id,addon_id)
SELECT DISTINCT d.restaurant_id,'domain' FROM public.restaurant_domains d
JOIN public.restaurants r ON r.id=d.restaurant_id AND r.archived_at IS NULL
JOIN app.organization_plans p ON p.organization_id=r.organization_id
WHERE d.verified_at IS NOT NULL AND app.effective_plan(p.plan,p.bonus_plan)>=69
ON CONFLICT DO NOTHING;

-- 2. Every paid plan becomes the single plan.
ALTER TABLE app.organization_plans DROP CONSTRAINT IF EXISTS organization_plans_plan_check;
ALTER TABLE app.organization_plans DROP CONSTRAINT IF EXISTS organization_plans_bonus_plan_check;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_requested_plan_check;
UPDATE app.organization_plans SET plan=39 WHERE plan>39;
UPDATE app.organization_plans SET bonus_plan=39 WHERE bonus_plan>39;
UPDATE public.organizations SET requested_plan=39 WHERE requested_plan<>39;
ALTER TABLE app.organization_plans ADD CONSTRAINT organization_plans_plan_check CHECK (plan IN (0,39));
ALTER TABLE app.organization_plans ADD CONSTRAINT organization_plans_bonus_plan_check CHECK (bonus_plan IN (0,39));
ALTER TABLE public.organizations ADD CONSTRAINT organizations_requested_plan_check CHECK (requested_plan=39);

-- 3. Referrals: 3 paying referrals make the plan free; no higher plan to unlock.
CREATE OR REPLACE FUNCTION app.referral_bonus_plan(paying integer) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN paying >= 3 THEN 39 ELSE 0 END $$;

-- 4. Former 69/99 thresholds now follow the single subscription.
CREATE OR REPLACE FUNCTION app.table_quota(p integer) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN p >= 39 THEN NULL ELSE 50 END $$;

CREATE OR REPLACE FUNCTION app.reward_plan_allowed(reward_token text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM promo_codes c JOIN restaurants r ON r.id=c.restaurant_id
  JOIN organizations o ON o.id=r.organization_id JOIN app.organization_plans p ON p.organization_id=o.id
  WHERE c.token=reward_token AND app.effective_plan(p.plan,p.bonus_plan)>=39 AND r.archived_at IS NULL AND o.status='active')
$$;

CREATE OR REPLACE FUNCTION app.platform_sites() RETURNS TABLE(restaurant_id text,published_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,v.published_at FROM restaurants r
 JOIN organizations o ON o.id=r.organization_id AND o.status='active'
 JOIN restaurant_cms c ON c.restaurant_id=r.id
 JOIN cms_versions v ON v.id=c.published_version_id AND v.restaurant_id=r.id
 JOIN app.organization_plans p ON p.organization_id=o.id AND app.effective_plan(p.plan,p.bonus_plan)>=39
 WHERE r.archived_at IS NULL AND (v.config #>> '{seo,noIndex}')='false' AND app.primary_domain(r.id) IS NULL
 ORDER BY r.id LIMIT 50000 $$;

-- Host resolution runs without a tenant context, so the domain right is read
-- directly instead of through app.restaurant_plan.
CREATE OR REPLACE FUNCTION app.resolve_domain(host text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT d.restaurant_id FROM restaurant_domains d
  JOIN restaurants r ON r.id=d.restaurant_id JOIN organizations o ON o.id=r.organization_id
  JOIN app.organization_plans p ON p.organization_id=o.id
  WHERE d.hostname=lower(host) AND d.verified_at IS NOT NULL
    AND app.effective_plan(p.plan,p.bonus_plan)>=39 AND r.archived_at IS NULL AND o.status='active'
    AND (EXISTS (SELECT 1 FROM addon_legacy_grants g WHERE g.restaurant_id=r.id AND g.addon_id='domain')
      OR EXISTS (SELECT 1 FROM addon_subscriptions s WHERE s.restaurant_id=r.id AND s.addon='domain'
        AND s.status='active' AND s.valid_until>now()))
    AND coalesce((SELECT i.installed FROM addon_installations i WHERE i.restaurant_id=r.id AND i.addon_id='domain'),true)
$$;

CREATE OR REPLACE FUNCTION app.paid_addon_entitled(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain')
    AND coalesce(app.restaurant_plan(rid),0)>=39 AND (
      EXISTS (SELECT 1 FROM addon_legacy_grants g WHERE g.restaurant_id=rid AND g.addon_id=addon)
      OR EXISTS (SELECT 1 FROM addon_subscriptions s WHERE s.restaurant_id=rid AND s.addon=addon
        AND s.status='active' AND s.valid_until>now())
    )
$$;

CREATE OR REPLACE FUNCTION app.addon_entitled(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE addon
    WHEN 'floor' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'booking' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'website' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'online-orders' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'loyalty' THEN app.paid_addon_entitled(rid,'loyalty')
    WHEN 'invoices' THEN app.paid_addon_entitled(rid,'invoices')
    WHEN 'attendance' THEN app.paid_addon_entitled(rid,'attendance')
    WHEN 'client-invoices' THEN app.paid_addon_entitled(rid,'client-invoices')
    WHEN 'payroll' THEN app.paid_addon_entitled(rid,'payroll')
    WHEN 'offline-conflicts' THEN app.paid_addon_entitled(rid,'offline-conflicts')
    WHEN 'connections' THEN app.paid_addon_entitled(rid,'connections')
    WHEN 'qr' THEN app.paid_addon_entitled(rid,'qr')
    WHEN 'domain' THEN app.paid_addon_entitled(rid,'domain')
    ELSE EXISTS (SELECT 1 FROM addon_licenses l WHERE l.restaurant_id=rid AND l.product_id=addon
      AND l.status='active' AND (l.valid_until IS NULL OR l.valid_until>now()))
  END
$$;

INSERT INTO schema_versions(version) VALUES(75);
