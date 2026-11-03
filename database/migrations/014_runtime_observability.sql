ALTER TABLE outbox_jobs ADD COLUMN completed_at timestamptz;
CREATE UNIQUE INDEX customers_account_identity ON customers(account_id,restaurant_id) WHERE account_id IS NOT NULL;
CREATE OR REPLACE FUNCTION app.health_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT max(version)>=14 FROM schema_versions $$;
-- Presentation and audit history survive an intentional local demo reset.
ALTER TABLE restaurant_cms DROP CONSTRAINT restaurant_cms_restaurant_id_fkey;
ALTER TABLE cms_versions DROP CONSTRAINT cms_versions_restaurant_id_fkey;
ALTER TABLE cms_media DROP CONSTRAINT cms_media_restaurant_id_fkey;
CREATE OR REPLACE FUNCTION app.setup_cms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN INSERT INTO restaurant_cms(restaurant_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;RETURN NEW;END $$;
INSERT INTO schema_versions VALUES(14);
