-- Retour à 160 : retire Click & Collect Premium. Résilier d'abord les abonnements à
-- cet add-on : la contrainte refuserait les lignes restantes.
DELETE FROM public.addon_legacy_grants WHERE addon_id='click-collect-premium';
DELETE FROM public.addon_installations WHERE addon_id='click-collect-premium';
ALTER TABLE public.addon_subscriptions DROP CONSTRAINT IF EXISTS addon_subscriptions_addon_check;
ALTER TABLE public.addon_subscriptions ADD CONSTRAINT addon_subscriptions_addon_check
  CHECK (addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain','prospect-scanner','pipeline-crm','customer-health'));
ALTER TABLE public.addon_legacy_grants DROP CONSTRAINT IF EXISTS addon_legacy_grants_addon_id_check;
ALTER TABLE public.addon_legacy_grants ADD CONSTRAINT addon_legacy_grants_addon_id_check
  CHECK (addon_id IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain','prospect-scanner','pipeline-crm','customer-health'));

CREATE OR REPLACE FUNCTION app.paid_addon_entitled(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain','prospect-scanner','pipeline-crm','customer-health')
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
    WHEN 'prospect-scanner' THEN app.paid_addon_entitled(rid,'prospect-scanner')
    WHEN 'pipeline-crm' THEN app.paid_addon_entitled(rid,'pipeline-crm')
    WHEN 'customer-health' THEN app.paid_addon_entitled(rid,'customer-health')
    ELSE EXISTS (SELECT 1 FROM addon_licenses l WHERE l.restaurant_id=rid AND l.product_id=addon
      AND l.status='active' AND (l.valid_until IS NULL OR l.valid_until>now()))
  END
$$;

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
        'estimation','prospect-scanner','pipeline-crm','customer-health','offline-conflicts','connections','ai-assistant','ai-invoice-extraction',
        'services','products'
      ) THEN false END
    ELSE (SELECT CASE module
      -- Toujours présents
      WHEN 'activity' THEN true
      WHEN 'team' THEN true
      WHEN 'settings' THEN true
      WHEN 'security' THEN true
      WHEN 'ai-assistant' THEN true
      WHEN 'services' THEN true
      WHEN 'products' THEN true
      -- Secteur restauration, ou affichage demandé par le commerce
      WHEN 'orders' THEN b.food OR app.module_shown(rid,'orders')
      WHEN 'catalog' THEN b.food OR app.module_shown(rid,'catalog')
      WHEN 'stock' THEN b.food OR app.module_shown(rid,'stock')
      WHEN 'kitchen' THEN b.food OR app.module_shown(rid,'kitchen')
      WHEN 'bar' THEN b.food OR app.module_shown(rid,'bar')
      WHEN 'recipes' THEN b.food OR app.module_shown(rid,'recipes')
      WHEN 'suppliers' THEN b.food OR app.module_shown(rid,'suppliers')
      WHEN 'deliveries' THEN b.food OR app.module_shown(rid,'deliveries')
      -- Abonnement Studio actif
      WHEN 'overview' THEN b.studio
      WHEN 'finance' THEN b.studio
      WHEN 'bank' THEN b.studio
      WHEN 'payouts' THEN b.studio
      WHEN 'accounting' THEN b.studio
      WHEN 'expenses' THEN b.studio
      -- Modules suspendables (installation, suspension, secteur ou affichage)
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
      WHEN 'qr' THEN (b.food OR app.module_shown(rid,'qr')) AND app.addon_installed(rid,'qr')
      -- Licences de la boutique d'add-ons
      WHEN 'analytics' THEN app.addon_installed(rid,'earth-tracker-3d')
      WHEN 'estimation' THEN app.addon_installed(rid,'estimation-studio')
      WHEN 'prospect-scanner' THEN app.addon_installed(rid,'prospect-scanner')
      WHEN 'pipeline-crm' THEN app.addon_installed(rid,'pipeline-crm')
      WHEN 'customer-health' THEN app.addon_installed(rid,'customer-health')
      WHEN 'trade-tools' THEN EXISTS (
        SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
        WHERE l.restaurant_id=rid AND p.kind='business' AND app.addon_installed(rid,l.product_id))
    END FROM b)
  END
$$;

DELETE FROM schema_versions WHERE version=185;
