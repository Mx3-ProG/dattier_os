ALTER TABLE public.module_settings
  ADD COLUMN applied_state text NOT NULL DEFAULT 'enabled' CHECK (applied_state IN ('enabled','suspended')),
  ADD COLUMN applied_at timestamptz;
ALTER TABLE public.module_setting_events
  ADD COLUMN event_kind text NOT NULL DEFAULT 'requested' CHECK (event_kind IN ('requested','applied'));

CREATE FUNCTION app.module_enabled(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT module IN ('floor','table-booking')
    AND coalesce(app.restaurant_plan(rid),0)>=39
    AND NOT EXISTS (
      SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
        AND s.module_id=module AND s.applied_state='suspended'
    )
    AND (module<>'table-booking' OR NOT EXISTS (
      SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
        AND s.module_id='floor' AND s.applied_state='suspended'
    ))
$$;

CREATE FUNCTION app.apply_module_state(rid text, module text, expected_revision integer)
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
REVOKE ALL ON FUNCTION app.apply_module_state(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apply_module_state(text,text,integer) TO atacuisine_app;

CREATE FUNCTION app.check_module_new_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid text;
BEGIN
  IF TG_TABLE_NAME='table_sessions' THEN
    IF TG_OP='UPDATE' AND NOT (OLD.closed_at IS NOT NULL AND NEW.closed_at IS NULL) THEN RETURN NEW; END IF;
    SELECT restaurant_id INTO rid FROM dining_tables WHERE id=NEW.table_id;
  ELSE
    IF TG_OP='UPDATE' AND NOT (
      NEW.status IN ('requested','confirmed','arrived') AND NEW.ends_at>now()
      AND (OLD.status NOT IN ('requested','confirmed','arrived') OR OLD.ends_at<=now() OR OLD.restaurant_id<>NEW.restaurant_id)
    ) THEN RETURN NEW; END IF;
    rid:=NEW.restaurant_id;
  END IF;
  PERFORM 1 FROM restaurants WHERE id=rid FOR UPDATE;
  IF NOT app.module_enabled(rid,CASE WHEN TG_TABLE_NAME='table_sessions' THEN 'floor' ELSE 'table-booking' END) THEN
    RAISE EXCEPTION 'Module suspendu pour cet établissement.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER table_session_module BEFORE INSERT ON table_sessions
  FOR EACH ROW EXECUTE FUNCTION app.check_module_new_work();
CREATE TRIGGER table_session_reopen_module BEFORE UPDATE OF closed_at,table_id ON table_sessions
  FOR EACH ROW EXECUTE FUNCTION app.check_module_new_work();
CREATE TRIGGER reservation_module BEFORE INSERT ON reservations
  FOR EACH ROW EXECUTE FUNCTION app.check_module_new_work();
CREATE TRIGGER reservation_reopen_module BEFORE UPDATE OF status,starts_at,ends_at,restaurant_id ON reservations
  FOR EACH ROW EXECUTE FUNCTION app.check_module_new_work();
INSERT INTO schema_versions(version) VALUES(50);
