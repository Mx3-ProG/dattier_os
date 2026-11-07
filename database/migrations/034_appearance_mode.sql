ALTER TABLE profile_appearance ADD COLUMN mode text NOT NULL DEFAULT 'light'
  CHECK (mode IN ('light','dark'));
INSERT INTO schema_versions(version) VALUES (34);
