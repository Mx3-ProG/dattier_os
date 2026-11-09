-- One free three-day trial per owner. Access expires by database time, even if
-- no worker is running. Paid activation remains an operator action.
ALTER TABLE app.organization_plans
  ADD COLUMN trial_started_at timestamptz,
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN cancelled_at timestamptz;
ALTER TABLE app.organization_plans
  ADD CONSTRAINT organization_trial_dates CHECK (
    (trial_started_at IS NULL AND trial_ends_at IS NULL)
    OR (trial_started_at IS NOT NULL AND trial_ends_at = trial_started_at + interval '3 days')
  );

CREATE FUNCTION app.start_organization_trial(oid text) RETURNS timestamptz
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
    SET trial_started_at=now(),trial_ends_at=now()+interval '3 days'
    WHERE organization_id=oid AND plan=0 AND trial_started_at IS NULL
    RETURNING trial_ends_at INTO trial_end;
  IF trial_end IS NULL THEN RAISE EXCEPTION 'Essai indisponible.'; END IF;
  RETURN trial_end;
END $$;
REVOKE ALL ON FUNCTION app.start_organization_trial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.start_organization_trial(text) TO atacuisine_app;

CREATE FUNCTION app.cancel_organization_subscription(oid text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id=oid AND profile_id=app.user_id() AND role='OWNER'
  ) THEN RAISE EXCEPTION 'Résiliation non autorisée.'; END IF;
  UPDATE app.organization_plans
    SET plan=0,trial_ends_at=CASE WHEN trial_started_at IS NOT NULL
      THEN trial_started_at+interval '3 days' ELSE NULL END,
      cancelled_at=now()
    WHERE organization_id=oid AND (plan>0 OR (trial_ends_at>now() AND cancelled_at IS NULL));
  -- The trial end remains as originally agreed; cancelled_at closes access now.
END $$;
REVOKE ALL ON FUNCTION app.cancel_organization_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cancel_organization_subscription(text) TO atacuisine_app;

CREATE FUNCTION app.current_organization_plan(oid text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN p.plan=0 AND p.cancelled_at IS NULL
    AND p.trial_started_at IS NOT NULL AND p.trial_ends_at>now()
    THEN 39 ELSE app.effective_plan(p.plan,p.bonus_plan) END
  FROM app.organization_plans p WHERE p.organization_id=oid
$$;
REVOKE ALL ON FUNCTION app.current_organization_plan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_organization_plan(text) TO atacuisine_app;

CREATE OR REPLACE FUNCTION app.restaurant_plan(rid text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.current_organization_plan(r.organization_id)
  FROM restaurants r JOIN organizations o ON o.id=r.organization_id
  WHERE r.id=rid AND r.archived_at IS NULL AND o.status='active'
    AND (app.has_restaurant(rid) OR (session_user=current_user AND current_setting('role')='none'))
$$;

CREATE OR REPLACE FUNCTION app.organization_plan(oid text)
RETURNS TABLE(plan integer,seats integer,occupied integer,paid_plan integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.current_organization_plan(oid),p.seats,
    (SELECT count(*)::int FROM restaurants r WHERE r.organization_id=oid AND r.archived_at IS NULL),p.plan
  FROM app.organization_plans p WHERE p.organization_id=oid AND app.org_member(oid)
$$;

CREATE FUNCTION app.organization_trial(oid text)
RETURNS TABLE(trial_ends_at timestamptz,cancelled_at timestamptz,trial_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.trial_ends_at,p.cancelled_at,
    (p.plan=0 AND p.cancelled_at IS NULL AND p.trial_ends_at>now())
  FROM app.organization_plans p
  WHERE p.organization_id=oid AND app.org_member(oid)
$$;
REVOKE ALL ON FUNCTION app.organization_trial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.organization_trial(text) TO atacuisine_app;

CREATE OR REPLACE FUNCTION app.platform_sites() RETURNS TABLE(restaurant_id text,published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT r.id,v.published_at FROM restaurants r
  JOIN organizations o ON o.id=r.organization_id AND o.status='active'
  JOIN restaurant_cms c ON c.restaurant_id=r.id
  JOIN cms_versions v ON v.id=c.published_version_id AND v.restaurant_id=r.id
  WHERE r.archived_at IS NULL AND app.current_organization_plan(o.id)>=39
    AND (v.config #>> '{seo,noIndex}')='false' AND app.primary_domain(r.id) IS NULL
  ORDER BY r.id LIMIT 50000
$$;

INSERT INTO schema_versions(version) VALUES(76);
