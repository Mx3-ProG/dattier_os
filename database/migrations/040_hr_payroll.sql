-- Couche RH au-dessus du pointage existant : corrections tracées, contrats, absences,
-- préparation des variables de paie. Aucun bulletin ni déclaration sociale n’est produit.
-- Retour arrière (préproduction uniquement) : down/040_hr_payroll.sql.

-- Un pointage n’est jamais effacé : il est annulé, ou complété par une correction tracée.
ALTER TABLE time_entries
  ADD COLUMN source text NOT NULL DEFAULT 'clock' CHECK (source IN ('clock','correction')),
  ADD COLUMN corrected_by text,
  ADD COLUMN reason text,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by text,
  ADD COLUMN void_reason text;
CREATE INDEX time_entries_scope ON time_entries(restaurant_id,profile_id,created_at);

-- Rôles qui gèrent l’équipe, et rôles qui voient les rémunérations (app.fin_access).
CREATE FUNCTION app.hr_access(rid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.fin_access(rid) OR (app.fin_member(rid) AND EXISTS(
    SELECT 1 FROM memberships m WHERE m.restaurant_id=rid AND m.profile_id=app.user_id() AND m.role='MANAGER')) $$;

CREATE TABLE hr_settings (
  restaurant_id text PRIMARY KEY REFERENCES restaurants ON DELETE CASCADE,
  -- Valeurs proposées d’après la convention HCR : à confirmer par l’établissement.
  base_minutes integer NOT NULL DEFAULT 2100 CHECK (base_minutes>0),
  band1_until integer NOT NULL DEFAULT 2340,
  band2_until integer NOT NULL DEFAULT 2580,
  band1_rate_bp integer NOT NULL DEFAULT 1000 CHECK (band1_rate_bp>=0),
  band2_rate_bp integer NOT NULL DEFAULT 2000 CHECK (band2_rate_bp>=0),
  band3_rate_bp integer NOT NULL DEFAULT 5000 CHECK (band3_rate_bp>=0),
  -- Charges patronales estimées. NULL : le coût affiché reste du brut hors charges.
  employer_rate_bp integer CHECK (employer_rate_bp BETWEEN 0 AND 20000),
  rules_confirmed boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (base_minutes<band1_until AND band1_until<band2_until)
);
CREATE TABLE hr_contracts (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  profile_id text NOT NULL REFERENCES profiles,
  kind text NOT NULL CHECK (kind IN ('cdi','cdd','extra','apprentice','other')),
  weekly_minutes integer NOT NULL CHECK (weekly_minutes BETWEEN 0 AND 4800),
  hourly_rate integer NOT NULL CHECK (hourly_rate>=0),
  starts_on date NOT NULL,
  ends_on date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on>=starts_on)
);
CREATE INDEX hr_contracts_scope ON hr_contracts(restaurant_id,profile_id,starts_on);
CREATE TABLE hr_absences (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  profile_id text NOT NULL REFERENCES profiles,
  kind text NOT NULL CHECK (kind IN ('paid_leave','sick','unpaid','family','other')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('requested','approved','rejected','cancelled')),
  created_by text,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on>=starts_on)
);
CREATE INDEX hr_absences_scope ON hr_absences(restaurant_id,starts_on,ends_on);
CREATE TABLE hr_payroll_periods (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','reopened')),
  -- Variables figées à la clôture : l’export reste identique si le pointage change ensuite.
  variables jsonb NOT NULL,
  closed_by text,
  closed_at timestamptz NOT NULL DEFAULT now(),
  reopened_by text,
  reopen_reason text,
  UNIQUE (restaurant_id, month)
);

ALTER TABLE hr_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_read ON hr_settings FOR SELECT USING (app.hr_access(restaurant_id));
CREATE POLICY hr_write ON hr_settings FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY hr_update ON hr_settings FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
-- Rémunérations : mêmes rôles que les finances, pas les managers.
CREATE POLICY hr_read ON hr_contracts FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY hr_write ON hr_contracts FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY hr_update ON hr_contracts FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY hr_read ON hr_absences FOR SELECT USING (app.hr_access(restaurant_id));
CREATE POLICY hr_write ON hr_absences FOR INSERT WITH CHECK (app.hr_access(restaurant_id));
CREATE POLICY hr_update ON hr_absences FOR UPDATE USING (app.hr_access(restaurant_id)) WITH CHECK (app.hr_access(restaurant_id));
CREATE POLICY hr_read ON hr_payroll_periods FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY hr_write ON hr_payroll_periods FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY hr_update ON hr_payroll_periods FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
GRANT SELECT,INSERT,UPDATE ON hr_settings,hr_contracts,hr_absences,hr_payroll_periods TO atacuisine_app;
REVOKE ALL ON FUNCTION app.hr_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.hr_access(text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES (40);
