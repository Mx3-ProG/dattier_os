ALTER TABLE menu_items
  ADD COLUMN public_composition text NOT NULL DEFAULT '',
  ADD COLUMN seo_title text NOT NULL DEFAULT '',
  ADD COLUMN seo_description text NOT NULL DEFAULT '';

INSERT INTO schema_versions(version) VALUES (21);
