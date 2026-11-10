CREATE TABLE profile_appearance (
  profile_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  color text NOT NULL DEFAULT '#344d3e' CHECK (color ~ '^#[0-9a-f]{6}$'),
  font text NOT NULL DEFAULT 'default' CHECK (font IN ('default','inter','nunito','poppins')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profile_appearance ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_appearance ON profile_appearance
  USING(profile_id=app.user_id()) WITH CHECK(profile_id=app.user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_appearance TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES (33);
