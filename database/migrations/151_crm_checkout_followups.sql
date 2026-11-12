-- Suivi humain des paiements non finalisés dans le module CRM.
CREATE TABLE public.crm_checkout_followups (
  restaurant_id text NOT NULL,
  order_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('reviewed','contacted')),
  channel text CHECK (channel IN ('email','phone','other')),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=1000),
  actor_id text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id,order_id),
  FOREIGN KEY (restaurant_id,order_id) REFERENCES public.orders(restaurant_id,id) ON DELETE CASCADE,
  CHECK (status<>'contacted' OR channel IS NOT NULL)
);
CREATE INDEX crm_checkout_followups_recent ON public.crm_checkout_followups(restaurant_id,updated_at DESC);
ALTER TABLE public.crm_checkout_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_checkout_followups_scope ON public.crm_checkout_followups FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.crm_checkout_followups FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.crm_checkout_followups TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(151);
