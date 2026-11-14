-- 200 : codes PIN du personnel, journal « qui fait quoi » et visibilité réglée membre par membre.
-- Le PIN ne sert jamais à se connecter : il identifie la personne qui valide une étape
-- (prise de commande, encaissement, annulation), y compris sur un appareil partagé.
-- Idempotente : plusieurs sessions de développement peuvent l'avoir déjà appliquée.

-- Exigence par établissement. Les établissements existants restent sans PIN jusqu'à ce que
-- l'administrateur l'active ; les nouveaux établissements l'activent à leur création (code applicatif).
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS staff_pin_required boolean NOT NULL DEFAULT false;

-- Un PIN par personne et par établissement, haché (scrypt + sel) côté serveur, jamais en clair.
CREATE TABLE IF NOT EXISTS staff_pins(
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  profile_id text NOT NULL REFERENCES profiles ON DELETE CASCADE,
  pin_hash text NOT NULL CHECK(pin_hash LIKE 'scrypt$%'),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0),
  locked_until timestamptz,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(restaurant_id, profile_id)
);
ALTER TABLE staff_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pin_read ON staff_pins;
DROP POLICY IF EXISTS pin_insert ON staff_pins;
DROP POLICY IF EXISTS pin_update ON staff_pins;
DROP POLICY IF EXISTS pin_delete ON staff_pins;
CREATE POLICY pin_read ON staff_pins FOR SELECT USING(app.in_restaurant(restaurant_id));
-- Chacun écrit seulement son propre PIN ; l'administrateur peut seulement l'effacer (réinitialisation).
CREATE POLICY pin_insert ON staff_pins FOR INSERT
  WITH CHECK(app.in_restaurant(restaurant_id) AND profile_id = app.user_id());
CREATE POLICY pin_update ON staff_pins FOR UPDATE
  USING(app.in_restaurant(restaurant_id) AND profile_id = app.user_id())
  WITH CHECK(app.in_restaurant(restaurant_id) AND profile_id = app.user_id());
CREATE POLICY pin_delete ON staff_pins FOR DELETE
  USING(app.in_restaurant(restaurant_id) AND (profile_id = app.user_id() OR app.restaurant_admin(restaurant_id)));

-- Compteur d'essais : l'appareil partagé est connecté avec un autre compte que la personne
-- qui tape son PIN, d'où une fonction dédiée qui ne touche qu'aux compteurs.
CREATE OR REPLACE FUNCTION app.record_pin_attempt(rid text, pid text, ok boolean)
RETURNS TABLE(failed_attempts integer, locked_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT app.in_restaurant(rid) THEN RAISE EXCEPTION E'Établissement non autorisé.'; END IF;
  IF ok THEN
    RETURN QUERY UPDATE staff_pins s SET failed_attempts = 0, locked_until = NULL
      WHERE s.restaurant_id = rid AND s.profile_id = pid
      RETURNING s.failed_attempts, s.locked_until;
  ELSE
    RETURN QUERY UPDATE staff_pins s SET
        failed_attempts = CASE WHEN s.failed_attempts + 1 >= 5 THEN 0 ELSE s.failed_attempts + 1 END,
        locked_until = CASE WHEN s.failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE s.locked_until END
      WHERE s.restaurant_id = rid AND s.profile_id = pid
      RETURNING s.failed_attempts, s.locked_until;
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.record_pin_attempt(text,text,boolean) FROM PUBLIC;

-- Ce que chaque membre voit dans le poste de travail. `hidden` liste les entrées de menu
-- masquées ; `denied` les droits retirés côté serveur (calculés par l'application).
CREATE TABLE IF NOT EXISTS member_visibility(
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  profile_id text NOT NULL REFERENCES profiles ON DELETE CASCADE,
  hidden text[] NOT NULL DEFAULT '{}' CHECK(cardinality(hidden) <= 100),
  denied text[] NOT NULL DEFAULT '{}' CHECK(denied <@ ARRAY['security','website','catalog','payments','orders','kitchen','bar','stock','purchases','finance','team','customers','settings','audit','reservations','floor','payroll','analytics']::text[]),
  updated_by text REFERENCES profiles,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(restaurant_id, profile_id)
);
ALTER TABLE member_visibility ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visibility_read ON member_visibility;
DROP POLICY IF EXISTS visibility_insert ON member_visibility;
DROP POLICY IF EXISTS visibility_update ON member_visibility;
DROP POLICY IF EXISTS visibility_delete ON member_visibility;
CREATE POLICY visibility_read ON member_visibility FOR SELECT USING(app.in_restaurant(restaurant_id));
CREATE POLICY visibility_insert ON member_visibility FOR INSERT
  WITH CHECK(app.in_restaurant(restaurant_id) AND app.restaurant_admin(restaurant_id));
CREATE POLICY visibility_update ON member_visibility FOR UPDATE
  USING(app.in_restaurant(restaurant_id) AND app.restaurant_admin(restaurant_id))
  WITH CHECK(app.in_restaurant(restaurant_id) AND app.restaurant_admin(restaurant_id));
CREATE POLICY visibility_delete ON member_visibility FOR DELETE
  USING(app.in_restaurant(restaurant_id) AND app.restaurant_admin(restaurant_id));

-- Journal en ajout seul : qui (PIN) a fait quoi, depuis quel compte connecté.
CREATE TABLE IF NOT EXISTS staff_activity(
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  profile_id text NOT NULL REFERENCES profiles,
  device_profile_id text REFERENCES profiles,
  kind text NOT NULL CHECK(kind IN ('order','payment','cancel_item','confirm_order','decline_order','pin_failed','pin_locked','pin_created','pin_reset')),
  object_id text,
  amount integer,
  detail text NOT NULL DEFAULT '' CHECK(length(detail) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_activity_restaurant ON staff_activity(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_activity_member ON staff_activity(restaurant_id, profile_id, created_at DESC);
ALTER TABLE staff_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_read ON staff_activity;
DROP POLICY IF EXISTS activity_insert ON staff_activity;
CREATE POLICY activity_read ON staff_activity FOR SELECT USING(app.in_restaurant(restaurant_id));
CREATE POLICY activity_insert ON staff_activity FOR INSERT WITH CHECK(app.in_restaurant(restaurant_id));

-- Après acceptation, l'invité est conduit vers son établissement (la RLS des invitations
-- ne lui laisse rien lire) : seul l'identifiant, et seulement s'il en est désormais membre.
CREATE OR REPLACE FUNCTION app.accepted_invitation_restaurant(hashed text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT i.restaurant_id FROM invitations i
  WHERE i.token_hash = hashed AND i.accepted_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM memberships m WHERE m.restaurant_id = i.restaurant_id AND m.profile_id = app.user_id())
$$;
REVOKE ALL ON FUNCTION app.accepted_invitation_restaurant(text) FROM PUBLIC;

DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='atacuisine_app') THEN
  GRANT EXECUTE ON FUNCTION app.accepted_invitation_restaurant(text) TO atacuisine_app;
  GRANT SELECT,INSERT,UPDATE,DELETE ON staff_pins, member_visibility TO atacuisine_app;
  GRANT SELECT,INSERT ON staff_activity TO atacuisine_app;
  GRANT EXECUTE ON FUNCTION app.record_pin_attempt(text,text,boolean) TO atacuisine_app;
END IF; END $$;

INSERT INTO schema_versions(version) VALUES(200) ON CONFLICT DO NOTHING;
