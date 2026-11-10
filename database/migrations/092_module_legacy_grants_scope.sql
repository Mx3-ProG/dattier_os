-- Périmètre des droits hérités réduit au site et à la boutique (décision du 10 novembre 2026).
-- Sur une base neuve, 091 applique déjà ce périmètre : cette migration n'y change rien.
-- Elle aligne seulement une base qui avait appliqué une version préliminaire de 091
-- (dix modules), comme la base de démonstration locale. Aucun accès ne lisait ces droits.
DELETE FROM public.module_legacy_grants WHERE module_id NOT IN ('website','online-orders');
ALTER TABLE public.module_legacy_grants DROP CONSTRAINT IF EXISTS module_legacy_grants_module_id_check;
ALTER TABLE public.module_legacy_grants ADD CONSTRAINT module_legacy_grants_module_id_check
  CHECK (module_id IN ('website','online-orders'));

CREATE OR REPLACE FUNCTION app.record_module_legacy_grants() RETURNS integer
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

INSERT INTO schema_versions(version) VALUES(92);
