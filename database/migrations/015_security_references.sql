-- Tenant identity remains part of every incident relationship, including worker writes.
ALTER TABLE ops_security_incidents ADD CONSTRAINT ops_incident_tenant_id UNIQUE(restaurant_id,id);
ALTER TABLE ops_security_remediations ADD CONSTRAINT ops_remediation_tenant_incident FOREIGN KEY(restaurant_id,incident_id) REFERENCES ops_security_incidents(restaurant_id,id);
ALTER TABLE ops_security_events ADD CONSTRAINT ops_event_tenant_incident FOREIGN KEY(restaurant_id,incident_id) REFERENCES ops_security_incidents(restaurant_id,id);
CREATE OR REPLACE FUNCTION app.health_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version>=15) $$;
INSERT INTO schema_versions VALUES(15);
