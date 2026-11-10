-- Droits hérités des abonnés actuels (lot P1-a2).
--
-- Le passage à l'offre cible (§ 9 de docs/platform/CORE-ET-MODULES.md) fait passer en
-- add-on des modules aujourd'hui compris dans l'abonnement. Un abonné payant actuel les
-- conserve sans surcoût : ce droit est noté ici, par établissement et par module.
--
-- Périmètre décidé le 10 novembre 2026 : le site internet et la boutique en ligne
-- (src/core/modules/manifest.ts, `grandfatheredModules`). Les autres modules qui
-- deviennent payants (salle, cuisine, bar, recettes, fournisseurs, réceptions,
-- comptabilité, dépenses) ne sont pas conservés. Les add-ons déjà vendus à part
-- (factures, présences, paie…) gardent leurs droits hérités de 073.
--
-- Bénéficiaires : établissements non archivés d'une organisation active avec un
-- abonnement payant effectif (plan payé ou bonus de parrainage). Un essai gratuit en
-- cours ne donne aucun droit hérité.
--
-- Cette table n'ouvre encore aucun accès : app.module_available applique toujours les
-- règles actuelles. Elle sera lue par la règle cible lors de la bascule de l'offre. La
-- migration de bascule rappellera app.record_module_legacy_grants() juste avant, pour
-- inclure les abonnés arrivés entre-temps (insertion idempotente).
CREATE TABLE public.module_legacy_grants (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  module_id text NOT NULL CHECK (module_id IN ('website','online-orders')),
  source text NOT NULL DEFAULT 'studio-2026-11',
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id,module_id)
);
ALTER TABLE public.module_legacy_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY module_legacy_read ON public.module_legacy_grants FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.module_legacy_grants FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.module_legacy_grants TO atacuisine_app;

-- Réservée aux migrations et à l'exploitation : jamais exposée au rôle applicatif.
CREATE FUNCTION app.record_module_legacy_grants() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE added integer;
BEGIN
  INSERT INTO public.module_legacy_grants(restaurant_id,module_id)
  SELECT r.id, m.module_id
  FROM public.restaurants r
  JOIN public.organizations o ON o.id=r.organization_id AND o.status='active'
  JOIN app.organization_plans p ON p.organization_id=r.organization_id
  CROSS JOIN (VALUES ('website'),('online-orders')) AS m(module_id)
  WHERE r.archived_at IS NULL
    AND app.effective_plan(p.plan,p.bonus_plan)>=39
  ON CONFLICT (restaurant_id,module_id) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END
$$;
REVOKE ALL ON FUNCTION app.record_module_legacy_grants() FROM PUBLIC;

CREATE FUNCTION app.module_legacy_granted(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  -- Même garde que app.module_available : rien n'est révélé d'un autre commerce.
  SELECT (app.has_restaurant(rid) OR (session_user=current_user AND current_setting('role')='none'))
    AND EXISTS (SELECT 1 FROM public.module_legacy_grants g
      WHERE g.restaurant_id=rid AND g.module_id=module)
$$;
REVOKE ALL ON FUNCTION app.module_legacy_granted(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.module_legacy_granted(text,text) TO atacuisine_app;

SELECT app.record_module_legacy_grants();

INSERT INTO schema_versions(version) VALUES(91);
