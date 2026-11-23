-- Réglage interne au module Pipeline CRM : relance après envoi d'une proposition.
CREATE TABLE public.crm_automation_settings (
  restaurant_id text PRIMARY KEY REFERENCES public.restaurants(id),
  proposal_followup_enabled boolean NOT NULL DEFAULT false,
  proposal_followup_days integer NOT NULL DEFAULT 3 CHECK (proposal_followup_days BETWEEN 1 AND 30),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_automation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_automation_scope ON public.crm_automation_settings FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.crm_automation_settings FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.crm_automation_settings TO atacuisine_app;
ALTER TABLE public.crm_activities ADD COLUMN automation_key text;
CREATE UNIQUE INDEX crm_activities_automation_key ON public.crm_activities(restaurant_id,automation_key) WHERE automation_key IS NOT NULL;
INSERT INTO schema_versions(version) VALUES(148);
