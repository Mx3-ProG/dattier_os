-- Décision d'accès commerciale unique par module (lot P1-a1).
--
-- app.module_available(commerce, module) reproduit À L'IDENTIQUE la règle appliquée
-- aujourd'hui par la navigation et le snapshot, module par module (champ `legacy` de
-- src/core/modules/manifest.ts). Aucun écran ni service ne l'utilise encore : cette
-- migration n'ouvre ni ne ferme aucun accès. La bascule se fera au lot P1-a2.
--
-- Contrat :
-- - TRUE / FALSE pour un module connu ;
-- - NULL pour un module inconnu (le code applicatif le traite comme FALSE) ;
-- - FALSE si le commerce n'est pas visible dans le contexte courant (même garde que
--   app.restaurant_plan : membre, administrateur, support accordé ou canal public du
--   commerce). Une seule fonction ne révèle donc rien d'un autre commerce.
-- Les permissions de rôle restent vérifiées à part par les services.
CREATE FUNCTION app.module_available(rid text, module text) RETURNS boolean
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
REVOKE ALL ON FUNCTION app.module_available(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.module_available(text,text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(90);
