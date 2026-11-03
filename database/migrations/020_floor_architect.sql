-- Plan de salle en mode architecte : zones, rotation des tables, quota de tables par offre
-- et droit d’aménagement accordé membre par membre. Migration additive.

-- Zones de l’établissement (salle principale, terrasse, étage…), chacune avec son canevas.
CREATE TABLE floor_zones(id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60), position integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restaurant_id,name));
ALTER TABLE floor_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON floor_zones USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));

-- La colonne texte `zone` reste le nom affiché ; `zone_id` est la référence.
-- Une table archivée dont la zone est supprimée garde son ancien nom et perd sa référence.
ALTER TABLE dining_tables ADD COLUMN zone_id text REFERENCES floor_zones ON DELETE SET NULL;
ALTER TABLE dining_tables ADD COLUMN rotation integer NOT NULL DEFAULT 0 CHECK(rotation BETWEEN 0 AND 359);
INSERT INTO floor_zones(id,restaurant_id,name,position)
 SELECT gen_random_uuid()::text,restaurant_id,zone,(row_number() OVER (PARTITION BY restaurant_id ORDER BY min(number)))::int-1
 FROM dining_tables GROUP BY restaurant_id,zone;
INSERT INTO floor_zones(id,restaurant_id,name) SELECT gen_random_uuid()::text,r.id,'Salle principale' FROM restaurants r WHERE NOT EXISTS(SELECT 1 FROM floor_zones z WHERE z.restaurant_id=r.id);
UPDATE dining_tables t SET zone_id=z.id FROM floor_zones z WHERE z.restaurant_id=t.restaurant_id AND z.name=t.zone;
CREATE INDEX dining_tables_zone ON dining_tables(zone_id);

-- Garde le nom de zone en phase avec sa référence, refuse une zone d’un autre établissement,
-- et rattache (ou crée) la zone d’après son nom pour les écritures qui ne donnent que le nom.
CREATE FUNCTION app.sync_table_zone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE zname text; BEGIN
 IF NEW.zone_id IS NULL THEN
  IF TG_OP='UPDATE' AND NEW.zone IS NOT DISTINCT FROM OLD.zone THEN RETURN NEW; END IF;
  SELECT id INTO NEW.zone_id FROM floor_zones WHERE restaurant_id=NEW.restaurant_id AND name=NEW.zone;
  IF NEW.zone_id IS NULL THEN
   NEW.zone_id:=gen_random_uuid()::text;
   INSERT INTO floor_zones(id,restaurant_id,name,position) VALUES(NEW.zone_id,NEW.restaurant_id,NEW.zone,(SELECT coalesce(max(position)+1,0) FROM floor_zones WHERE restaurant_id=NEW.restaurant_id));
  END IF;
  RETURN NEW;
 END IF;
 SELECT name INTO zname FROM floor_zones WHERE id=NEW.zone_id AND restaurant_id=NEW.restaurant_id;
 IF zname IS NULL THEN RAISE EXCEPTION 'Zone inconnue pour cet établissement.'; END IF;
 NEW.zone:=zname;
 RETURN NEW; END $$;
CREATE TRIGGER table_zone BEFORE INSERT OR UPDATE OF zone,zone_id ON dining_tables FOR EACH ROW EXECUTE FUNCTION app.sync_table_zone();
CREATE FUNCTION app.rename_zone_tables() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 UPDATE dining_tables SET zone=NEW.name WHERE zone_id=NEW.id;
 RETURN NEW; END $$;
CREATE TRIGGER zone_rename AFTER UPDATE OF name ON floor_zones FOR EACH ROW EXECUTE FUNCTION app.rename_zone_tables();
-- Chaque nouvel établissement commence avec une salle principale.
CREATE FUNCTION app.setup_floor_zone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 INSERT INTO floor_zones(id,restaurant_id,name) VALUES(gen_random_uuid()::text,NEW.id,'Salle principale') ON CONFLICT DO NOTHING;
 RETURN NEW; END $$;
CREATE TRIGGER floor_zone_setup AFTER INSERT ON restaurants FOR EACH ROW EXECUTE FUNCTION app.setup_floor_zone();

-- Quota de tables actives (toutes zones confondues) par structure : 50 en Essentiel,
-- sans plafond d’offre en Premium (les numéros restent limités à 1–999).
CREATE FUNCTION app.table_quota(p text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p WHEN 'premium' THEN NULL ELSE 50 END $$;
CREATE FUNCTION app.guard_table_quota() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE quota integer; BEGIN
 IF NEW.archived_at IS NOT NULL OR (TG_OP='UPDATE' AND OLD.archived_at IS NULL) THEN RETURN NEW; END IF;
 -- Le verrou sur la structure sérialise les ajouts concurrents.
 PERFORM 1 FROM restaurants WHERE id=NEW.restaurant_id FOR UPDATE;
 SELECT app.table_quota(coalesce(o.plan,'essentiel')) INTO quota FROM restaurants r LEFT JOIN organizations o ON o.id=r.organization_id WHERE r.id=NEW.restaurant_id;
 IF quota IS NOT NULL AND (SELECT count(*) FROM dining_tables WHERE restaurant_id=NEW.restaurant_id AND archived_at IS NULL AND id<>NEW.id)>=quota THEN
  RAISE EXCEPTION 'Offre Essentiel : % tables actives au maximum sur le plan de salle. Archivez une table ou passez à l''offre Premium.',quota;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER table_quota BEFORE INSERT OR UPDATE OF archived_at ON dining_tables FOR EACH ROW EXECUTE FUNCTION app.guard_table_quota();

-- Droit de modifier le plan (ajouter, déplacer, tourner, archiver des tables, gérer les zones),
-- décidé membre par membre. Sans ligne, le rôle décide (cf. src/features/floor/access.ts).
-- Seuls le propriétaire et l’administrateur de l’organisation écrivent ce droit.
CREATE TABLE floor_layout_access(restaurant_id text NOT NULL REFERENCES restaurants, profile_id text NOT NULL REFERENCES profiles, allowed boolean NOT NULL, updated_by text REFERENCES profiles, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(restaurant_id,profile_id));
ALTER TABLE floor_layout_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY layout_read ON floor_layout_access FOR SELECT USING(app.in_restaurant(restaurant_id));
CREATE POLICY layout_insert ON floor_layout_access FOR INSERT WITH CHECK(app.in_restaurant(restaurant_id) AND app.restaurant_admin(restaurant_id));
CREATE POLICY layout_update ON floor_layout_access FOR UPDATE USING(app.in_restaurant(restaurant_id) AND app.restaurant_admin(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id) AND app.restaurant_admin(restaurant_id));
CREATE POLICY layout_delete ON floor_layout_access FOR DELETE USING(app.in_restaurant(restaurant_id) AND app.restaurant_admin(restaurant_id));

DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='dattier_app') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON floor_zones,floor_layout_access TO dattier_app;
 GRANT EXECUTE ON FUNCTION app.table_quota(text) TO dattier_app;
END IF; END $$;
REVOKE ALL ON FUNCTION app.sync_table_zone(),app.rename_zone_tables(),app.setup_floor_zone(),app.guard_table_quota() FROM PUBLIC;
INSERT INTO schema_versions VALUES(20);
