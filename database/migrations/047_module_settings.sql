-- Administrative intent only. Runtime services do not consume this table yet.
CREATE TABLE public.module_settings (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  module_id text NOT NULL CHECK (module_id IN ('floor','table-booking')),
  requested_state text NOT NULL CHECK (requested_state IN ('enabled','suspended')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by text NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id,module_id)
);
ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY module_settings_read ON public.module_settings FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.module_settings FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.module_settings TO atacuisine_app;
CREATE TABLE public.module_setting_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  previous_state text,
  requested_state text NOT NULL,
  revision integer NOT NULL,
  actor_id text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.module_setting_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY module_setting_events_read ON public.module_setting_events FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id)
    AND app.org_admin((SELECT organization_id FROM restaurants WHERE id=restaurant_id))
    AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.module_setting_events FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.module_setting_events TO atacuisine_app;
CREATE INDEX module_setting_events_recent ON public.module_setting_events(restaurant_id,created_at DESC,id DESC);
CREATE FUNCTION app.request_module_state(rid text, module text, desired text, expected_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE next_revision integer;
DECLARE old_state text;
BEGIN
  IF current_setting('app.public',true)='true'
     OR NOT app.in_restaurant(rid)
     OR NOT app.org_admin((SELECT organization_id FROM restaurants WHERE id=rid)) THEN
    RAISE EXCEPTION 'Configuration des modules réservée à l’administrateur de l’organisation.';
  END IF;
  IF module NOT IN ('floor','table-booking') OR desired NOT IN ('enabled','suspended')
     OR expected_revision IS NULL OR expected_revision < 0 THEN
    RAISE EXCEPTION 'Configuration de module invalide.';
  END IF;
  IF expected_revision=0 THEN
    INSERT INTO module_settings(restaurant_id,module_id,requested_state,updated_by)
    VALUES(rid,module,desired,app.user_id()) ON CONFLICT DO NOTHING
    RETURNING revision INTO next_revision;
  ELSE
    SELECT requested_state INTO old_state FROM module_settings
    WHERE restaurant_id=rid AND module_id=module AND revision=expected_revision;
    UPDATE module_settings SET requested_state=desired,revision=revision+1,
      updated_by=app.user_id(),updated_at=now()
    WHERE restaurant_id=rid AND module_id=module AND revision=expected_revision
    RETURNING revision INTO next_revision;
  END IF;
  IF next_revision IS NULL THEN
    RAISE EXCEPTION 'Configuration modifiée ailleurs. Rechargez les modules.';
  END IF;
  INSERT INTO module_setting_events(restaurant_id,module_id,previous_state,requested_state,revision,actor_id)
  VALUES(rid,module,old_state,desired,next_revision,app.user_id());
  RETURN next_revision;
END $$;
REVOKE ALL ON FUNCTION app.request_module_state(text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.request_module_state(text,text,text,integer) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(47);
