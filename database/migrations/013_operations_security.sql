-- Security Center V1. Additive only: no business table is altered.
-- Security tables deliberately have NO foreign key to restaurants/profiles:
-- the demo reset (TRUNCATE restaurants,profiles CASCADE) and tenant cleanup
-- must never erase the security trail. All events require an establishment.
-- Business data is never purged by this module.

CREATE TABLE ops_security_settings (
 restaurant_id text PRIMARY KEY DEFAULT nullif(current_setting('app.restaurant_id',true),''),
 id boolean NOT NULL DEFAULT true CHECK(id),
 remediation_mode text NOT NULL DEFAULT 'observation' CHECK(remediation_mode IN ('observation','active')),
 retention_days integer NOT NULL DEFAULT 15 CHECK(retention_days BETWEEN 1 AND 365),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
INSERT INTO ops_security_settings(restaurant_id) SELECT id FROM restaurants;

CREATE TABLE ops_security_events (
 event_id text PRIMARY KEY,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 severity smallint NOT NULL CHECK(severity BETWEEN 1 AND 6),
 event_type text NOT NULL,
 module text NOT NULL,
 action text NOT NULL,
 actor_id text,
 restaurant_id text NOT NULL DEFAULT nullif(current_setting('app.restaurant_id',true),''),
 session_id text,
 correlation_id text,
 resource_id text,
 status text NOT NULL DEFAULT 'info' CHECK(status IN ('success','failure','info')),
 error_code text,
 message text NOT NULL,
 technical_details jsonb NOT NULL DEFAULT '{}',
 resolution_status text CHECK(resolution_status IN ('detected','analyzing','auto_fixing','auto_resolved','intervention_required','manually_resolved')),
 incident_id text
);
CREATE INDEX security_events_restaurant_time ON ops_security_events(restaurant_id, occurred_at DESC);
CREATE INDEX security_events_time_severity ON ops_security_events(occurred_at DESC, severity);
CREATE INDEX security_events_correlation ON ops_security_events(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX security_events_incident ON ops_security_events(incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX security_events_type_time ON ops_security_events(event_type, occurred_at DESC);

CREATE TABLE ops_security_incidents (
 id text PRIMARY KEY,
 fingerprint text NOT NULL,
 rule_id text NOT NULL,
 restaurant_id text NOT NULL DEFAULT nullif(current_setting('app.restaurant_id',true),''),
 severity smallint NOT NULL CHECK(severity BETWEEN 1 AND 6),
 module text NOT NULL,
 title text NOT NULL,
 user_message text NOT NULL,
 intervention_level text NOT NULL CHECK(intervention_level IN ('A','B','C')),
 status text NOT NULL DEFAULT 'detected' CHECK(status IN ('detected','analyzing','auto_fixing','auto_resolved','intervention_required','manually_resolved')),
 occurrences integer NOT NULL DEFAULT 1 CHECK(occurrences>0),
 context jsonb NOT NULL DEFAULT '{}',
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolved_at timestamptz,
 resolved_by text,
 resolution_note text
);
-- One open incident per fingerprint: detection re-runs never duplicate incidents.
CREATE UNIQUE INDEX security_incidents_open_fingerprint ON ops_security_incidents(fingerprint)
 WHERE status NOT IN ('auto_resolved','manually_resolved');
CREATE INDEX security_incidents_restaurant ON ops_security_incidents(restaurant_id, status, opened_at DESC);

CREATE TABLE ops_security_remediations (
 restaurant_id text NOT NULL DEFAULT nullif(current_setting('app.restaurant_id',true),''),
 id text PRIMARY KEY,
 incident_id text NOT NULL REFERENCES ops_security_incidents ON DELETE CASCADE,
 action text NOT NULL,
 intervention_level text NOT NULL CHECK(intervention_level IN ('A','B')),
 status text NOT NULL CHECK(status IN ('observed','scheduled','running','succeeded','failed','abandoned','awaiting_approval','rejected')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 5),
 next_attempt_at timestamptz,
 proposal jsonb NOT NULL DEFAULT '{}',
 last_result text,
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 executed_at timestamptz,
 decided_by text,
 decided_at timestamptz,
 dedupe_key text NOT NULL UNIQUE
);
CREATE INDEX security_remediations_due ON ops_security_remediations(status, next_attempt_at);

CREATE TABLE ops_security_archives (
 restaurant_id text NOT NULL DEFAULT nullif(current_setting('app.restaurant_id',true),''),
 day date NOT NULL,
 event_count integer NOT NULL CHECK(event_count>=0),
 payload jsonb NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 prev_chain text NOT NULL,
 chain_sha256 text NOT NULL CHECK(chain_sha256 ~ '^[a-f0-9]{64}$'),
 file_path text,
 PRIMARY KEY(restaurant_id,day),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ops_security_jobs (
 restaurant_id text NOT NULL DEFAULT nullif(current_setting('app.restaurant_id',true),''),
 id text PRIMARY KEY,
 job text NOT NULL CHECK(job IN ('archive','verify','purge','detect','remediate','maintenance')),
 status text NOT NULL CHECK(status IN ('success','failure','skipped')),
 started_at timestamptz NOT NULL,
 finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX security_jobs_job_time ON ops_security_jobs(job, finished_at DESC);

-- Timestamps are set by the database, except for a controlled re-import of
-- buffered events (donuts.security_import=on, transaction-local).
CREATE FUNCTION ops_security_event_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF coalesce(current_setting('donuts.security_import', true), '') <> 'on'
    OR NEW.occurred_at IS NULL OR NEW.occurred_at > clock_timestamp() THEN
  NEW.occurred_at := clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER security_events_stamp BEFORE INSERT ON ops_security_events
 FOR EACH ROW EXECUTE FUNCTION ops_security_event_stamp();

-- Append-only journal and immutable archives. The only permitted deletion is the
-- retention purge (donuts.security_purge=on, transaction-local) of rows older
-- than the configured retention.
CREATE FUNCTION ops_security_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE keep integer; ts timestamptz;
BEGIN
 IF TG_OP = 'DELETE' AND coalesce(current_setting('donuts.security_purge', true), '') = 'on' THEN
  SELECT retention_days INTO keep FROM ops_security_settings LIMIT 1;
  IF TG_TABLE_NAME = 'ops_security_events' THEN ts := OLD.occurred_at;
  ELSE ts := (OLD.day + 1)::timestamp AT TIME ZONE 'Europe/Paris';
  END IF;
  IF ts < now() - make_interval(days => keep) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Journal de sécurité en ajout seul : % refusé sur %', TG_OP, TG_TABLE_NAME;
END $$;
CREATE TRIGGER security_events_append_only BEFORE UPDATE OR DELETE ON ops_security_events
 FOR EACH ROW EXECUTE FUNCTION ops_security_append_only();
CREATE TRIGGER security_events_no_truncate BEFORE TRUNCATE ON ops_security_events
 FOR EACH STATEMENT EXECUTE FUNCTION ops_security_append_only();
CREATE TRIGGER security_archives_append_only BEFORE UPDATE OR DELETE ON ops_security_archives
 FOR EACH ROW EXECUTE FUNCTION ops_security_append_only();
CREATE TRIGGER security_archives_no_truncate BEFORE TRUNCATE ON ops_security_archives
 FOR EACH STATEMENT EXECUTE FUNCTION ops_security_append_only();

ALTER TABLE ops_security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ops_security_settings USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
ALTER TABLE ops_security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ops_security_events USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
ALTER TABLE ops_security_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ops_security_incidents USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
ALTER TABLE ops_security_remediations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ops_security_remediations USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
ALTER TABLE ops_security_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ops_security_archives USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
ALTER TABLE ops_security_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ops_security_jobs USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
CREATE TABLE restaurant_session_revocations(restaurant_id text NOT NULL REFERENCES restaurants,profile_id text NOT NULL REFERENCES profiles,not_before timestamptz NOT NULL,PRIMARY KEY(restaurant_id,profile_id));
ALTER TABLE restaurant_session_revocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY revocations_scope ON restaurant_session_revocations USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.restaurant_admin(restaurant_id));
CREATE TABLE ops_auth_presence(restaurant_id text NOT NULL,profile_id text NOT NULL,session_ref text NOT NULL,last_seen timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(restaurant_id,profile_id,session_ref));
ALTER TABLE ops_auth_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY presence_scope ON ops_auth_presence USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
CREATE FUNCTION app.setup_operations_security() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN INSERT INTO ops_security_settings(restaurant_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;RETURN NEW;END $$;
CREATE TRIGGER ops_security_setup AFTER INSERT ON restaurants FOR EACH ROW EXECUTE FUNCTION app.setup_operations_security();
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO atacuisine_app;
REVOKE ALL ON schema_versions FROM atacuisine_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO atacuisine_app;
INSERT INTO schema_versions VALUES(13);
