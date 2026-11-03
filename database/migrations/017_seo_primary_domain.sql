-- SEO: one canonical host per restaurant. Additive only.
ALTER TABLE restaurant_domains ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_domains_one_primary ON restaurant_domains(restaurant_id) WHERE is_primary;
-- Public lookup of the canonical hostname. Exposes only a verified hostname (already public through DNS),
-- never unverified domains or verification hashes. Falls back to the oldest verified domain.
CREATE OR REPLACE FUNCTION app.primary_domain(rid text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT d.hostname FROM restaurant_domains d JOIN restaurants r ON r.id=d.restaurant_id JOIN organizations o ON o.id=r.organization_id
 WHERE d.restaurant_id=rid AND d.verified_at IS NOT NULL AND o.status='active'
 ORDER BY d.is_primary DESC,d.verified_at,d.hostname LIMIT 1 $$;
REVOKE ALL ON FUNCTION app.primary_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.primary_domain(text) TO dattier_app;
CREATE OR REPLACE FUNCTION app.health_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version>=17) $$;
INSERT INTO schema_versions VALUES(17);
