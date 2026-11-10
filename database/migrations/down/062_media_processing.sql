-- Les vidéos encore en traitement n'ont pas de fichier final : elles sont archivées avant le retour arrière.
UPDATE cms_media SET archived_at=coalesce(archived_at,now()) WHERE status<>'ready';
ALTER TABLE cms_media DROP COLUMN status,DROP COLUMN source_key,DROP COLUMN source_mime,DROP COLUMN processing_error;
DELETE FROM schema_versions WHERE version=62;
