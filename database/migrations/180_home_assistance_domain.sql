-- Données métier isolées : aucun dossier de bénéficiaire dans trade_records.
CREATE TABLE public.home_beneficiaries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  customer_id text NOT NULL REFERENCES public.customers(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 200),
  address text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE(id,restaurant_id)
);
CREATE FUNCTION app.home_beneficiary_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers c WHERE c.id=NEW.customer_id AND c.restaurant_id=NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Client hors établissement.';
  END IF;
  IF (SELECT industry FROM restaurants WHERE id=NEW.restaurant_id)<>'home_assistance' THEN
    RAISE EXCEPTION 'Secteur aide à la personne requis.';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.restaurant_id<>OLD.restaurant_id OR NEW.customer_id<>OLD.customer_id) THEN
    RAISE EXCEPTION 'Dossier non transférable.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER home_beneficiary_guard BEFORE INSERT OR UPDATE ON public.home_beneficiaries FOR EACH ROW EXECUTE FUNCTION app.home_beneficiary_guard();
CREATE TABLE public.home_relative_grants (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  beneficiary_id text NOT NULL,
  profile_id text NOT NULL REFERENCES public.profiles(id),
  granted_by text NOT NULL REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (beneficiary_id,restaurant_id) REFERENCES public.home_beneficiaries(id,restaurant_id)
);
CREATE UNIQUE INDEX home_relative_grant_active ON public.home_relative_grants(beneficiary_id,profile_id) WHERE revoked_at IS NULL;
CREATE TABLE public.home_workers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  profile_id text NOT NULL REFERENCES public.profiles(id),
  skills text[] NOT NULL DEFAULT '{}',
  service_area text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  UNIQUE(id,restaurant_id), UNIQUE(restaurant_id,profile_id)
);
CREATE TABLE public.home_visits (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  beneficiary_id text NOT NULL,
  worker_id text,
  service_name text NOT NULL CHECK (length(trim(service_name)) BETWEEN 2 AND 200),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','in_progress','completed','cancelled')),
  price_cents integer NOT NULL CHECK (price_cents>=0),
  declared_minutes integer CHECK (declared_minutes BETWEEN 0 AND 1440),
  validated_minutes integer CHECK (validated_minutes BETWEEN 0 AND 1440),
  report text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at),
  FOREIGN KEY (beneficiary_id,restaurant_id) REFERENCES public.home_beneficiaries(id,restaurant_id),
  FOREIGN KEY (worker_id,restaurant_id) REFERENCES public.home_workers(id,restaurant_id)
);
CREATE INDEX home_visits_worker_time ON public.home_visits(restaurant_id,worker_id,starts_at,ends_at) WHERE status NOT IN ('cancelled','completed');
CREATE INDEX home_visits_beneficiary ON public.home_visits(restaurant_id,beneficiary_id,starts_at DESC);

-- Revalidation atomique de l'affectation, y compris les accès concurrents.
CREATE FUNCTION app.home_visit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.restaurant_id<>OLD.restaurant_id OR NEW.beneficiary_id<>OLD.beneficiary_id
    OR NEW.price_cents<>OLD.price_cents) THEN
    RAISE EXCEPTION 'Visite non transférable ; prix figé.';
  END IF;
  IF (SELECT industry FROM public.restaurants WHERE id=NEW.restaurant_id) <> 'home_assistance' THEN
    RAISE EXCEPTION 'Secteur aide à la personne requis.';
  END IF;
  IF NEW.worker_id IS NOT NULL AND NEW.status NOT IN ('cancelled','completed') THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.restaurant_id || ':' || NEW.worker_id));
    IF NOT EXISTS (SELECT 1 FROM public.home_workers w WHERE w.id=NEW.worker_id AND w.restaurant_id=NEW.restaurant_id AND w.active) THEN
      RAISE EXCEPTION 'Intervenant indisponible.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.home_visits v WHERE v.restaurant_id=NEW.restaurant_id AND v.worker_id=NEW.worker_id
      AND v.id<>NEW.id AND v.status NOT IN ('cancelled','completed')
      AND v.starts_at<NEW.ends_at + interval '30 minutes' AND NEW.starts_at<v.ends_at + interval '30 minutes') THEN
      RAISE EXCEPTION 'Intervenant déjà affecté à ce créneau.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER home_visit_guard BEFORE INSERT OR UPDATE ON public.home_visits
  FOR EACH ROW EXECUTE FUNCTION app.home_visit_guard();

