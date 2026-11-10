-- Données de prospection et de vente strictement séparées par établissement.
CREATE TABLE public.crm_companies (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
  siret text,
  activity text,
  address text,
  city text,
  phone text,
  email text,
  website text,
  source text NOT NULL DEFAULT 'manual',
  score integer CHECK(score BETWEEN 0 AND 100),
  score_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect','qualified','customer','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id,id)
);
CREATE UNIQUE INDEX crm_companies_siret ON public.crm_companies(restaurant_id,siret) WHERE siret IS NOT NULL;
CREATE INDEX crm_companies_restaurant ON public.crm_companies(restaurant_id,updated_at DESC);

CREATE TABLE public.crm_contacts (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  company_id text NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
  role text,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id,company_id) REFERENCES public.crm_companies(restaurant_id,id)
);
CREATE INDEX crm_contacts_restaurant ON public.crm_contacts(restaurant_id,company_id,updated_at DESC);

CREATE TABLE public.crm_opportunities (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  company_id text NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
  stage text NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead','qualified','proposal','negotiation','won','lost')),
  amount_cents integer NOT NULL DEFAULT 0 CHECK(amount_cents>=0),
  expected_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id,id),
  FOREIGN KEY (restaurant_id,company_id) REFERENCES public.crm_companies(restaurant_id,id)
);
CREATE INDEX crm_opportunities_restaurant ON public.crm_opportunities(restaurant_id,stage,updated_at DESC);

CREATE TABLE public.crm_activities (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  opportunity_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('task','call','email','note','meeting')),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
  due_at timestamptz,
  done_at timestamptz,
  created_by text REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id,opportunity_id) REFERENCES public.crm_opportunities(restaurant_id,id)
);
CREATE INDEX crm_activities_restaurant ON public.crm_activities(restaurant_id,opportunity_id,created_at DESC);

CREATE TABLE public.prospect_scans (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  city text NOT NULL CHECK(length(city) BETWEEN 1 AND 120),
  sector text NOT NULL CHECK(length(sector) BETWEEN 1 AND 120),
  radius_km integer NOT NULL CHECK(radius_km BETWEEN 1 AND 50),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','geocoding','discovering','completed','partial','failed')),
  latitude double precision,
  longitude double precision,
  naf_codes text[] NOT NULL DEFAULT '{}',
  page integer NOT NULL DEFAULT 1,
  total_pages integer NOT NULL DEFAULT 1,
  found_count integer NOT NULL DEFAULT 0,
  error_message text,
  sources jsonb NOT NULL DEFAULT '{"geo_api":"pending","sirene":"pending"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id,id)
);
CREATE INDEX prospect_scans_restaurant ON public.prospect_scans(restaurant_id,created_at DESC);

CREATE TABLE public.scanner_prospects (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  scan_id text NOT NULL,
  name text NOT NULL,
  siret text,
  siren text,
  activity text,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  phone text,
  email text,
  website text,
  score integer NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100),
  score_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','review','qualified','accepted','refused')),
  refusal_reason text,
  crm_company_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id,scan_id) REFERENCES public.prospect_scans(restaurant_id,id),
  FOREIGN KEY (restaurant_id,crm_company_id) REFERENCES public.crm_companies(restaurant_id,id)
);
CREATE UNIQUE INDEX scanner_prospects_siret ON public.scanner_prospects(restaurant_id,siret) WHERE siret IS NOT NULL;
CREATE INDEX scanner_prospects_restaurant ON public.scanner_prospects(restaurant_id,scan_id,updated_at DESC);

DO $$ DECLARE tab text; addon text; BEGIN
  FOREACH tab IN ARRAY ARRAY['crm_companies','crm_contacts','crm_opportunities','crm_activities','prospect_scans','scanner_prospects'] LOOP
    addon := CASE WHEN tab LIKE 'crm_%' THEN 'pipeline-crm' ELSE 'prospect-scanner' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY pilotage_scope ON public.%I FOR ALL TO atacuisine_app USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,%L) AND current_setting(''app.public'',true) IS DISTINCT FROM ''true'') WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,%L) AND current_setting(''app.public'',true) IS DISTINCT FROM ''true'')',tab,addon,addon);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',tab);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO atacuisine_app',tab);
  END LOOP;
END $$;
INSERT INTO schema_versions(version) VALUES(94);
