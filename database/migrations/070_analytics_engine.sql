-- Moteur de mesure d’audience mutualisé, et premier add-on « Tracking & Analytics » : Earth Tracker 3D.
-- Additif. Aucune adresse IP n’est stockée ; les statistiques sont agrégées par zone approximative.
-- Voir docs/platform/EARTH_TRACKER.md.
CREATE TABLE public.analytics_settings (
  restaurant_id text PRIMARY KEY REFERENCES public.restaurants(id),
  collection_enabled boolean NOT NULL DEFAULT false,
  consent_mode text NOT NULL DEFAULT 'consent_required' CHECK (consent_mode IN ('consent_required','exemption_declared')),
  exemption_declared_at timestamptz,
  exemption_declared_by text REFERENCES public.profiles(id),
  geo_precision text NOT NULL DEFAULT 'city' CHECK (geo_precision IN ('country','region','city')),
  retention_days integer NOT NULL DEFAULT 395 CHECK (retention_days BETWEEN 30 AND 790),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  updated_by text REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_exemption_is_recorded CHECK (consent_mode<>'exemption_declared' OR exemption_declared_at IS NOT NULL)
);
-- Sel du jour, jamais lisible par l’application : détruit dès le surlendemain, il rend les empreintes inexploitables.
CREATE TABLE public.analytics_salts (
  day date PRIMARY KEY,
  salt text NOT NULL
);
-- Un seul jour d’empreintes utiles : sert à estimer sessions et visiteurs, puis disparaît.
CREATE TABLE public.analytics_visitors (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  site_host text NOT NULL CHECK (length(site_host) BETWEEN 1 AND 253),
  day date NOT NULL,
  visitor_key text NOT NULL CHECK (length(visitor_key)=64),
  last_seen timestamptz NOT NULL,
  last_path text NOT NULL,
  PRIMARY KEY (restaurant_id,site_host,day,visitor_key)
);
CREATE INDEX analytics_visitors_day ON public.analytics_visitors(day);
CREATE TABLE public.analytics_traffic_hourly (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  site_host text NOT NULL CHECK (length(site_host) BETWEEN 1 AND 253),
  hour timestamptz NOT NULL,
  requests bigint NOT NULL DEFAULT 0,
  filtered bigint NOT NULL DEFAULT 0,
  pageviews bigint NOT NULL DEFAULT 0,
  sessions bigint NOT NULL DEFAULT 0,
  visitors bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id,site_host,hour)
);
CREATE INDEX analytics_traffic_range ON public.analytics_traffic_hourly(restaurant_id,hour);
-- Pays « ZZ » : position inconnue. Les colonnes vides sont '' pour rester dans la clé primaire.
CREATE TABLE public.analytics_geo_daily (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  site_host text NOT NULL CHECK (length(site_host) BETWEEN 1 AND 253),
  day date NOT NULL,
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  region text NOT NULL DEFAULT '' CHECK (length(region)<=64),
  city text NOT NULL DEFAULT '' CHECK (length(city)<=96),
  lat numeric(4,1) CHECK (lat BETWEEN -90 AND 90),
  lng numeric(4,1) CHECK (lng BETWEEN -180 AND 180),
  pageviews bigint NOT NULL DEFAULT 0,
  sessions bigint NOT NULL DEFAULT 0,
  visitors bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id,site_host,day,country,region,city)
);
CREATE INDEX analytics_geo_range ON public.analytics_geo_daily(restaurant_id,day);
CREATE TABLE public.analytics_pages_daily (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  site_host text NOT NULL CHECK (length(site_host) BETWEEN 1 AND 253),
  day date NOT NULL,
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 160),
  pageviews bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id,site_host,day,path)
);
CREATE INDEX analytics_pages_range ON public.analytics_pages_daily(restaurant_id,day);
-- Flux d’activité récente, sans empreinte ni page : une zone et une heure, conservées 48 heures.
-- L’heure sert de curseur : un compteur global révélerait le volume des autres établissements.
CREATE TABLE public.analytics_pulses (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  occurred_at timestamptz NOT NULL,
  site_host text NOT NULL CHECK (length(site_host) BETWEEN 1 AND 253),
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  region text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  lat numeric(4,1),
  lng numeric(4,1),
  PRIMARY KEY (restaurant_id,occurred_at)
);
CREATE INDEX analytics_pulses_age ON public.analytics_pulses(occurred_at);

ALTER TABLE public.analytics_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_salts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_traffic_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_geo_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_pages_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_pulses ENABLE ROW LEVEL SECURITY;

