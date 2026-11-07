-- Scan d'un QR code : distingue l'équipe des clients.
-- Remplace une première version de la fonction (signature identique, retour différent).
DROP FUNCTION IF EXISTS app.scan_qr(text, text);

-- Résolution d'un scan sans contexte d'établissement (le jeton est public) :
-- détermine si la personne connectée fait partie de l'équipe, enregistre le
-- scan et renvoie le code. `uid` vient de la session vérifiée côté serveur.
CREATE OR REPLACE FUNCTION app.scan_qr(t text, uid text)
RETURNS TABLE (restaurant_id text, kind text, ref text, target text, archived boolean, staff boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q qr_codes; member boolean := false;
BEGIN
  SELECT * INTO q FROM qr_codes c WHERE c.token = t;
  IF NOT FOUND THEN RETURN; END IF;
  IF uid IS NOT NULL THEN
    member := EXISTS (
      SELECT 1 FROM memberships m JOIN profiles p ON p.id = m.profile_id
       WHERE m.profile_id = uid AND m.restaurant_id = q.restaurant_id AND p.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM restaurants r JOIN organization_memberships om ON om.organization_id = r.organization_id
        JOIN profiles p ON p.id = om.profile_id
       WHERE r.id = q.restaurant_id AND om.profile_id = uid AND om.role IN ('OWNER','ADMIN') AND p.status = 'active'
    );
  END IF;
  INSERT INTO qr_scans(id, qr_id, restaurant_id, audience)
  VALUES (gen_random_uuid()::text, q.id, q.restaurant_id, CASE WHEN member THEN 'staff' ELSE 'public' END);
  RETURN QUERY SELECT q.restaurant_id, q.kind, q.ref, q.target, q.archived_at IS NOT NULL, member;
END $$;
REVOKE ALL ON FUNCTION app.scan_qr(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.scan_qr(text, text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES (32);
