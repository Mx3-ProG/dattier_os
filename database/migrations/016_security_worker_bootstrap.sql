-- Upgrade installations created before the operational worker was enabled.
CREATE OR REPLACE FUNCTION app.setup_restaurant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 INSERT INTO shop_settings(restaurant_id,config) VALUES(NEW.id,'{"open":false,"prepMinutes":20,"interval":15,"capacity":10,"hours":[],"categories":["Entrées","Plats","Desserts","Boissons"],"address":"","phone":"","logo":""}') ON CONFLICT DO NOTHING;
 INSERT INTO site_documents(restaurant_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key) VALUES(gen_random_uuid()::text,NEW.id,'security_scan','{}'::jsonb,'initial') ON CONFLICT(restaurant_id,kind,dedupe_key) DO NOTHING;
 RETURN NEW; END $$;
INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key)
 SELECT gen_random_uuid()::text,r.id,'security_scan','{}'::jsonb,'initial' FROM restaurants r
 WHERE NOT EXISTS(SELECT 1 FROM outbox_jobs j WHERE j.restaurant_id=r.id AND j.kind='security_scan')
 ON CONFLICT(restaurant_id,kind,dedupe_key) DO NOTHING;
CREATE OR REPLACE FUNCTION app.health_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version>=16) $$;
INSERT INTO schema_versions VALUES(16);
