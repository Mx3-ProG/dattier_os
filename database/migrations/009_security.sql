CREATE TABLE security_events(id text PRIMARY KEY,restaurant_id text NOT NULL REFERENCES restaurants,severity text NOT NULL CHECK(severity IN ('INFO','NOTICE','WARNING','ERROR','CRITICAL')),event_type text NOT NULL,message text NOT NULL,actor_id text REFERENCES profiles,request_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX security_events_scope ON security_events(restaurant_id,created_at DESC);
CREATE TABLE security_incidents(id text PRIMARY KEY,restaurant_id text NOT NULL REFERENCES restaurants,rule text NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','archived')),message text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(restaurant_id,rule));
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_scope ON security_events USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidents_scope ON security_incidents USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
CREATE FUNCTION app.audit_security() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 INSERT INTO security_events(id,restaurant_id,severity,event_type,message,actor_id) VALUES(NEW.id,NEW.restaurant_id,CASE WHEN NEW.action ILIKE '%support%' OR NEW.action ILIKE '%accès%' OR NEW.action ILIKE '%publi%' THEN 'NOTICE' ELSE 'INFO' END,'audit.operation',left(NEW.action,500),NEW.actor);
 RETURN NEW; END $$;
CREATE TRIGGER security_mirror AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION app.audit_security();
CREATE FUNCTION app.immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Journal en ajout seul'; END $$;
CREATE TRIGGER security_append_only BEFORE UPDATE OR DELETE ON security_events FOR EACH ROW EXECUTE FUNCTION app.immutable_event();
INSERT INTO schema_versions VALUES(9);
