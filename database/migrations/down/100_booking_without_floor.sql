-- Rétablit la dépendance Réservations → Plan de salle (définitions de 078, 050 et 071).
-- À n'exécuter qu'après avoir retiré ou suspendu les réservations actives sans plan de salle.
DROP TRIGGER IF EXISTS reservation_table_floor ON reservations;
DROP FUNCTION IF EXISTS app.check_reservation_table();
CREATE OR REPLACE FUNCTION app.module_enabled(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM restaurants r WHERE r.id=rid AND r.industry='restaurant')
    AND module IN ('floor','table-booking')
    AND app.addon_installed(rid,CASE WHEN module='table-booking' THEN 'booking' ELSE 'floor' END)
    AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
      AND s.module_id=module AND s.applied_state='suspended')
    AND (module<>'table-booking' OR app.addon_installed(rid,'floor')
      AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
        AND s.module_id='floor' AND s.applied_state='suspended'))
$$;

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
  IF desired='enabled' AND module='table-booking' AND NOT app.module_enabled(rid,'floor') THEN
    RAISE EXCEPTION 'Activez d’abord le plan de salle.';
  END IF;
  IF desired='suspended' AND current_state<>'suspended' THEN
    IF module='floor' AND EXISTS (
      SELECT 1 FROM module_settings WHERE restaurant_id=rid AND module_id='table-booking' AND applied_state='enabled'
    ) THEN RAISE EXCEPTION 'Suspendez d’abord les réservations de tables.'; END IF;
    IF module='floor' AND NOT EXISTS (
      SELECT 1 FROM module_settings WHERE restaurant_id=rid AND module_id='table-booking' AND applied_state='suspended'
    ) THEN RAISE EXCEPTION 'Suspendez d’abord les réservations de tables.'; END IF;
    IF module='floor' AND (
      EXISTS (SELECT 1 FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id WHERE t.restaurant_id=rid AND s.closed_at IS NULL)
      OR EXISTS (SELECT 1 FROM orders o JOIN table_sessions s ON s.id=o.session_id WHERE o.restaurant_id=rid AND o.status IN ('pending','active'))
    ) THEN RAISE EXCEPTION 'Terminez les services de table en cours.'; END IF;
    IF EXISTS (SELECT 1 FROM reservations WHERE restaurant_id=rid AND status IN ('requested','confirmed','arrived') AND ends_at>now()) THEN
      RAISE EXCEPTION 'Traitez les réservations à venir avant suspension.';
    END IF;
  END IF;
  UPDATE module_settings SET applied_state=desired,applied_at=now()
    WHERE restaurant_id=rid AND module_id=module;
  INSERT INTO module_setting_events(restaurant_id,module_id,previous_state,requested_state,revision,actor_id,event_kind)
    VALUES(rid,module,current_state,desired,expected_revision,app.user_id(),'applied');
  RETURN desired;
END $$;

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
  IF NOT desired AND module='floor' AND app.addon_installed(rid,'booking') THEN
    RAISE EXCEPTION 'Désinstallez d’abord les réservations de tables.';
  END IF;
  IF NOT desired AND module IN ('floor','table-booking') THEN
    IF module='floor' AND (
      EXISTS (SELECT 1 FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id WHERE t.restaurant_id=rid AND s.closed_at IS NULL)
      OR EXISTS (SELECT 1 FROM orders o JOIN table_sessions s ON s.id=o.session_id WHERE o.restaurant_id=rid AND o.status IN ('pending','active'))
    ) THEN RAISE EXCEPTION 'Terminez les services de table en cours.'; END IF;
    IF EXISTS (SELECT 1 FROM reservations WHERE restaurant_id=rid AND status IN ('requested','confirmed','arrived') AND ends_at>now()) THEN
      RAISE EXCEPTION 'Traitez les réservations à venir avant désinstallation.';
    END IF;
  END IF;
  IF desired AND module='table-booking' AND NOT app.module_enabled(rid,'floor') THEN
    RAISE EXCEPTION 'Installez et activez d’abord le plan de salle.';
  END IF;
  INSERT INTO addon_installations(restaurant_id,addon_id,installed,updated_by)
    VALUES(rid,addon,desired,app.user_id())
    ON CONFLICT (restaurant_id,addon_id) DO UPDATE SET installed=excluded.installed,
      updated_by=excluded.updated_by,updated_at=now();
END $$;

DELETE FROM schema_versions WHERE version=100;
