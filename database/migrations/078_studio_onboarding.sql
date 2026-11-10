ALTER TABLE profiles ADD COLUMN job_title text NOT NULL DEFAULT '', ADD COLUMN work_phone text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN created_by text REFERENCES profiles(id),
  ADD COLUMN creation_key text, ADD COLUMN first_restaurant_id text REFERENCES restaurants(id),
  ADD COLUMN discovery_source text NOT NULL DEFAULT '',
  ADD COLUMN discovery_detail text NOT NULL DEFAULT '',
  ADD COLUMN onboarding_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX organizations_creation_key ON organizations(created_by,creation_key)
  WHERE created_by IS NOT NULL AND creation_key IS NOT NULL;
ALTER TABLE restaurants ADD COLUMN industry text NOT NULL DEFAULT 'restaurant'
  CHECK (industry IN ('restaurant','beauty','retail','construction','services','other')),
  ADD COLUMN trade text NOT NULL DEFAULT 'restaurant',
  ADD COLUMN trade_detail text NOT NULL DEFAULT '',
  ADD COLUMN work_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION app.module_enabled(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM restaurants r WHERE r.id=rid AND r.industry='restaurant')
    AND module IN ('floor','table-booking')
    AND app.addon_installed(rid,CASE WHEN module='table-booking' THEN 'booking' ELSE 'floor' END)
    AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
      AND s.module_id=module AND s.applied_state='suspended')
    AND (module<>'table-booking' OR app.addon_installed(rid,'floor')
      AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
        AND s.module_id='floor' AND s.applied_state='suspended'))
$$;
CREATE TABLE onboarding_drafts (
  profile_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft)='object' AND octet_length(draft::text)<=16000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE onboarding_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_draft_owner ON onboarding_drafts
  USING (profile_id=app.user_id()) WITH CHECK (profile_id=app.user_id());
REVOKE ALL ON onboarding_drafts FROM PUBLIC,atacuisine_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON onboarding_drafts TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(78);
