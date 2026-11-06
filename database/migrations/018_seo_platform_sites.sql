-- SEO: restaurant sites published under the platform host (/r/{id}). Additive only.
-- Lists only sites whose owner enabled indexing in the published version, with no verified domain
-- of their own and an active organisation: public information by definition.
CREATE OR REPLACE FUNCTION app.platform_sites() RETURNS TABLE(restaurant_id text,published_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,v.published_at FROM restaurants r
 JOIN organizations o ON o.id=r.organization_id AND o.status='active'
 JOIN restaurant_cms c ON c.restaurant_id=r.id
 JOIN cms_versions v ON v.id=c.published_version_id AND v.restaurant_id=r.id
 WHERE (v.config #>> '{seo,noIndex}')='false' AND app.primary_domain(r.id) IS NULL
 ORDER BY r.id LIMIT 50000 $$;
REVOKE ALL ON FUNCTION app.platform_sites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.platform_sites() TO atacuisine_app;
CREATE OR REPLACE FUNCTION app.health_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version>=18) $$;
INSERT INTO schema_versions VALUES(18);
