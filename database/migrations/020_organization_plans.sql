CREATE TABLE app.organization_plans (
  organization_id text PRIMARY KEY REFERENCES public.organizations ON DELETE CASCADE,
  plan integer NOT NULL DEFAULT 0 CHECK (plan IN (0,39,69,99)),
  seats integer NOT NULL DEFAULT 1 CHECK (seats >= 1)
);
ALTER TABLE organizations ADD COLUMN requested_plan integer NOT NULL DEFAULT 39 CHECK (requested_plan IN (39,69,99));
ALTER TABLE restaurants ADD COLUMN archived_at timestamptz;
CREATE INDEX restaurants_active_organization ON restaurants(organization_id) WHERE archived_at IS NULL;

-- Preserve access and capacity for organizations created before billing.
INSERT INTO app.organization_plans (organization_id,plan,seats)
SELECT o.id,99,greatest(count(r.id),1)
FROM organizations o LEFT JOIN restaurants r ON r.organization_id=o.id GROUP BY o.id;

CREATE FUNCTION app.init_organization_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO app.organization_plans(organization_id) VALUES (NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER init_organization_plan AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION app.init_organization_plan();

CREATE FUNCTION app.check_restaurant_seat() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE capacity integer;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Changement d’organisation non autorisé.';
    END IF;
    IF NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN RETURN NEW; END IF;
  END IF;
  UPDATE app.organization_plans SET seats=seats WHERE organization_id=NEW.organization_id RETURNING seats INTO STRICT capacity;
  IF NEW.archived_at IS NULL AND (
    SELECT count(*) FROM restaurants WHERE organization_id=NEW.organization_id AND archived_at IS NULL
  ) >= capacity THEN
    RAISE EXCEPTION 'Quota d’établissements atteint.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_restaurant_seat BEFORE INSERT OR UPDATE OF organization_id,archived_at ON restaurants
FOR EACH ROW EXECUTE FUNCTION app.check_restaurant_seat();

CREATE FUNCTION app.restaurant_plan(rid text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.plan FROM restaurants r JOIN app.organization_plans p ON p.organization_id=r.organization_id
  JOIN organizations o ON o.id=r.organization_id
  WHERE r.id=rid AND r.archived_at IS NULL AND o.status='active' AND (app.has_restaurant(rid) OR (session_user=current_user AND current_setting('role')='none'))
$$;

-- The public checkout and staff order paths need the same restaurant lock.
-- The restaurants UPDATE policy otherwise hides rows from non-admin callers.
CREATE FUNCTION app.lock_restaurant_for_order(rid text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF coalesce(app.restaurant_plan(rid),0)<39 THEN RETURN false; END IF;
  PERFORM 1 FROM restaurants WHERE id=rid AND archived_at IS NULL FOR UPDATE;
  RETURN FOUND;
END $$;

CREATE FUNCTION app.organization_plan(oid text) RETURNS TABLE(plan integer,seats integer,occupied integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.plan,p.seats,(SELECT count(*)::int FROM restaurants r WHERE r.organization_id=oid AND r.archived_at IS NULL)
  FROM app.organization_plans p WHERE p.organization_id=oid AND app.org_member(oid)
$$;

-- Called by the operator using the migration role after confirming payment and
-- obtaining the administrator's explicit list of establishments to archive.
CREATE FUNCTION app.configure_organization_plan(oid text,new_plan integer,new_seats integer,archive_ids text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM app.organization_plans WHERE organization_id=oid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation introuvable.'; END IF;
  PERFORM 1 FROM restaurants WHERE organization_id=oid AND archived_at IS NULL ORDER BY id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM unnest(archive_ids) AS selected(id)
    WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id=selected.id AND r.organization_id=oid AND r.archived_at IS NULL)
  ) THEN RAISE EXCEPTION 'Établissement actif introuvable dans cette organisation.'; END IF;
  IF EXISTS (
    SELECT 1 FROM orders o LEFT JOIN shop_orders s ON s.order_id=o.id
    WHERE o.restaurant_id=ANY(archive_ids) AND (
      o.status='pending' OR (o.status='active' AND (
        s.payment_status IS DISTINCT FROM 'paid' OR EXISTS (
          SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.status NOT IN ('served','cancelled')
        )
      ))
    )
  ) THEN RAISE EXCEPTION 'Terminez les commandes en cours avant d’archiver un établissement.'; END IF;
  UPDATE restaurants SET archived_at=now() WHERE organization_id=oid AND id=ANY(archive_ids);
  IF (SELECT count(*) FROM restaurants WHERE organization_id=oid AND archived_at IS NULL) > new_seats THEN
    RAISE EXCEPTION 'Sélectionnez les établissements à archiver avant de réduire les places.';
  END IF;
  UPDATE app.organization_plans SET plan=new_plan,seats=new_seats WHERE organization_id=oid;
END $$;
REVOKE ALL ON FUNCTION app.configure_organization_plan(text,integer,integer,text[]) FROM PUBLIC,dattier_app;
REVOKE ALL ON app.organization_plans FROM PUBLIC,dattier_app;
CREATE OR REPLACE FUNCTION app.has_restaurant(rid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM restaurants r JOIN organizations o ON o.id=r.organization_id WHERE r.id=rid AND r.archived_at IS NULL AND o.status='active' AND ((current_setting('app.public',true)='true' AND current_setting('app.restaurant_id',true)=rid) OR EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=rid AND m.profile_id=app.user_id() AND p.status='active') OR app.org_admin(r.organization_id) OR EXISTS(SELECT 1 FROM support_grants g JOIN platform_admins a ON a.profile_id=g.profile_id JOIN profiles p ON p.id=a.profile_id WHERE g.profile_id=app.user_id() AND p.status='active' AND g.restaurant_id=rid AND g.expires_at>now() AND g.revoked_at IS NULL))) $$;
CREATE OR REPLACE FUNCTION app.resolve_domain(host text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT d.restaurant_id FROM restaurant_domains d JOIN restaurants r ON r.id=d.restaurant_id JOIN organizations o ON o.id=r.organization_id WHERE d.hostname=lower(host) AND d.verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM app.organization_plans p WHERE p.organization_id=o.id AND p.plan>=69) AND r.archived_at IS NULL AND o.status='active' $$;
CREATE FUNCTION app.protect_restaurant_archive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at AND
    NOT pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid='public.restaurants'::regclass), 'MEMBER') THEN
    RAISE EXCEPTION 'Archivage non autorisé.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_restaurant_archive BEFORE UPDATE OF archived_at ON restaurants
