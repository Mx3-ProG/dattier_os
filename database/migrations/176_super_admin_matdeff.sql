-- Migration 176: Exemption d'abonnement pour le super admin (mat75.deff@gmail.com)

-- org_member doit reconnaître le super admin (platform admin)
CREATE OR REPLACE FUNCTION app.org_member(oid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT app.is_platform_admin(app.user_id()) OR EXISTS(
  SELECT 1 FROM organization_memberships m JOIN profiles p ON p.id=m.profile_id JOIN organizations o ON o.id=m.organization_id
  WHERE m.organization_id=oid AND m.profile_id=app.user_id() AND p.status='active' AND o.status='active'
) $$;

-- Exemption d'abonnement : toute organisation créée par le super admin a un plan Studio actif
CREATE OR REPLACE FUNCTION app.current_organization_plan(oid text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM organizations o JOIN profiles p ON p.id=o.created_by WHERE o.id=oid AND lower(trim(p.email))='mat75.deff@gmail.com') THEN 39
    WHEN p.plan=0 AND p.cancelled_at IS NULL
      AND p.trial_started_at IS NOT NULL AND p.trial_ends_at>now()
      THEN 39 ELSE app.effective_plan(p.plan,p.bonus_plan) END
  FROM app.organization_plans p WHERE p.organization_id=oid
$$;

CREATE OR REPLACE FUNCTION app.organization_trial(oid text)
RETURNS TABLE(trial_ends_at timestamptz,cancelled_at timestamptz,trial_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM organizations o JOIN profiles p ON p.id=o.created_by WHERE o.id=oid AND lower(trim(p.email))='mat75.deff@gmail.com') THEN now() + interval '100 years' ELSE p.trial_ends_at END,
         p.cancelled_at,
         CASE WHEN EXISTS (SELECT 1 FROM organizations o JOIN profiles p ON p.id=o.created_by WHERE o.id=oid AND lower(trim(p.email))='mat75.deff@gmail.com') THEN true ELSE (p.plan=0 AND p.cancelled_at IS NULL AND p.trial_ends_at>now()) END
  FROM app.organization_plans p
  WHERE p.organization_id=oid AND app.org_member(oid)
$$;

GRANT EXECUTE ON FUNCTION app.org_member(text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.current_organization_plan(text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.organization_trial(text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(176) ON CONFLICT DO NOTHING;