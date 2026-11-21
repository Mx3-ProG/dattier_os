-- Catalogue et demande client : aucune écriture directe accordée sur home_visits.
CREATE FUNCTION app.home_customer_access(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT current_setting('app.public',true) IS DISTINCT FROM 'true' AND EXISTS (
   SELECT 1 FROM home_beneficiaries b JOIN customers c ON c.id=b.customer_id AND c.restaurant_id=b.restaurant_id
     JOIN organization_customers oc ON oc.id=c.account_id
   WHERE b.restaurant_id=rid AND b.archived_at IS NULL AND oc.subject=app.user_id()
   UNION ALL
   SELECT 1 FROM home_relative_grants g JOIN home_beneficiaries b ON b.id=g.beneficiary_id AND b.restaurant_id=g.restaurant_id
   WHERE g.restaurant_id=rid AND g.revoked_at IS NULL AND b.archived_at IS NULL AND g.profile_id=app.user_id())
$$;
CREATE FUNCTION app.home_portal_services(rid text)
RETURNS TABLE(id text,name text,hourly_cents integer,minimum_minutes integer,travel_cents integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT s.id,s.name,s.hourly_cents,s.minimum_minutes,s.travel_cents FROM home_services s
  WHERE s.restaurant_id=rid AND s.active AND (NOT s.compliance_required OR s.compliance_verified_at IS NOT NULL)
    AND app.home_customer_access(rid)
$$;
CREATE FUNCTION app.home_customer_request(rid text,bid text,sid text,start_at timestamptz,end_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s home_services%ROWTYPE; created text;
BEGIN
  IF current_setting('app.public',true)='true' OR start_at<=now() OR end_at<=start_at OR end_at>start_at+interval '24 hours' THEN
    RAISE EXCEPTION 'Créneau invalide.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM home_beneficiaries b JOIN customers c ON c.id=b.customer_id AND c.restaurant_id=b.restaurant_id
      JOIN organization_customers oc ON oc.id=c.account_id
      WHERE b.id=bid AND b.restaurant_id=rid AND b.archived_at IS NULL AND oc.subject=app.user_id())
    AND NOT EXISTS(SELECT 1 FROM home_relative_grants g JOIN home_beneficiaries b ON b.id=g.beneficiary_id AND b.restaurant_id=g.restaurant_id
      WHERE b.id=bid AND b.restaurant_id=rid AND b.archived_at IS NULL AND g.profile_id=app.user_id() AND g.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Bénéficiaire non autorisé.';
  END IF;
  SELECT * INTO s FROM home_services WHERE id=sid AND restaurant_id=rid AND active AND (NOT compliance_required OR compliance_verified_at IS NOT NULL);
  IF NOT FOUND OR extract(epoch FROM(end_at-start_at))/60<s.minimum_minutes THEN RAISE EXCEPTION 'Prestation indisponible ou durée insuffisante.'; END IF;
  created:=gen_random_uuid()::text;
  INSERT INTO home_visits(id,restaurant_id,beneficiary_id,service_id,service_name,starts_at,ends_at,price_cents,hourly_cents,travel_cents,status)
  VALUES(created,rid,bid,sid,s.name,start_at,end_at,round(s.hourly_cents*extract(epoch FROM(end_at-start_at))/3600)::integer+s.travel_cents,s.hourly_cents,s.travel_cents,'requested');
  INSERT INTO audit_logs(id,restaurant_id,actor,action,object_id) VALUES(gen_random_uuid()::text,rid,app.user_id(),'home.customer-request',created);
  INSERT INTO notifications(id,restaurant_id,message) VALUES(gen_random_uuid()::text,rid,'Nouvelle demande de prestation à domicile.');
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION app.home_customer_access(text),app.home_portal_services(text),app.home_customer_request(text,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.home_customer_access(text),app.home_portal_services(text),app.home_customer_request(text,text,text,timestamptz,timestamptz) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(184) ON CONFLICT DO NOTHING;