-- Même périmètre que la permission applicative « analytics ».
CREATE FUNCTION app.analytics_reader(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT current_setting('app.public',true) IS DISTINCT FROM 'true' AND app.in_restaurant(rid) AND (
    app.org_admin((SELECT organization_id FROM restaurants WHERE id=rid))
    OR EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.profile_id
      WHERE m.restaurant_id=rid AND m.profile_id=app.user_id() AND p.status='active'
        AND m.role IN ('OWNER','SUPER_ADMIN','MANAGER'))
  )
$$;
REVOKE ALL ON FUNCTION app.analytics_reader(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.analytics_reader(text) TO atacuisine_app;

CREATE POLICY analytics_settings_read ON public.analytics_settings FOR SELECT TO atacuisine_app USING (app.analytics_reader(restaurant_id));
CREATE POLICY analytics_traffic_read ON public.analytics_traffic_hourly FOR SELECT TO atacuisine_app USING (app.analytics_reader(restaurant_id));
CREATE POLICY analytics_geo_read ON public.analytics_geo_daily FOR SELECT TO atacuisine_app USING (app.analytics_reader(restaurant_id));
CREATE POLICY analytics_pages_read ON public.analytics_pages_daily FOR SELECT TO atacuisine_app USING (app.analytics_reader(restaurant_id));
CREATE POLICY analytics_pulses_read ON public.analytics_pulses FOR SELECT TO atacuisine_app USING (app.analytics_reader(restaurant_id));
-- Empreintes : aucune lecture applicative, le moteur y accède par fonction uniquement.
CREATE POLICY analytics_visitors_none ON public.analytics_visitors FOR SELECT TO atacuisine_app USING (false);
CREATE POLICY public_denied ON public.analytics_settings AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public());
CREATE POLICY public_denied ON public.analytics_visitors AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public());
CREATE POLICY public_denied ON public.analytics_traffic_hourly AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public());
CREATE POLICY public_denied ON public.analytics_geo_daily AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public());
CREATE POLICY public_denied ON public.analytics_pages_daily AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public());
CREATE POLICY public_denied ON public.analytics_pulses AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public());
REVOKE ALL ON public.analytics_settings,public.analytics_salts,public.analytics_visitors,public.analytics_traffic_hourly,
  public.analytics_geo_daily,public.analytics_pages_daily,public.analytics_pulses FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.analytics_settings,public.analytics_traffic_hourly,public.analytics_geo_daily,
  public.analytics_pages_daily,public.analytics_pulses TO atacuisine_app;

-- Le module de collecte sert tous les add-ons de mesure : une licence active de ce type suffit.
CREATE FUNCTION app.analytics_licensed(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
    WHERE l.restaurant_id=rid AND p.kind='analytics' AND l.status='active' AND (l.valid_until IS NULL OR l.valid_until>now()))
