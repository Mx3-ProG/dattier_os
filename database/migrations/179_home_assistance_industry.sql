-- Profil métier distinct. Les modules communs restent les mêmes pour tous les secteurs.
ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_industry_check;
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_industry_check
  CHECK (industry IN ('restaurant','beauty','retail','construction','services','home_assistance','other'));
INSERT INTO schema_versions(version) VALUES(179) ON CONFLICT DO NOTHING;
