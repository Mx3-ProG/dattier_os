-- Ne pas supprimer les abonnements déjà souscrits. Annulation possible seulement après leur expiration.
UPDATE public.addon_categories SET name='Pilotage et estimations',description='Outils de simulation et d’aide à la décision.' WHERE id='pilotage-tools';
ALTER TABLE public.addon_subscriptions DROP CONSTRAINT addon_subscriptions_addon_check;
ALTER TABLE public.addon_subscriptions ADD CONSTRAINT addon_subscriptions_addon_check
  CHECK (addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain'));
mers' ON CONFLICT DO NOTHING;
DELETE FROM public.addon_legacy_grants WHERE addon_id='gamified-customers';
UPDATE public.addon_subscriptions SET addon='loyalty' WHERE addon='gamified-customers';
INSERT INTO public.addon_installations(restaurant_id,addon_id,installed,updated_by,updated_at)
SELECT restaurant_id,'loyalty',installed,updated_by,updated_at FROM public.addon_installations
WHERE addon_id='gamified-customers' ON CONFLICT (restaurant_id,addon_id)
DO UPDATE SET installed=excluded.installed,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
DELETE FROM public.addon_installations WHERE addon_id='gamified-customers';
ALTER TABLE public.addon_subscriptions ADD CONSTRAINT addon_subscriptions_addon_check
  CHECK (addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain'));
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
  JOIN organizations o ON o.id=r.organization_id JOIN app.organization_plans p ON p.organization_i
CREATE OR REPLACE FUNCTION app.module_available(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH b AS (
    SELECT r.industry='restaurant' AS food,
      coalesce(app.restaurant_plan(r.id),0)>=39 AS studio
    FROM restaurants r
    WHERE r.id=rid
      AND (app.has_restaurant(rid) OR (session_user=current_user AND current_setting('role')='none'))
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM b) THEN
      CASE WHEN module IN (
        'overview','activity','orders','table-booking','catalog','stock','trade-tools','team',
        'finance','bank','payouts','settings','security','website','online-orders','domain',
        'floor','kitchen','bar','recipes','suppliers','deliveries','attendance','payroll',
        'accounting','expenses','client-invoices','invoices','loyalty','qr','analytics',
        'estimation','offline-conflicts','connections','ai-assistant','ai-invoice-extraction'
      ) THEN false END
    ELSE (SELECT CASE module
      -- Toujours présents
      WHEN 'activity' THEN true
      WHEN 'team' THEN true
      WHEN 'settings' THEN true
      WHEN 'security' THEN true
      WHEN 'ai-assistant' THEN true
      -- Aujourd'hui réservés au secteur restauration, sans condition commerciale
      WHEN 'orders' THEN b.food
      WHEN 'catalog' THEN b.food
      WHEN 'stock' THEN b.food
      WHEN 'kitchen' THEN b.food
      WHEN 'bar' THEN b.food
      WHEN 'recipes' THEN b.food
      WHEN 'suppliers' THEN b.food
      WHEN 'deliveries' THEN b.food
      -- Abonnement Studio actif
      WHEN 'overview' THEN b.studio
      WHEN 'finance' THEN b.studio
      WHEN 'bank' THEN b.studio
      WHEN 'payouts' THEN b.studio
      WHEN 'accounting' THEN b.studio
      WHEN 'expenses' THEN b.studio
      -- Modules suspendables (installation, suspension, dépendance, secteur)
      WHEN 'floor' THEN app.module_enabled(rid,'floor')
      WHEN 'table-booking' THEN app.module_enabled(rid,'table-booking')
      -- Add-ons : droit commercial et installation
      WHEN 'website' THEN app.addon_installed(rid,'website')
      WHEN 'online-orders' THEN app.addon_installed(rid,'online-orders')
      WHEN 'domain' THEN app.addon_installed(rid,'domain')
      WHEN 'attendance' THEN app.addon_installed(rid,'attendance')
      WHEN 'payroll' THEN app.addon_installed(rid,'payroll')
      WHEN 'client-invoices' THEN app.addon_installed(rid,'client-invoices')
      WHEN 'invoices' THEN app.addon_installed(rid,'invoices')
      WHEN 'ai-invoice-extraction' THEN app.addon_installed(rid,'invoices')
      WHEN 'loyalty' THEN app.addon_installed(rid,'loyalty')
      WHEN 'offline-conflicts' THEN app.addon_installed(rid,'offline-conflicts')
      WHEN 'connections' THEN app.addon_installed(rid,'connections')
      WHEN 'qr' THEN b.food AND app.addon_installed(rid,'qr')
      -- Licences de la boutique d'add-ons
      WHEN 'analytics' THEN app.addon_installed(rid,'earth-tracker-3d')
      WHEN 'estimation' THEN app.addon_installed(rid,'estimation-studio')
      WHEN 'trade-tools' THEN EXISTS (
        SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
        WHERE l.restaurant_id=rid AND p.kind='business' AND app.addon_installed(rid,l.product_id))
    END FROM b)
  END
$$;
DELETE FROM schema_versions WHERE version=93;
