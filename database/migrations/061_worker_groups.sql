-- Groupes de workers et équité entre tenants. Voir docs/platform/WORKER_GROUPS.md.
CREATE TABLE app.job_fairness(
  worker_group text NOT NULL,
  restaurant_id text NOT NULL,
  last_claimed_at timestamptz NOT NULL,
  PRIMARY KEY(worker_group,restaurant_id)
);
REVOKE ALL ON app.job_fairness FROM PUBLIC,atacuisine_app;
CREATE INDEX outbox_jobs_running ON outbox_jobs(restaurant_id,kind) WHERE status='running';

DROP FUNCTION app.claim_jobs(text);
-- Le verrou court sérialise les réclamations d'un groupe : le plafond par tenant est strict.
-- L'ordre sert d'abord le restaurant servi il y a le plus longtemps : un client qui dépose
-- mille jobs ne passe jamais devant un client qui en dépose un.
CREATE FUNCTION app.claim_jobs(worker_token text,group_name text,job_kinds text[] DEFAULT NULL,excluded_kinds text[] DEFAULT NULL,tenant_cap integer DEFAULT 1)
RETURNS SETOF outbox_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE picked outbox_jobs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('claim_jobs:'||group_name));
  UPDATE outbox_jobs SET status='failed',last_error='Worker interrompu après la dernière tentative',lease_token=NULL,locked_until=NULL
   WHERE status='running' AND attempts>=5 AND locked_until<now()
     AND (job_kinds IS NULL OR kind=ANY(job_kinds)) AND (excluded_kinds IS NULL OR NOT kind=ANY(excluded_kinds));
  SELECT j.* INTO picked FROM outbox_jobs j
    LEFT JOIN app.job_fairness f ON f.worker_group=group_name AND f.restaurant_id=j.restaurant_id
   WHERE j.attempts<5 AND j.available_at<=now()
     AND (j.status='pending' OR (j.status='running' AND j.locked_until<now()))
     AND (job_kinds IS NULL OR j.kind=ANY(job_kinds)) AND (excluded_kinds IS NULL OR NOT j.kind=ANY(excluded_kinds))
     AND (SELECT count(*) FROM outbox_jobs r
           WHERE r.restaurant_id=j.restaurant_id AND r.status='running' AND r.locked_until>=now()
             AND (job_kinds IS NULL OR r.kind=ANY(job_kinds)) AND (excluded_kinds IS NULL OR NOT r.kind=ANY(excluded_kinds)))<tenant_cap
   ORDER BY f.last_claimed_at ASC NULLS FIRST,j.available_at,j.id
   LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
  IF picked.id IS NULL THEN RETURN; END IF;
  INSERT INTO app.job_fairness VALUES(group_name,picked.restaurant_id,clock_timestamp())
    ON CONFLICT(worker_group,restaurant_id) DO UPDATE SET last_claimed_at=excluded.last_claimed_at;
  RETURN QUERY UPDATE outbox_jobs SET status='running',attempts=attempts+1,lease_token=worker_token,locked_until=now()+interval '2 minutes'
    WHERE id=picked.id RETURNING *;
END $$;

-- Un job vivant prolonge son bail : un autre worker ne le reprend qu'après un vrai plantage.
CREATE FUNCTION app.renew_job_lease(worker_token text,job_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  UPDATE outbox_jobs SET locked_until=now()+interval '2 minutes'
   WHERE id=job_id AND lease_token=worker_token AND status='running';
  RETURN FOUND;
END $$;

-- Les jobs de maintenance se recréent sans cesse. Les autres gardent leur clé de
-- déduplication assez longtemps pour qu'un rejeu Stripe reste sans effet.
CREATE FUNCTION app.purge_jobs() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE removed integer; BEGIN
  DELETE FROM outbox_jobs WHERE id IN (
    SELECT id FROM outbox_jobs
     WHERE status='done' AND completed_at < now()-CASE
       WHEN kind IN ('security_scan','seo_audit','security_archive') THEN interval '7 days'
       ELSE interval '90 days' END
     LIMIT 5000);
  GET DIAGNOSTICS removed=ROW_COUNT;
  DELETE FROM rate_limits WHERE expires_at<now()-interval '1 hour';
  RETURN removed;
END $$;

REVOKE ALL ON FUNCTION app.claim_jobs(text,text,text[],text[],integer),app.renew_job_lease(text,text),app.purge_jobs() FROM PUBLIC,atacuisine_app;
GRANT EXECUTE ON FUNCTION app.claim_jobs(text,text,text[],text[],integer),app.renew_job_lease(text,text),app.purge_jobs() TO atacuisine_worker;
INSERT INTO schema_versions VALUES(61);
