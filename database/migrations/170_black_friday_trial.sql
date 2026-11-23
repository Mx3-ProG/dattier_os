-- Black Friday : les espaces créés jusqu'au lundi 16 novembre 2026 à minuit
-- (heure de Paris) reçoivent 7 jours d'essai, puis on revient à 3 jours.
-- Date alignée sur src/features/platform/promotion.ts (blackFriday.endsAt).
ALTER TABLE app.organization_plans DROP CONSTRAINT IF EXISTS organization_trial_dates;
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
    SET trial_started_at=now(),trial_ends_at=now()+CASE
      WHEN now() < timestamptz '2026-11-17 00:00:00+01' THEN interval '7 days'
      ELSE interval '3 days' END
    WHERE organization_id=oid AND plan=0 AND trial_started_at IS NULL
    RETURNING trial_ends_at INTO trial_end;
  IF trial_end IS NULL THEN RAISE EXCEPTION 'Essai indisponible.'; END IF;
  RETURN trial_end;
END $$;

-- La fin d'essai reste celle accordée (3 ou 7 jours) ; cancelled_at coupe l'accès.
CREATE OR REPLACE FUNCTION app.cancel_organization_subscription(oid text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id=oid AND profile_id=app.user_id() AND role='OWNER'
  ) THEN RAISE EXCEPTION 'Résiliation non autorisée.'; END IF;
  UPDATE app.organization_plans
    SET plan=0,cancelled_at=now()
    WHERE organization_id=oid AND (plan>0 OR (trial_ends_at>now() AND cancelled_at IS NULL));
END $$;

INSERT INTO schema_versions(version) VALUES(170) ON CONFLICT DO NOTHING;
