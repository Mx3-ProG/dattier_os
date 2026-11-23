-- Keep tenant lookups indexed for the home assistance modules.
CREATE INDEX IF NOT EXISTS home_beneficiaries_tenant ON public.home_beneficiaries(restaurant_id);
CREATE INDEX IF NOT EXISTS home_relative_grants_tenant ON public.home_relative_grants(restaurant_id);
CREATE INDEX IF NOT EXISTS home_services_tenant ON public.home_services(restaurant_id);
INSERT INTO schema_versions(version) VALUES(188) ON CONFLICT DO NOTHING;
