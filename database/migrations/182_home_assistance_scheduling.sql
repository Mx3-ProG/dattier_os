-- Configuration spécifique des prestations à domicile. Les factures restent dans fin_invoices.
CREATE TABLE public.home_services (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 200),
  hourly_cents integer NOT NULL CHECK(hourly_cents BETWEEN 0 AND 1000000),
  minimum_minutes integer NOT NULL DEFAULT 60 CHECK(minimum_minutes BETWEEN 15 AND 1440),
  travel_cents integer NOT NULL DEFAULT 0 CHECK(travel_cents BETWEEN 0 AND 100000),
  required_skills text[] NOT NULL DEFAULT '{}',
  compliance_required boolean NOT NULL DEFAULT false,
  compliance_verified_at timestamptz,
  compliance_evidence text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  UNIQUE(id,restaurant_id)
);
CREATE TABLE public.home_worker_availability (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  worker_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  available boolean NOT NULL DEFAULT true,
  CHECK(ends_at>starts_at),
  FOREIGN KEY(worker_id,restaurant_id) REFERENCES home_workers(id,restaurant_id)
);
CREATE INDEX home_worker_availability_lookup ON home_worker_availability(restaurant_id,worker_id,starts_at,ends_at);
ALTER TABLE home_visits ADD COLUMN service_id text,
  ADD COLUMN hourly_cents integer CHECK(hourly_cents>=0),
  ADD COLUMN travel_cents integer CHECK(travel_cents>=0),
  ADD COLUMN recurrence_id text,
  ADD COLUMN invoice_id text REFERENCES fin_invoices(id),
  ADD COLUMN billable_cents integer CHECK(billable_cents>=0),
  ADD CONSTRAINT home_visits_service_scope FOREIGN KEY(service_id,restaurant_id) REFERENCES home_services(id,restaurant_id);
CREATE UNIQUE INDEX home_visits_invoice_unique ON home_visits(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX home_visits_unbilled ON home_visits(restaurant_id,ends_at) WHERE status='completed' AND validated_minutes IS NOT NULL AND invoice_id IS NULL;
CREATE FUNCTION app.home_visit_price_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.service_id IS DISTINCT FROM OLD.service_id OR NEW.hourly_cents IS DISTINCT FROM OLD.hourly_cents
    OR NEW.travel_cents IS DISTINCT FROM OLD.travel_cents OR (OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id)) THEN
    RAISE EXCEPTION 'Tarif figé ou facture déjà liée.';
  END IF;
  IF NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fin_invoices i WHERE i.id=NEW.invoice_id AND i.restaurant_id=NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Facture hors établissement.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER home_visit_price_guard BEFORE UPDATE ON home_visits FOR EACH ROW EXECUTE FUNCTION app.home_visit_price_guard();

ALTER TABLE home_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_worker_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_services_staff ON home_services TO atacuisine_app
  USING(app.not_public() AND app.in_restaurant(restaurant_id))
  WITH CHECK(app.not_public() AND app.in_restaurant(restaurant_id) AND EXISTS(
    SELECT 1 FROM memberships m WHERE m.restaurant_id=home_services.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER')));
CREATE POLICY home_availability_staff ON home_worker_availability TO atacuisine_app
  USING(app.not_public() AND app.in_restaurant(restaurant_id) AND EXISTS(
    SELECT 1 FROM home_workers w WHERE w.id=home_worker_availability.worker_id AND w.restaurant_id=home_worker_availability.restaurant_id AND
      (w.profile_id=app.user_id() OR EXISTS(SELECT 1 FROM memberships m WHERE m.restaurant_id=w.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER')))))
  WITH CHECK(app.not_public() AND app.in_restaurant(restaurant_id) AND EXISTS(
    SELECT 1 FROM home_workers w WHERE w.id=home_worker_availability.worker_id AND w.restaurant_id=home_worker_availability.restaurant_id AND
      (w.profile_id=app.user_id() OR EXISTS(SELECT 1 FROM memberships m WHERE m.restaurant_id=w.restaurant_id AND m.profile_id=app.user_id() AND m.role IN ('OWNER','MANAGER')))));
REVOKE ALL ON home_services,home_worker_availability FROM PUBLIC,atacuisine_app;
GRANT SELECT,INSERT,UPDATE ON home_services,home_worker_availability TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(182) ON CONFLICT DO NOTHING;
