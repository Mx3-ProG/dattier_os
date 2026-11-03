ALTER TABLE offline_operations DROP CONSTRAINT offline_operations_status_check;
ALTER TABLE offline_operations ADD CHECK(status IN ('applied','conflict','retrying','resolved'));
CREATE TABLE offline_conflict_decisions(id text PRIMARY KEY,restaurant_id text NOT NULL REFERENCES restaurants,operation_id text NOT NULL REFERENCES offline_operations,decision text NOT NULL CHECK(decision IN ('retry','reject')),reason text NOT NULL CHECK(length(reason)>=10),actor_id text NOT NULL REFERENCES profiles,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE offline_conflict_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY conflict_decisions_scope ON offline_conflict_decisions USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
CREATE TABLE security_archives(id text PRIMARY KEY,restaurant_id text NOT NULL REFERENCES restaurants,day date NOT NULL,object_key text NOT NULL,sha256 text NOT NULL,previous_sha256 text,verified_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(restaurant_id,day));
ALTER TABLE security_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_scope ON security_archives USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
CREATE TRIGGER archive_append_only BEFORE UPDATE OR DELETE ON security_archives FOR EACH ROW EXECUTE FUNCTION app.immutable_event();
CREATE OR REPLACE FUNCTION app.claim_jobs(worker_token text) RETURNS SETOF outbox_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 UPDATE outbox_jobs SET status='failed',last_error='Worker interrompu après la dernière tentative',lease_token=NULL,locked_until=NULL WHERE status='running' AND attempts>=5 AND locked_until<now();
 RETURN QUERY UPDATE outbox_jobs SET status='running',attempts=attempts+1,lease_token=worker_token,locked_until=now()+interval '2 minutes' WHERE id IN (SELECT id FROM outbox_jobs WHERE attempts<5 AND available_at<=now() AND (status='pending' OR (status='running' AND locked_until<now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
 END $$;
CREATE FUNCTION app.health_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT max(version)>=11 FROM schema_versions $$;
REVOKE ALL ON FUNCTION app.health_ready() FROM PUBLIC;
INSERT INTO schema_versions VALUES(11);
