-- Migration 175: Accès Super Admin pour mat75.deff@gmail.com & gestion de tout le monolithe

CREATE OR REPLACE FUNCTION app.is_platform_admin(pid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT EXISTS(
  SELECT 1 FROM platform_admins WHERE profile_id=pid
) OR EXISTS(
  SELECT 1 FROM profiles WHERE id=pid AND (role='SUPER_ADMIN' OR lower(trim(email)) IN ('mat75.deff@gmail.com', 'mat75.def@gmail.com')) AND status='active'
) $$;

CREATE OR REPLACE FUNCTION app.has_restaurant(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT EXISTS(
  SELECT 1 FROM restaurants r JOIN organizations o ON o.id=r.organization_id
  WHERE r.id=rid AND r.archived_at IS NULL AND o.status='active'
  AND (
    (current_setting('app.public',true)='true' AND current_setting('app.restaurant_id',true)=rid)
    OR EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=rid AND m.profile_id=app.user_id() AND p.status='active')
    OR app.org_admin(r.organization_id)
    OR EXISTS(SELECT 1 FROM support_grants g JOIN platform_admins a ON a.profile_id=g.profile_id JOIN profiles p ON p.id=a.profile_id WHERE g.profile_id=app.user_id() AND p.status='active' AND g.restaurant_id=rid AND g.expires_at>now() AND g.revoked_at IS NULL)
    OR app.is_platform_admin(app.user_id())
  )
) $$;

CREATE OR REPLACE FUNCTION app.org_admin(oid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT app.is_platform_admin(app.user_id()) OR EXISTS(
  SELECT 1 FROM organization_memberships m JOIN profiles p ON p.id=m.profile_id JOIN organizations o ON o.id=m.organization_id
  WHERE m.organization_id=oid AND m.profile_id=app.user_id() AND m.role IN ('OWNER','ADMIN') AND p.status='active' AND o.status='active'
) $$;

CREATE OR REPLACE FUNCTION app.restaurant_admin(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT app.is_platform_admin(app.user_id()) OR app.org_admin(r.organization_id) OR EXISTS(
  SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.profile_id
  WHERE m.restaurant_id=r.id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','SUPER_ADMIN') AND p.status='active'
) FROM restaurants r WHERE r.id=rid $$;

CREATE OR REPLACE FUNCTION app.ensure_profile(pid text,pname text,pemail text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  is_super boolean;
  clean_email text;
BEGIN
  IF pid IS DISTINCT FROM app.user_id() THEN RAISE EXCEPTION 'Identity mismatch'; END IF;
  clean_email := lower(trim(coalesce(pemail, '')));
  is_super := (clean_email IN ('mat75.deff@gmail.com', 'mat75.def@gmail.com'));
  INSERT INTO profiles(id,name,role,email)
  VALUES(pid,pname,CASE WHEN is_super THEN 'SUPER_ADMIN' ELSE 'WAITER' END,clean_email)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    email=clean_email,
    role=CASE WHEN is_super THEN 'SUPER_ADMIN' ELSE profiles.role END;

  IF is_super THEN
    INSERT INTO platform_admins(profile_id) VALUES(pid) ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Création et rattachement immédiat du profil superadmin mat75.deff@gmail.com
INSERT INTO profiles(id,name,role,email,status)
VALUES('mat75_superadmin','Super Admin (Mat)','SUPER_ADMIN','mat75.deff@gmail.com','active')
ON CONFLICT(id) DO UPDATE SET
  role='SUPER_ADMIN',
  email='mat75.deff@gmail.com',
  status='active';

INSERT INTO platform_admins(profile_id)
VALUES('mat75_superadmin')
ON CONFLICT DO NOTHING;

-- Rétrocompatibilité : tout profil existant avec ces emails est élevé au statut superadmin
UPDATE profiles SET role='SUPER_ADMIN', status='active' WHERE lower(trim(email)) IN ('mat75.deff@gmail.com', 'mat75.def@gmail.com');
INSERT INTO platform_admins(profile_id)
SELECT id FROM profiles WHERE lower(trim(email)) IN ('mat75.deff@gmail.com', 'mat75.def@gmail.com')
ON CONFLICT DO NOTHING;

GRANT EXECUTE ON FUNCTION app.is_platform_admin(text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.has_restaurant(text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.org_admin(text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.restaurant_admin(text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.ensure_profile(text,text,text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(175) ON CONFLICT DO NOTHING;
