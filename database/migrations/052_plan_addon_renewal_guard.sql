-- A plan that includes invoices cannot coexist with a separately renewing invoice add-on.
CREATE FUNCTION app.guard_included_addon_renewal() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.plan>=69 AND OLD.plan<69 AND EXISTS (
    SELECT 1 FROM addon_subscriptions a
    JOIN restaurants r ON r.id=a.restaurant_id
    WHERE r.organization_id=NEW.organization_id AND a.addon='invoices'
      AND a.status='active' AND a.renewal_cancelled IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Arrêtez le renouvellement des factures avant d’activer cette formule.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_included_addon_renewal BEFORE UPDATE OF plan
ON app.organization_plans FOR EACH ROW EXECUTE FUNCTION app.guard_included_addon_renewal();
INSERT INTO schema_versions(version) VALUES(52);