-- La consultation d'un proche est limitée au dossier explicitement autorisé.
CREATE FUNCTION app.home_can_view_beneficiary(bid text, rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT (app.in_restaurant(rid) AND (app.org_admin((SELECT organization_id FROM restaurants WHERE id=rid))
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.restaurant_id=rid AND m.profile_id=app.user_id()
      AND m.role IN ('OWNER','MANAGER','ACCOUNTANT')))) OR EXISTS (
    SELECT 1 FROM home_beneficiaries b JOIN customers c ON c.id=b.customer_id AND c.restaurant_id=b.restaurant_id
    JOIN organization_customers oc ON oc.id=c.account_id
    WHERE b.id=bid AND b.restaurant_id=rid AND b.archived_at IS NULL AND oc.subject=app.user_id()
      AND current_setting('app.public',true) IS DISTINCT FROM 'true') OR EXISTS (
    SELECT 1 FROM home_relative_grants g JOIN home_beneficiaries b ON b.id=g.beneficiary_id AND b.restaurant_id=g.restaurant_id
    WHERE g.beneficiary_id=bid AND g.restaurant_id=rid AND g.profile_id=app.user_id()
      AND g.revoked_at IS NULL AND b.archived_at IS NULL
      AND current_setting('app.public',true) IS DISTINCT FROM 'true')
$$;
REVOKE ALL ON FUNCTION app.home_can_view_beneficiary(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.home_can_view_beneficiary(text,text) TO atacuisine_app;

ALTER TABLE public.home_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_relative_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_beneficiaries_staff ON public.home_beneficiaries TO atacuisine_app
  USING (app.not_public() AND app.home_can_view_beneficiary(id,restaurant_id))
  WITH CHECK (app.not_public() AND app.in_restaurant(restaurant_id) AND EXISTS (SELECT 1 FROM memberships m WHERE m.restaurant_id=home_beneficiaries.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER')));
CREATE POLICY home_grants_staff ON public.home_relative_grants TO atacuisine_app
  USING (app.not_public() AND app.in_restaurant(restaurant_id) AND app.home_can_view_beneficiary(beneficiary_id,restaurant_id))
  WITH CHECK (app.not_public() AND app.in_restaurant(restaurant_id) AND EXISTS (SELECT 1 FROM memberships m WHERE m.restaurant_id=home_relative_grants.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER')));
CREATE POLICY home_workers_staff ON public.home_workers TO atacuisine_app
  USING (app.not_public() AND app.in_restaurant(restaurant_id) AND (profile_id=app.user_id() OR EXISTS (SELECT 1 FROM memberships m WHERE m.restaurant_id=home_workers.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER'))))
  WITH CHECK (app.not_public() AND app.in_restaurant(restaurant_id) AND EXISTS (SELECT 1 FROM memberships m WHERE m.restaurant_id=home_workers.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER')));
CREATE POLICY home_visits_staff ON public.home_visits TO atacuisine_app
  USING (app.not_public() AND ((app.in_restaurant(restaurant_id) AND
    (EXISTS (SELECT 1 FROM memberships m WHERE m.restaurant_id=home_visits.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER','ACCOUNTANT'))
     OR EXISTS (SELECT 1 FROM home_workers w WHERE w.id=home_visits.worker_id AND w.restaurant_id=home_visits.restaurant_id AND w.profile_id=app.user_id())))
    OR app.home_can_view_beneficiary(beneficiary_id,restaurant_id)))
  WITH CHECK (app.not_public() AND app.in_restaurant(restaurant_id) AND EXISTS
    (SELECT 1 FROM memberships m WHERE m.restaurant_id=home_visits.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER','ACCOUNTANT')));
REVOKE ALL ON public.home_beneficiaries,public.home_relative_grants,public.home_workers,public.home_visits FROM PUBLIC,atacuisine_app;
GRANT SELECT,INSERT,UPDATE ON public.home_beneficiaries,public.home_relative_grants,public.home_workers,public.home_visits TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(180) ON CONFLICT DO NOTHING;
