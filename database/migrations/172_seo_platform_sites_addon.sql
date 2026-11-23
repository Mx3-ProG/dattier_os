-- SEO: platform sites must also require the website add-on, like the page itself.
CREATE OR REPLACE FUNCTION app.platform_sites() RETURNS TABLE(restaurant_id text,published_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,v.published_at FROM restaurants r
 JOIN organizations o ON o.id=r.organization_id AND o.status='active'
 JOIN restaurant_cms c ON c.restaurant_id=r.id
 JOIN cms_versions v ON v.id=c.published_version_id AND v.restaurant_id=r.id
 WHERE (v.config #>> '{seo,noIndex}')='false'
   AND app.primary_domain(r.id) IS NULL
   AND app.addon_installed(r.id,'website')
   AND app.restaurant_plan(r.id) >= 39
 ORDER BY r.id LIMIT 50000 $$;
REVOKE ALL ON FUNCTION app.platform_sites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.platform_sites() TO atacuisine_app;
INSERT INTO schema_versions VALUES(172) ON CONFLICT DO NOTHING;
