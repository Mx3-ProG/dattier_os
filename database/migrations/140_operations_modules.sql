-- Opérations modulaires : Commandes, Cuisine et Bar deviennent des modules
-- gratuits (licences « ops-* »), installés d'office pour la restauration et
-- activables en un clic par les autres métiers depuis la boutique d'add-ons.
-- Services et Autre reçoivent l'agenda et les devis. Personne ne perd ce qu'il
-- utilise : les droits actuels sont convertis en licences.
-- Idempotent : la base de démonstration partagée peut la rejouer.
INSERT INTO public.addon_categories(id,name,description,position) VALUES
  ('operations','Opérations','Commandes, cuisine et bar : les écrans du service, à activer selon votre métier.',39)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('ops-orders','operations','operations','operations','Commandes','Prise de commande, suivi des statuts et règlement, sur place, à emporter ou en ligne.','free',0,91),
  ('ops-kitchen','operations','operations','operations','Cuisine','L’écran de préparation : chaque commande arrive en ticket, de la mise en route au « prêt ».','free',0,92),
  ('ops-bar','operations','operations','operations','Bar','Un second poste de préparation pour les boissons ou le comptoir, séparé de la cuisine.','free',0,93)
ON CONFLICT (id) DO NOTHING;

-- Droits actuels convertis en licences gratuites.
INSERT INTO public.addon_licenses(restaurant_id,product_id,source)
  SELECT r.id,p.product,'free' FROM restaurants r
  CROSS JOIN (VALUES ('ops-orders'),('ops-kitchen'),('ops-bar')) AS p(product)
  WHERE r.industry='restaurant'
ON CONFLICT (restaurant_id,product_id) DO NOTHING;
INSERT INTO public.addon_licenses(restaurant_id,product_id,source)
  SELECT r.id,'ops-orders','free' FROM restaurants r
  WHERE r.industry IN ('retail','other') OR EXISTS (SELECT 1 FROM orders o WHERE o.restaurant_id=r.id)
ON CONFLICT (restaurant_id,product_id) DO NOTHING;
INSERT INTO public.addon_licenses(restaurant_id,product_id,source)
  SELECT r.id,p.product,'free' FROM restaurants r
  CROSS JOIN (VALUES ('appointment-booking'),('quote-builder')) AS p(product)
  WHERE r.industry IN ('services','other')
ON CONFLICT (restaurant_id,product_id) DO NOTHING;

CREATE OR REPLACE FUNCTION app.module_available(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH b AS (
    SELECT coalesce(app.restaurant_plan(r.id),0)>=39 AS studio
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
        'estimation','prospect-scanner','pipeline-crm','customer-health','offline-conflicts','connections','ai-assistant','ai-invoice-extraction'
      ) THEN false END
    ELSE (SELECT CASE module
      -- Toujours présents
      WHEN 'activity' THEN true
      WHEN 'team' THEN true
      WHEN 'settings' THEN true
      WHEN 'security' THEN true
      WHEN 'ai-assistant' THEN true
      -- Ouverts à toutes les familles d'activité (commandes, cuisine et bar : modules gratuits ci-dessous)
      WHEN 'orders' THEN app.addon_installed(rid,'ops-orders')
      WHEN 'catalog' THEN true
      WHEN 'stock' THEN true
      WHEN 'kitchen' THEN app.addon_installed(rid,'ops-kitchen')
      WHEN 'bar' THEN app.addon_installed(rid,'ops-bar')
      WHEN 'recipes' THEN true
      WHEN 'suppliers' THEN true
      WHEN 'deliveries' THEN true
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
      WHEN 'qr' THEN app.addon_installed(rid,'qr')
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

-- Vue d'ensemble : nouveau bloc « Commandes en préparation ».
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.pilotage_preferences'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%hidden%'
  LOOP
    EXECUTE format('ALTER TABLE public.pilotage_preferences DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.pilotage_preferences ADD CONSTRAINT pilotage_preferences_hidden_check
  CHECK(cardinality(hidden)<=40 AND hidden <@ ARRAY['receipts','orders','preparing','sales','goal','service','favorites','qr','news','stock','customers','team','tables','ready','reservations','appointments','agenda','salon-stock','sites','quotes','reserves','equipment','followups']::text[]);

INSERT INTO schema_versions(version) VALUES(140) ON CONFLICT DO NOTHING;