$$;
CREATE FUNCTION app.analytics_licensed_for(rid text, product text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.analytics_reader(rid) AND EXISTS(SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
    WHERE l.restaurant_id=rid AND l.product_id=product AND p.kind='analytics' AND l.status='active' AND (l.valid_until IS NULL OR l.valid_until>now()))
$$;
-- Seule information accessible au site public : faut-il charger le collecteur, et sous quel régime ?
CREATE FUNCTION app.analytics_public_config(rid text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT s.consent_mode FROM analytics_settings s JOIN restaurants r ON r.id=s.restaurant_id
   WHERE s.restaurant_id=rid AND s.collection_enabled AND r.archived_at IS NULL AND app.analytics_licensed(rid)
$$;
-- Visite d’un membre de l’équipe : jamais comptée.
CREATE FUNCTION app.analytics_is_internal(rid text, profile text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM memberships WHERE restaurant_id=rid AND profile_id=profile)
    OR EXISTS(SELECT 1 FROM organization_memberships m JOIN restaurants r ON r.organization_id=m.organization_id
      WHERE r.id=rid AND m.profile_id=profile AND m.role IN ('OWNER','ADMIN'))
$$;

-- Purge des données éphémères et application des durées de conservation.
CREATE FUNCTION app.analytics_sweep(only_restaurant text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE today date:=(now() AT TIME ZONE 'Europe/Paris')::date; s record;
BEGIN
  DELETE FROM analytics_visitors WHERE day<today-1;
  DELETE FROM analytics_salts WHERE day<today-1;
  DELETE FROM analytics_pulses WHERE occurred_at<now()-interval '48 hours';
  DELETE FROM rate_limits WHERE bucket LIKE 'analytics:%' AND expires_at<now();
  FOR s IN SELECT restaurant_id,retention_days FROM analytics_settings
    WHERE only_restaurant IS NULL OR restaurant_id=only_restaurant LOOP
    DELETE FROM analytics_traffic_hourly WHERE restaurant_id=s.restaurant_id AND hour<now()-make_interval(days=>s.retention_days);
    DELETE FROM analytics_geo_daily WHERE restaurant_id=s.restaurant_id AND day<today-s.retention_days;
    DELETE FROM analytics_pages_daily WHERE restaurant_id=s.restaurant_id AND day<today-s.retention_days;
  END LOOP;
END $$;

-- Requête reçue mais écartée (robot, visite interne, signal de refus…) : comptée, jamais présentée comme visite.
CREATE FUNCTION app.analytics_record_filtered(rid text, site text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF app.analytics_public_config(rid) IS NULL OR NOT app.consume_rate_limit('analytics:r:'||rid,6000,60) THEN RETURN; END IF;
  INSERT INTO analytics_traffic_hourly(restaurant_id,site_host,hour,requests,filtered)
  VALUES(rid,site,date_trunc('hour',now()),1,1)
  ON CONFLICT (restaurant_id,site_host,hour) DO UPDATE
    SET requests=analytics_traffic_hourly.requests+1,filtered=analytics_traffic_hourly.filtered+1;
END $$;

-- Point d’entrée unique du moteur. rid et site viennent du contexte serveur (domaine vérifié), jamais du navigateur.
-- fingerprint est un condensat calculé à la volée ; seul un dérivé salé par jour et par site est conservé.
CREATE FUNCTION app.analytics_ingest(rid text, site text, fingerprint text, page text,
  in_country text, in_region text, in_city text, in_lat numeric, in_lng numeric) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  cfg analytics_settings;
  today date:=(now() AT TIME ZONE 'Europe/Paris')::date;
  day_salt text; visitor text;
  seen analytics_visitors;
  is_new_visitor boolean:=false; is_new_session boolean:=false;
  z_country text:=coalesce(in_country,'ZZ'); z_region text:=coalesce(left(in_region,64),''); z_city text:=coalesce(left(in_city,96),'');
  z_lat numeric:=in_lat; z_lng numeric:=in_lng; grid numeric; final_page text:=page; at_time timestamptz:=clock_timestamp();
BEGIN
  IF app.analytics_public_config(rid) IS NULL THEN RETURN 'disabled'; END IF;
  SELECT * INTO cfg FROM analytics_settings WHERE restaurant_id=rid;
  IF z_country !~ '^[A-Z]{2}$' THEN z_country:='ZZ'; END IF;
  -- La précision choisie par l’établissement s’applique avant tout stockage.
  IF cfg.geo_precision='country' THEN z_region:=''; z_city:=''; z_lat:=NULL; z_lng:=NULL;
  ELSIF cfg.geo_precision='region' THEN z_city:=''; END IF;
  grid:=CASE cfg.geo_precision WHEN 'city' THEN 0.5 ELSE 2 END;
  IF z_lat IS NULL OR z_lng IS NULL OR abs(z_lat)>90 OR abs(z_lng)>180 THEN z_lat:=NULL; z_lng:=NULL;
  ELSE z_lat:=greatest(-90,least(90,round(z_lat/grid)*grid)); z_lng:=greatest(-180,least(180,round(z_lng/grid)*grid)); END IF;

  INSERT INTO analytics_salts(day,salt) VALUES(today,gen_random_uuid()::text||gen_random_uuid()::text) ON CONFLICT (day) DO NOTHING;
  SELECT salt INTO day_salt FROM analytics_salts WHERE day=today;
  visitor:=encode(sha256(convert_to(day_salt||'|'||rid||'|'||site||'|'||fingerprint,'UTF8')),'hex');
  IF NOT app.consume_rate_limit('analytics:v:'||visitor,60,60) OR NOT app.consume_rate_limit('analytics:r:'||rid,6000,60) THEN
    INSERT INTO analytics_traffic_hourly(restaurant_id,site_host,hour,requests,filtered)
    VALUES(rid,site,date_trunc('hour',now()),1,1)
    ON CONFLICT (restaurant_id,site_host,hour) DO UPDATE
      SET requests=analytics_traffic_hourly.requests+1,filtered=analytics_traffic_hourly.filtered+1;
    RETURN 'limited';
  END IF;

  INSERT INTO analytics_visitors(restaurant_id,site_host,day,visitor_key,last_seen,last_path)
  VALUES(rid,site,today,visitor,at_time,page) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    is_new_visitor:=true; is_new_session:=true;
  ELSE
    SELECT * INTO seen FROM analytics_visitors
      WHERE restaurant_id=rid AND site_host=site AND day=today AND visitor_key=visitor FOR UPDATE;
    -- Rechargement ou double envoi : la même page dans les dix secondes ne compte pas deux fois.
    IF seen.last_path=page AND at_time-seen.last_seen<interval '10 seconds' THEN
      INSERT INTO analytics_traffic_hourly(restaurant_id,site_host,hour,requests,filtered)
      VALUES(rid,site,date_trunc('hour',now()),1,1)
      ON CONFLICT (restaurant_id,site_host,hour) DO UPDATE
        SET requests=analytics_traffic_hourly.requests+1,filtered=analytics_traffic_hourly.filtered+1;
      RETURN 'duplicate';
    END IF;
    is_new_session:=at_time-seen.last_seen>interval '30 minutes';
    UPDATE analytics_visitors SET last_seen=at_time,last_path=page
      WHERE restaurant_id=rid AND site_host=site AND day=today AND visitor_key=visitor;
  END IF;

  INSERT INTO analytics_traffic_hourly(restaurant_id,site_host,hour,requests,pageviews,sessions,visitors)
  VALUES(rid,site,date_trunc('hour',now()),1,1,is_new_session::int,is_new_visitor::int)
  ON CONFLICT (restaurant_id,site_host,hour) DO UPDATE SET
    requests=analytics_traffic_hourly.requests+1,pageviews=analytics_traffic_hourly.pageviews+1,
    sessions=analytics_traffic_hourly.sessions+excluded.sessions,visitors=analytics_traffic_hourly.visitors+excluded.visitors;
  INSERT INTO analytics_geo_daily(restaurant_id,site_host,day,country,region,city,lat,lng,pageviews,sessions,visitors)
  VALUES(rid,site,today,z_country,z_region,z_city,z_lat,z_lng,1,is_new_session::int,is_new_visitor::int)
  ON CONFLICT (restaurant_id,site_host,day,country,region,city) DO UPDATE SET
    lat=coalesce(analytics_geo_daily.lat,excluded.lat),lng=coalesce(analytics_geo_daily.lng,excluded.lng),
    pageviews=analytics_geo_daily.pageviews+1,sessions=analytics_geo_daily.sessions+excluded.sessions,
    visitors=analytics_geo_daily.visitors+excluded.visitors;
  -- Plafond par jour : des adresses inventées ne peuvent pas faire grossir la table sans limite.
  IF NOT EXISTS(SELECT 1 FROM analytics_pages_daily WHERE restaurant_id=rid AND site_host=site AND day=today AND path=page)
     AND (SELECT count(*) FROM analytics_pages_daily WHERE restaurant_id=rid AND site_host=site AND day=today)>=200 THEN
    final_page:='(autres)';
  END IF;
  INSERT INTO analytics_pages_daily(restaurant_id,site_host,day,path,pageviews) VALUES(rid,site,today,final_page,1)
  ON CONFLICT (restaurant_id,site_host,day,path) DO UPDATE SET pageviews=analytics_pages_daily.pageviews+1;
  INSERT INTO analytics_pulses(restaurant_id,occurred_at,site_host,country,region,city,lat,lng)
  VALUES(rid,at_time,site,z_country,z_region,z_city,z_lat,z_lng) ON CONFLICT DO NOTHING;
  -- Sans worker (hébergement sans processus dédié), la purge reste garantie par le trafic lui-même.
  IF random()<0.002 THEN PERFORM app.analytics_sweep(); END IF;
  RETURN 'recorded';
END $$;

-- Réglages : même droit que le reste de la boutique. Le passage en exemption est tracé, jamais implicite.
CREATE FUNCTION app.analytics_save_settings(rid text, enabled boolean, mode text, precision_level text, retention integer, expected_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE next_revision integer;
BEGIN
  IF NOT app.addon_store_manager(rid) THEN RAISE EXCEPTION 'Modification refusée pour ce profil.'; END IF;
  IF NOT app.analytics_licensed(rid) THEN RAISE EXCEPTION 'Add-on non acquis : accès refusé pour cet établissement.'; END IF;
  IF expected_revision=0 THEN
    INSERT INTO analytics_settings(restaurant_id,collection_enabled,consent_mode,exemption_declared_at,exemption_declared_by,geo_precision,retention_days,updated_by)
    VALUES(rid,enabled,mode,CASE WHEN mode='exemption_declared' THEN now() END,CASE WHEN mode='exemption_declared' THEN app.user_id() END,precision_level,retention,app.user_id())
    ON CONFLICT DO NOTHING RETURNING revision INTO next_revision;
  ELSE
    UPDATE analytics_settings SET collection_enabled=enabled,
      exemption_declared_at=CASE WHEN mode='exemption_declared' AND consent_mode<>'exemption_declared' THEN now()
        WHEN mode='exemption_declared' THEN exemption_declared_at END,
      exemption_declared_by=CASE WHEN mode='exemption_declared' AND consent_mode<>'exemption_declared' THEN app.user_id()
        WHEN mode='exemption_declared' THEN exemption_declared_by END,
      consent_mode=mode,geo_precision=precision_level,retention_days=retention,
      revision=revision+1,updated_by=app.user_id(),updated_at=now()
    WHERE restaurant_id=rid AND revision=expected_revision RETURNING revision INTO next_revision;
  END IF;
  IF next_revision IS NULL THEN RAISE EXCEPTION 'Configuration modifiée ailleurs. Rechargez la page.'; END IF;
  PERFORM app.analytics_sweep(rid);
  RETURN next_revision;
END $$;

-- Suppression explicite, réservée à l’administrateur : désactiver l’add-on ne l’entraîne jamais.
CREATE FUNCTION app.analytics_purge(rid text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('app.public',true)='true' OR NOT app.in_restaurant(rid)
     OR NOT app.org_admin((SELECT organization_id FROM restaurants WHERE id=rid)) THEN
    RAISE EXCEPTION 'Suppression réservée à l’administrateur de l’organisation : accès refusé.';
  END IF;
  DELETE FROM analytics_visitors WHERE restaurant_id=rid;
  DELETE FROM analytics_traffic_hourly WHERE restaurant_id=rid;
  DELETE FROM analytics_geo_daily WHERE restaurant_id=rid;
  DELETE FROM analytics_pages_daily WHERE restaurant_id=rid;
  DELETE FROM analytics_pulses WHERE restaurant_id=rid;
END $$;

REVOKE ALL ON FUNCTION app.analytics_licensed(text),app.analytics_licensed_for(text,text),app.analytics_public_config(text),
  app.analytics_is_internal(text,text),app.analytics_sweep(text),app.analytics_record_filtered(text,text),
  app.analytics_ingest(text,text,text,text,text,text,text,numeric,numeric),
  app.analytics_save_settings(text,boolean,text,text,integer,integer),app.analytics_purge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.analytics_licensed(text),app.analytics_licensed_for(text,text),app.analytics_public_config(text),
  app.analytics_is_internal(text,text),app.analytics_record_filtered(text,text),
  app.analytics_ingest(text,text,text,text,text,text,text,numeric,numeric),
  app.analytics_save_settings(text,boolean,text,text,integer,integer),app.analytics_purge(text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.analytics_sweep(text) TO atacuisine_worker;

-- L’administration de la plateforme compte aussi les collectes actives.
CREATE OR REPLACE FUNCTION app.addon_admin_stats()
RETURNS TABLE(product_id text, installations integer, active_uses integer, sales integer, refunds integer, revenue_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM app.addon_admin_guard();
  RETURN QUERY SELECT p.id,
    (SELECT count(*)::int FROM addon_licenses l WHERE l.product_id=p.id AND l.status='active'),
    CASE WHEN p.kind='analytics'
      THEN (SELECT count(*)::int FROM analytics_settings s JOIN addon_licenses l ON l.restaurant_id=s.restaurant_id
              WHERE l.product_id=p.id AND l.status='active' AND s.collection_enabled)
      ELSE (SELECT count(*)::int FROM loading_screen_settings s WHERE s.product_id=p.id AND s.enabled) END,
    (SELECT count(*)::int FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('paid','disputed')),
    (SELECT count(*)::int FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('refunded','dispute_lost','duplicate')),
    (SELECT coalesce(sum(greatest(o.amount_cents-o.refunded_cents,0)),0)::bigint FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('paid','disputed'))
  FROM addon_products p ORDER BY p.position,p.id;
END $$;

INSERT INTO public.addon_categories(id,name,description,position) VALUES
  ('tracking-analytics','Tracking & Analytics','Observez et analysez l’activité de votre établissement à partir de mesures réelles.',20);
-- Pas de tarif définitif pour l’instant : modèle générique de la boutique, modifiable depuis /platform/boutique.
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('earth-tracker-3d','tracking-analytics','analytics','earth-tracker','Earth Tracker 3D','Visualisez l’origine géographique des visites de votre site sur un globe terrestre 3D interactif.','free',0,1);
INSERT INTO schema_versions(version) VALUES(70);
