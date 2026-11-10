-- Rebranding: existing installations keep their privileges under the new role names.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='dattier_app') AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname='atacuisine_app') THEN
  ALTER ROLE dattier_app RENAME TO atacuisine_app;
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='dattier_worker') AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname='atacuisine_worker') THEN
  ALTER ROLE dattier_worker RENAME TO atacuisine_worker;
 END IF;
END $$;
UPDATE restaurants SET name='Studio Restau' WHERE id='bernay' AND name='Le Dattier Hefsi';
INSERT INTO schema_versions(version) VALUES (22);
