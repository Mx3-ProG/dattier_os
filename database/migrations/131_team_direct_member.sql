-- Lets an establishment administrator add a person to the team directly, without
-- an invitation link: the person gets a team profile (no sign-in) that can be
-- scheduled right away. ASCII only (accents written as E'' escapes) so that a
-- paste into the Supabase SQL editor cannot damage it.

CREATE OR REPLACE FUNCTION app.add_team_member(rid text, pid text, pname text, pemail text, proles jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org text; item text; main_role text;
BEGIN
  IF NOT coalesce(app.restaurant_admin(rid), false) THEN
    RAISE EXCEPTION E'Administration non autorisée.';
  END IF;
  IF pid !~ '^staff:[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Profil invalide.'; END IF;
  IF length(btrim(coalesce(pname, ''))) < 2 THEN RAISE EXCEPTION 'Nom invalide.'; END IF;
  IF jsonb_typeof(proles) <> 'array' OR jsonb_array_length(proles) = 0 THEN
    RAISE EXCEPTION E'Choisissez au moins un rôle.';
  END IF;
  SELECT organization_id INTO org FROM restaurants WHERE id = rid AND archived_at IS NULL;
  IF org IS NULL THEN RAISE EXCEPTION E'Établissement introuvable.'; END IF;
  IF coalesce(pemail, '') <> '' AND EXISTS(
    SELECT 1 FROM memberships m JOIN profiles p ON p.id = m.profile_id
    WHERE m.restaurant_id = rid AND lower(p.email) = lower(pemail)
  ) THEN
    RAISE EXCEPTION E'Cette personne fait déjà partie de l’équipe.';
  END IF;
  main_role := proles->>0;
  FOR item IN SELECT jsonb_array_elements_text(proles) LOOP
    IF item NOT IN ('MANAGER','WAITER','CHEF','BARTENDER','STOCK_MANAGER','PURCHASING','ACCOUNTANT') THEN
      RAISE EXCEPTION E'Rôle invalide.';
    END IF;
  END LOOP;
  INSERT INTO profiles(id, name, role, email) VALUES(pid, btrim(pname), main_role, lower(coalesce(pemail, '')));
  INSERT INTO organization_memberships VALUES(org, pid, 'MEMBER') ON CONFLICT DO NOTHING;
  FOR item IN SELECT DISTINCT jsonb_array_elements_text(proles) LOOP
    INSERT INTO memberships VALUES(pid, rid, item) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO audit_logs(id, restaurant_id, actor, action, object_id)
  VALUES(gen_random_uuid()::text, rid, app.user_id(), E'Membre ajouté à l’équipe', pid);
END $$;

REVOKE ALL ON FUNCTION app.add_team_member(text,text,text,text,jsonb) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='atacuisine_app') THEN
  GRANT EXECUTE ON FUNCTION app.add_team_member(text,text,text,text,jsonb) TO atacuisine_app;
END IF; END $$;

INSERT INTO schema_versions(version) VALUES(131) ON CONFLICT DO NOTHING;
