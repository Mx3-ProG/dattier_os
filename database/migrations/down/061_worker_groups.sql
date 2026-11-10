-- Retour à la réclamation FIFO unique de la migration 011.
DROP FUNCTION app.purge_jobs();
DROP FUNCTION app.renew_job_lease(text,text);
DROP FUNCTION app.claim_jobs(text,text,text[],text[],integer);
CREATE FUNCTION app.claim_jobs(worker_token text) RETURNS SETOF outbox_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 UPDATE outbox_jobs SET status='failed',last_error='Worker interrompu après la dernière tentative',lease_token=NULL,locked_until=NULL WHERE status='running' AND attempts>=5 AND locked_until<now();
 RETURN QUERY UPDATE outbox_jobs SET status='running',attempts=attempts+1,lease_token=worker_token,locked_until=now()+interval '2 minutes' WHERE id IN (SELECT id FROM outbox_jobs WHERE attempts<5 AND available_at<=now() AND (status='pending' OR (status='running' AND locked_until<now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
 END $$;
REVOKE ALL ON FUNCTION app.claim_jobs(text) FROM PUBLIC,atacuisine_app;
GRANT EXECUTE ON FUNCTION app.claim_jobs(text) TO atacuisine_worker;
DROP INDEX outbox_jobs_running;
DROP TABLE app.job_fairness;
DELETE FROM schema_versions WHERE version=61;
