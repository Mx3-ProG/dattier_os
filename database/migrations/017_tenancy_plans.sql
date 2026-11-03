-- Offres SaaS : chaque structure appartient à une seule organisation cliente.
-- Essentiel = une structure ; Premium = plusieurs. Seul l'administrateur plateforme voit tout.
ALTER TABLE organizations ADD COLUMN plan text NOT NULL DEFAULT 'essentiel' CHECK(plan IN ('essentiel','premium'));
-- Les deux établissements historiques de démonstration appartiennent à une organisation Premium.
UPDATE organizations SET plan='premium' WHERE id='legacy';
CREATE FUNCTION app.plan_quota(p text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p WHEN 'premium' THEN 10 ELSE 1 END $$;

-- Quota de structures par organisation.
CREATE FUNCTION app.guard_restaurant_quota() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE quota integer; BEGIN
 SELECT app.plan_quota(plan) INTO quota FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF (SELECT count(*) FROM restaurants WHERE organization_id=NEW.organization_id AND id<>NEW.id)>=quota THEN
  RAISE EXCEPTION 'Offre Essentiel : une seule structure par compte. Passez à l''offre Premium pour en ajouter.';
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER restaurant_quota BEFORE INSERT OR UPDATE OF organization_id ON restaurants FOR EACH ROW EXECUTE FUNCTION app.guard_restaurant_quota();

-- Un compte propriétaire = une seule organisation cliente. Plusieurs structures se gèrent
-- dans cette organisation via l'offre Premium : pas de contournement par une 2e organisation.
CREATE FUNCTION app.assert_owner_quota(pid text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF app.is_platform_admin(pid) THEN RETURN; END IF;
 IF (SELECT count(DISTINCT r.organization_id) FROM restaurants r
  WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.profile_id=pid AND m.restaurant_id=r.id AND m.role='OWNER')
     OR EXISTS(SELECT 1 FROM organization_memberships om WHERE om.profile_id=pid AND om.organization_id=r.organization_id AND om.role IN ('OWNER','ADMIN')))>1 THEN
  RAISE EXCEPTION 'Ce compte est déjà propriétaire d''une structure. Pour gérer plusieurs établissements, ajoutez-les à votre compte avec l''offre Premium.';
 END IF;
 END $$;
CREATE FUNCTION app.guard_membership_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.role='SUPER_ADMIN' AND NOT app.is_platform_admin(NEW.profile_id) THEN
  RAISE EXCEPTION 'Le rôle Super Admin est réservé à l''administration de la plateforme.';
 END IF;
 IF NEW.role IN ('OWNER','ADMIN') THEN PERFORM app.assert_owner_quota(NEW.profile_id); END IF;
 RETURN NEW; END $$;
CREATE TRIGGER membership_owner_quota AFTER INSERT OR UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION app.guard_membership_owner();
CREATE TRIGGER organization_owner_quota AFTER INSERT OR UPDATE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION app.guard_membership_owner();

-- Seul l'administrateur plateforme (table platform_admins) a une vue sur toutes les structures.
CREATE OR REPLACE FUNCTION app.has_restaurant(rid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM restaurants r JOIN organizations o ON o.id=r.organization_id WHERE r.id=rid AND ((o.status='active' AND ((current_setting('app.public',true)='true' AND current_setting('app.restaurant_id',true)=rid) OR EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=rid AND m.profile_id=app.user_id() AND p.status='active') OR app.org_admin(r.organization_id))) OR EXISTS(SELECT 1 FROM platform_admins a JOIN profiles p ON p.id=a.profile_id WHERE a.profile_id=app.user_id() AND p.status='active'))) $$;
CREATE POLICY platform_read ON organizations FOR SELECT USING(app.is_platform_admin(app.user_id()));
REVOKE ALL ON FUNCTION app.plan_quota(text),app.assert_owner_quota(text),app.guard_restaurant_quota(),app.guard_membership_owner() FROM PUBLIC;
INSERT INTO schema_versions VALUES(17);
