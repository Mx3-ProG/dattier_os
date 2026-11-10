-- Retire les droits hérités de modules ; aucun accès ne les lit encore.
DROP FUNCTION IF EXISTS app.module_legacy_granted(text,text);
DROP FUNCTION IF EXISTS app.record_module_legacy_grants();
DROP TABLE IF EXISTS public.module_legacy_grants;
DELETE FROM schema_versions WHERE version=91;
