-- Les vidéos sont transcodées par le groupe de workers « media », hors du serveur web.
-- Voir docs/platform/WORKER_GROUPS.md.
ALTER TABLE cms_media
  ADD COLUMN status text NOT NULL DEFAULT 'ready' CHECK(status IN ('processing','ready','failed')),
  ADD COLUMN source_key text,
  ADD COLUMN source_mime text,
  ADD COLUMN processing_error text;
INSERT INTO schema_versions VALUES(62);
