-- Les événements déjà écrits restent dans le journal, qui est en ajout seul.
DROP FUNCTION app.record_denied_access(text,text,text,text);
DROP TABLE app.denied_access_counters;
DELETE FROM schema_versions WHERE version=160;
