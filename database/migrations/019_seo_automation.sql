-- SEO automation and dashboard. Additive only.

-- Audit reports: written only through app.record_seo_audit, readable by restaurant members (never in a visitor context).
CREATE TABLE seo_audits(id text PRIMARY KEY,restaurant_id text NOT NULL REFERENCES restaurants,trigger text NOT NULL,report jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX seo_audits_scope ON seo_audits(restaurant_id,created_at DESC);
ALTER TABLE seo_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY seo_audits_read ON seo_audits FOR SELECT USING(app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
GRANT SELECT ON seo_audits TO atacuisine_app;

-- AI visibility observations entered by the team (manual tests, with date and method). Never generated.
CREATE TABLE seo_ai_observations(id text PRIMARY KEY,restaurant_id text NOT NULL REFERENCES restaurants,observed_on date NOT NULL,assistant text NOT NULL CHECK(length(assistant) BETWEEN 1 AND 60),query text NOT NULL CHECK(length(query) BETWEEN 1 AND 300),cited boolean NOT NULL,evidence text NOT NULL DEFAULT '' CHECK(length(evidence)<=1000),created_by text REFERENCES profiles,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX seo_obs_scope ON seo_ai_observations(restaurant_id,observed_on DESC);
ALTER TABLE seo_ai_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY seo_obs_scope ON seo_ai_observations USING(app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true') WITH CHECK(app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
GRANT SELECT,INSERT,DELETE ON seo_ai_observations TO atacuisine_app;

-- Stores a report for the restaurant of the current database context only; keeps the 20 latest.
CREATE FUNCTION app.record_seo_audit(rid text,source text,report jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE new_id text := gen_random_uuid()::text;
BEGIN
 IF current_setting('app.restaurant_id',true) IS DISTINCT FROM rid OR NOT app.has_restaurant(rid) THEN RAISE EXCEPTION 'Établissement non autorisé.'; END IF;
 INSERT INTO seo_audits(id,restaurant_id,trigger,report) VALUES(new_id,rid,left(source,60),report);
 DELETE FROM seo_audits WHERE restaurant_id=rid AND id NOT IN (SELECT id FROM seo_audits WHERE restaurant_id=rid ORDER BY created_at DESC LIMIT 20);
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION app.record_seo_audit(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_seo_audit(text,text,jsonb) TO atacuisine_app;

-- Debounced audit job: at most one pending and one follow-up (if an audit is running) per restaurant.
CREATE FUNCTION app.queue_seo_audit(rid text,source text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text; ok boolean;
BEGIN
 FOREACH k IN ARRAY ARRAY['auto','auto-next'] LOOP
  INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key,available_at)
   VALUES(gen_random_uuid()::text,rid,'seo_audit',jsonb_build_object('trigger',source),k,now()+interval '20 seconds')
  ON CONFLICT(restaurant_id,kind,dedupe_key) DO UPDATE SET status='pending',attempts=0,last_error=NULL,locked_until=NULL,lease_token=NULL,
   available_at=EXCLUDED.available_at,payload=EXCLUDED.payload
   WHERE outbox_jobs.status<>'running'
  RETURNING true INTO ok;
  IF ok THEN RETURN; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.queue_seo_audit(text,text) FROM PUBLIC;

CREATE FUNCTION app.seo_on_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM app.queue_seo_audit(CASE WHEN TG_OP='DELETE' THEN OLD.restaurant_id ELSE NEW.restaurant_id END,TG_ARGV[0]);
 RETURN NULL;
END $$;
CREATE FUNCTION app.seo_on_restaurant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM app.queue_seo_audit(NEW.id,'création'); RETURN NULL; END $$;
CREATE TRIGGER seo_catalogue AFTER INSERT OR UPDATE OR DELETE ON menu_items FOR EACH ROW EXECUTE FUNCTION app.seo_on_change('catalogue');
CREATE TRIGGER seo_settings AFTER UPDATE ON shop_settings FOR EACH ROW EXECUTE FUNCTION app.seo_on_change('réglages boutique');
CREATE TRIGGER seo_domains AFTER INSERT OR UPDATE OR DELETE ON restaurant_domains FOR EACH ROW EXECUTE FUNCTION app.seo_on_change('domaine');
CREATE TRIGGER seo_publication AFTER UPDATE OF published_version_id ON restaurant_cms FOR EACH ROW WHEN (OLD.published_version_id IS DISTINCT FROM NEW.published_version_id) EXECUTE FUNCTION app.seo_on_change('publication');
CREATE TRIGGER seo_creation AFTER INSERT ON restaurants FOR EACH ROW EXECUTE FUNCTION app.seo_on_restaurant();

-- First audit for existing restaurants.
SELECT app.queue_seo_audit(id,'installation') FROM restaurants;

CREATE OR REPLACE FUNCTION app.health_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version>=19) $$;
INSERT INTO schema_versions VALUES(19);
