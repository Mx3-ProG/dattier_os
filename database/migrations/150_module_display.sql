-- Affichage des add-ons dans le tableau de bord, distinct de l'installation et de la suspension.
--
-- Trois gestes indépendants sur chaque add-on :
-- - désinstaller (addon_installations) : retire le module, données et droit conservés ;
-- - suspendre (module_settings) : met en pause un module installé ;
-- - afficher / masquer (cette table) : choisit si le module apparaît dans le tableau de bord.
--
-- shown = true  : le module est affiché même hors du secteur visé (ex. plan de salle pour un
--                 salon de coiffure). Seul le filtre de secteur est levé : le droit commercial,
--                 l'installation, la suspension et les permissions de rôle restent exigés.
-- shown = false : le module reste installé et fonctionne (site public, données), mais son
--                 entrée disparaît du tableau de bord. Pur choix de présentation.
-- Aucune ligne : comportement par défaut, inchangé pour tous les établissements existants.
-- Idempotent : plusieurs sessions de développement partagent la même base de démonstration.

CREATE TABLE IF NOT EXISTS public.module_display (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  module_id text NOT NULL CHECK (module_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  shown boolean NOT NULL,
  updated_by text REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, module_id)
);
ALTER TABLE public.module_display ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS module_display_read ON public.module_display;
CREATE POLICY module_display_read ON public.module_display FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.module_display FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.module_display TO atacuisine_app;

-- Modules dont l'affichage se règle. Jamais la configuration ni les add-ons eux-mêmes :
-- l'administrateur ne doit pas pouvoir se retirer l'accès à cet écran.
CREATE OR REPLACE FUNCTION app.module_displayable(module text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT module IN (
    'orders','table-booking','catalog','stock','trade-tools','website','floor','kitchen','bar',
    'recipes','suppliers','deliveries','attendance','payroll','accounting','expenses',
    'client-invoices','invoices','loyalty','qr','analytics','estimation','prospect-scanner',
    'pipeline-crm','customer-health','services','products'
  )
$$;

CREATE OR REPLACE FUNCTION app.module_shown(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce((SELECT d.shown FROM module_display d WHERE d.restaurant_id=rid AND d.module_id=module),false)
$$;
REVOKE ALL ON FUNCTION app.module_shown(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.module_shown(text,text) TO atacuisine_app;

-- shown NULL : retour au comportement par défaut.
CREATE OR REPLACE FUNCTION app.module_display_set(rid text, module text, desired boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('app.public',true)='true' OR NOT app.in_restaurant(rid)
     OR NOT app.addon_store_manager(rid) THEN
    RAISE EXCEPTION 'Affichage des add-ons réservé au super admin de l’établissement.';
  END IF;
  IF NOT app.module_displayable(module) THEN
    RAISE EXCEPTION 'L’affichage de ce module ne se règle pas.';
  END IF;
  PERFORM 1 FROM restaurants WHERE id=rid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Établissement indisponible.'; END IF;
  IF desired IS NULL THEN
    DELETE FROM module_display WHERE restaurant_id=rid AND module_id=module;
  ELSE
    INSERT INTO module_display(restaurant_id,module_id,shown,updated_by)
      VALUES(rid,module,desired,app.user_id())
      ON CONFLICT (restaurant_id,module_id) DO UPDATE SET shown=excluded.shown,
        updated_by=excluded.updated_by,updated_at=now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.module_display_set(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.module_display_set(text,text,boolean) TO atacuisine_app;

-- Plan de salle et réservations : le secteur restauration OU l'affichage demandé.
CREATE OR REPLACE FUNCTION app.module_enabled(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM restaurants r WHERE r.id=rid
      AND (r.industry='restaurant' OR app.module_shown(rid,module)))
    AND module IN ('floor','table-booking')
    AND app.addon_installed(rid,CASE WHEN module='table-booking' THEN 'booking' ELSE 'floor' END)
    AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
      AND s.module_id=module AND s.applied_state='suspended')
$$;

-- Même décision que 093, avec :
-- - les modules du secteur restauration ouverts aux autres secteurs quand ils sont affichés ;
-- - Services et Produits (Gestion), compris dans Studio pour tous les secteurs.
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

INSERT INTO schema_versions(version) VALUES(150) ON CONFLICT DO NOTHING;
