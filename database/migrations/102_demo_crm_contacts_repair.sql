-- L'ancienne base de démonstration peut avoir appliqué 094 avant l'ajout des contacts CRM.
CREATE TABLE IF NOT EXISTS public.crm_contacts (
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
CREATE INDEX IF NOT EXISTS crm_contacts_restaurant ON public.crm_contacts(restaurant_id,company_id,updated_at DESC);
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_contacts' AND policyname='pilotage_scope'
  ) THEN
    CREATE POLICY pilotage_scope ON public.crm_contacts FOR ALL TO atacuisine_app
      USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
      WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
  END IF;
END $$;
REVOKE ALL ON public.crm_contacts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.crm_contacts TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(102);
