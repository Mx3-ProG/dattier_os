-- Le prestataire ne reçoit aucun droit UPDATE général sur les visites.
CREATE FUNCTION app.home_worker_report(rid text, vid text, body text, minutes integer) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed text;
BEGIN
  IF current_setting('app.public',true)='true' OR length(trim(body)) NOT BETWEEN 2 AND 5000
    OR minutes NOT BETWEEN 0 AND 1440 THEN RAISE EXCEPTION 'Compte rendu invalide.'; END IF;
  UPDATE home_visits v SET report=body,declared_minutes=minutes
  WHERE v.id=vid AND v.restaurant_id=rid AND v.status='in_progress' AND v.validated_minutes IS NULL
    AND EXISTS(SELECT 1 FROM home_workers w JOIN profiles p ON p.id=w.profile_id WHERE w.id=v.worker_id AND w.restaurant_id=rid AND w.profile_id=app.user_id() AND w.active AND p.status='active'
      AND EXISTS(SELECT 1 FROM memberships m WHERE m.profile_id=w.profile_id AND m.restaurant_id=rid))
  RETURNING v.id INTO changed;
  IF changed IS NULL THEN RAISE EXCEPTION 'Intervention inaccessible ou déjà terminée.'; END IF;
  INSERT INTO audit_logs(id,restaurant_id,actor,action,object_id)
    VALUES(gen_random_uuid()::text,rid,app.user_id(),'home.worker-report',changed);
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION app.home_worker_report(text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.home_worker_report(text,text,text,integer) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(183) ON CONFLICT DO NOTHING;