FOR EACH ROW EXECUTE FUNCTION app.protect_restaurant_archive();
CREATE OR REPLACE FUNCTION app.health_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version>=20) $$;
CREATE FUNCTION app.reward_plan_allowed(reward_token text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM promo_codes c JOIN restaurants r ON r.id=c.restaurant_id
  JOIN organizations o ON o.id=r.organization_id JOIN app.organization_plans p ON p.organization_id=o.id
  WHERE c.token=reward_token AND p.plan>=69 AND r.archived_at IS NULL AND o.status='active')
$$;
-- SEO: restaurant sites published under the platform host (/r/{id}). Additive only.
-- Lists only sites whose owner enabled indexing in the published version, with no verified domain
-- of their own and an active organisation: public information by definition.
CREATE OR REPLACE FUNCTION app.platform_sites() RETURNS TABLE(restaurant_id text,published_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,v.published_at FROM restaurants r
 JOIN organizations o ON o.id=r.organization_id AND o.status='active'
 JOIN restaurant_cms c ON c.restaurant_id=r.id
 JOIN cms_versions v ON v.id=c.published_version_id AND v.restaurant_id=r.id
 JOIN app.organization_plans p ON p.organization_id=o.id AND p.plan>=69
 WHERE r.archived_at IS NULL AND (v.config #>> '{seo,noIndex}')='false' AND app.primary_domain(r.id) IS NULL
 ORDER BY r.id LIMIT 50000 $$;
INSERT INTO schema_versions(version) VALUES(20);
