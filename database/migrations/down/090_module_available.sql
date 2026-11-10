-- Retire la décision d'accès unique ; aucun accès ne l'utilise encore.
DROP FUNCTION IF EXISTS app.module_available(text,text);
DELETE FROM schema_versions WHERE version=90;
