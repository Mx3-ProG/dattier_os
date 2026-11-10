-- Réservations sans plan de salle (lot P1-a3, décision du 10 novembre 2026).
--
-- Avant : « Réservations » exigeait le plan de salle installé et actif. Après : les
-- réservations fonctionnent seules ; le plan de salle devient un complément qui permet
-- d'attribuer une table. Sans plan de salle, une demande est enregistrée sans table et
-- l'équipe la confirme sans table.
--
-- Pour un établissement qui a les deux modules (cas de tous les établissements actuels),
-- rien ne change : l'attribution de table reste exigée à la confirmation (src/lib/actions.ts).
-- Seuls deviennent possibles les états auparavant refusés : réservations actives avec
-- plan de salle désinstallé ou suspendu.
--
-- Garde-fou : une table ne peut être attribuée que si le plan de salle est actif, et le
-- plan de salle ne peut être retiré tant que des réservations à venir ont une table.

-- 1. Réservations : plus de dépendance au plan de salle.
CREATE OR REPLACE FUNCTION app.module_enabled(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM restaurants r WHERE r.id=rid AND r.industry='restaurant')
    AND module IN ('floor','table-booking')
    AND app.addon_installed(rid,CASE WHEN module='table-booking' THEN 'booking' ELSE 'floor' END)
    AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
      AND s.module_id=module AND s.applied_state='suspended')
$$;

-- 2. Activation : plus d'ordre imposé entre les deux modules.
CREATE OR REPLACE FUNCTION app.apply_module_state(rid text, module text, expected_revision integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE desired text;
DECLARE current_state text;
BEGIN
  IF current_setting('app.public',true)='true' OR NOT app.in_restaurant(rid)
     OR NOT app.org_admin((SELECT organization_id FROM restaurants WHERE id=rid)) THEN
    RAISE EXCEPTION 'Activation réservée à l’administrateur de l’organisation.';
  END IF;
  IF module NOT IN ('floor','table-booking') OR expected_revision IS NULL OR expected_revision<1 THEN
    RAISE EXCEPTION 'Module ou révision invalide.';
  END IF;
  -- Serialize activation with new table sessions and reservation requests.
  PERFORM 1 FROM restaurants WHERE id=rid AND archived_at IS NULL FOR UPDATE;
  SELECT requested_state,applied_state INTO desired,current_state FROM module_settings
    WHERE restaurant_id=rid AND module_id=module AND revision=expected_revision FOR UPDATE;
  IF desired IS NULL THEN RAISE EXCEPTION 'Configuration modifiée ailleurs. Rechargez les modules.'; END IF;
  IF desired=current_state THEN RETURN desired; END IF;
  IF desired='suspended' AND current_state<>'suspended' THEN
    IF module='floor' AND (
      EXISTS (SELECT 1 FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id WHERE t.restaurant_id=rid AND s.closed_at IS NULL)
      OR EXISTS (SELECT 1 FROM orders o JOIN table_sessions s ON s.id=o.session_id WHERE o.restaurant_id=rid AND o.status IN ('pending','active'))
    ) THEN RAISE EXCEPTION 'Terminez les services de table en cours.'; END IF;
    IF module='floor' AND EXISTS (SELECT 1 FROM reservations WHERE restaurant_id=rid AND table_id IS NOT NULL
      AND status IN ('requested','confirmed','arrived') AND ends_at>now()) THEN
      RAISE EXCEPTION 'Retirez d’abord les tables attribuées aux réservations à venir.';
    END IF;
    IF module='table-booking' AND EXISTS (SELECT 1 FROM reservations WHERE restaurant_id=rid
      AND status IN ('requested','confirmed','arrived') AND ends_at>now()) THEN
      RAISE EXCEPTION 'Traitez les réservations à venir avant suspension.';
    END IF;
  END IF;
  UPDATE module_settings SET applied_state=desired,applied_at=now()
    WHERE restaurant_id=rid AND module_id=module;
  INSERT INTO module_setting_events(restaurant_id,module_id,previous_state,requested_state,revision,actor_id,event_kind)
    VALUES(rid,module,current_state,desired,expected_revision,app.user_id(),'applied');
  RETURN desired;
END $$;
REVOKE ALL ON FUNCTION app.apply_module_state(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apply_module_state(text,text,integer) TO atacuisine_app;

-- 3. Installation : mêmes règles que l'activation.
CREATE OR REPLACE FUNCTION app.addon_installation_set(rid text, addon text, desired boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE module text;
BEGIN
  IF current_setting('app.public',true)='true' OR NOT app.in_restaurant(rid)
     OR NOT app.addon_store_manager(rid) THEN
    RAISE EXCEPTION 'Gestion des add-ons réservée au super admin de l’établissement.';
  END IF;
  IF desired IS NULL OR NOT app.addon_entitled(rid,addon) THEN
    RAISE EXCEPTION 'Cet add-on n’est pas disponible pour cet établissement.';
  END IF;
  PERFORM 1 FROM restaurants WHERE id=rid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Établissement indisponible.'; END IF;
  module:=CASE addon WHEN 'floor' THEN 'floor' WHEN 'booking' THEN 'table-booking' END;
  IF NOT desired AND module='floor' THEN
    IF EXISTS (SELECT 1 FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id WHERE t.restaurant_id=rid AND s.closed_at IS NULL)
      OR EXISTS (SELECT 1 FROM orders o JOIN table_sessions s ON s.id=o.session_id WHERE o.restaurant_id=rid AND o.status IN ('pending','active'))
    THEN RAISE EXCEPTION 'Terminez les services de table en cours.'; END IF;
    IF EXISTS (SELECT 1 FROM reservations WHERE restaurant_id=rid AND table_id IS NOT NULL
      AND status IN ('requested','confirmed','arrived') AND ends_at>now()) THEN
      RAISE EXCEPTION 'Retirez d’abord les tables attribuées aux réservations à venir.';
    END IF;
  END IF;
  IF NOT desired AND module='table-booking' AND EXISTS (SELECT 1 FROM reservations WHERE restaurant_id=rid
    AND status IN ('requested','confirmed','arrived') AND ends_at>now()) THEN
    RAISE EXCEPTION 'Traitez les réservations à venir avant désinstallation.';
  END IF;
  INSERT INTO addon_installations(restaurant_id,addon_id,installed,updated_by)
    VALUES(rid,addon,desired,app.user_id())
    ON CONFLICT (restaurant_id,addon_id) DO UPDATE SET installed=excluded.installed,
      updated_by=excluded.updated_by,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION app.addon_installation_set(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.addon_installation_set(text,text,boolean) TO atacuisine_app;

-- 4. Une table ne s'attribue qu'avec le plan de salle actif.
CREATE OR REPLACE FUNCTION app.check_reservation_table() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.table_id IS NOT NULL
     AND (TG_OP='INSERT' OR NEW.table_id IS DISTINCT FROM OLD.table_id)
     AND NOT app.module_enabled(NEW.restaurant_id,'floor') THEN
    RAISE EXCEPTION 'Activez le plan de salle pour attribuer une table.';
  END IF;
  RETURN NEW;
END $$;
-- Idempotent : une base a pu appliquer une version antérieure numérotée 093.
DROP TRIGGER IF EXISTS reservation_table_floor ON reservations;
CREATE TRIGGER reservation_table_floor BEFORE INSERT OR UPDATE OF table_id ON reservations
  FOR EACH ROW EXECUTE FUNCTION app.check_reservation_table();

INSERT INTO schema_versions(version) VALUES(100);
