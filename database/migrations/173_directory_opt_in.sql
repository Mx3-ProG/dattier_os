-- SEO directory: explicit opt-in per business. No customer data is exposed.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS directory_opt_in boolean NOT NULL DEFAULT false;
INSERT INTO schema_versions VALUES(173) ON CONFLICT DO NOTHING;
