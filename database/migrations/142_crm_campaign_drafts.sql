-- Brouillons de campagnes liés aux segments calculés ; aucun envoi automatique.
CREATE TABLE public.crm_campaigns (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  segment text NOT NULL CHECK (segment IN ('new','active','loyal','dormant')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 150),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'draft' CHECK (status='draft'),
  created_by text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_campaigns_restaurant ON public.crm_campaigns(restaurant_id,updated_at DESC);
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_campaign_scope ON public.crm_campaigns FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.crm_campaigns FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.crm_campaigns TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(142);
