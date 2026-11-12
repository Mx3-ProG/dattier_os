-- Free trial extended from three to seven days. Trials already finished keep
-- their three days (no access is reopened); trials still running are extended.
-- Idempotent: the shared demo database may replay it.
ALTER TABLE app.organization_plans DROP CONSTRAINT IF EXISTS organization_trial_dates;

UPDATE app.organization_plans
  SET trial_ends_at=trial_started_at+interval '7 days'
  WHERE plan=0 AND cancelled_at IS NULL AND trial_started_at IS NOT NULL
    AND trial_ends_at>now() AND trial_ends_at<trial_started_at+interval '7 days';

ALTER TABLE app.organization_plans
  ADD CONSTRAINT organization_trial_dates CHECK (
    (trial_started_at IS NULL AND trial_ends_at IS NULL)
    OR (trial_started_at IS NOT NULL AND trial_ends_at IN (
      trial_started_at + interval '3 days', trial_started_at + interval '7 days'))
  );

CREATE OR REPLACE FUNCTION app.start_organization_trial(oid text) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id text := app.user_id(); trial_end timestamptz;
BEGIN
  IF owner_id IS NULL OR NOT app.org_admin(oid) THEN
    RAISE EXCEPTION 'Essai non autorisé.';
  END IF;
  -- A second organization cannot restart the same person's trial.
  PERFORM 1 FROM profiles WHERE id=owner_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM organization_memberships m
    JOIN app.organization_plans p ON p.organization_id=m.organization_id
    WHERE m.profile_id=owner_id AND p.trial_started_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Essai déjà utilisé.'; END IF;
  UPDATE app.organization_plans
    SET trial_started_at=now(),trial_ends_at=now()+interval '7 days'
    WHERE organization_id=oid AND plan=0 AND trial_started_at IS NULL
    RETURNING trial_ends_at INTO trial_end;
  IF trial_end IS NULL THEN RAISE EXCEPTION 'Essai indisponible.'; END IF;
  RETURN trial_end;
END $$;
REVOKE ALL ON FUNCTION app.start_organization_trial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.start_organization_trial(text) TO atacuisine_app;

CREATE OR REPLACE FUNCTION app.cancel_organization_subscription(oid text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id=oid AND profile_id=app.user_id() AND role='OWNER'
  ) THEN RAISE EXCEPTION 'Résiliation non autorisée.'; END IF;
  -- The trial end stays as originally agreed (3 or 7 days); cancelled_at closes access now.
  UPDATE app.organization_plans
    SET plan=0,cancelled_at=now()
    WHERE organization_id=oid AND (plan>0 OR (trial_ends_at>now() AND cancelled_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION app.cancel_organization_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cancel_organization_subscription(text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(120) ON CONFLICT DO NOTHING;
