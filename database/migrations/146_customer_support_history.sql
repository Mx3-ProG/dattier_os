-- Historique append-only des dossiers SAV.
ALTER TABLE public.customer_support_cases ADD CONSTRAINT customer_support_cases_tenant_id UNIQUE (restaurant_id,id);
CREATE TABLE public.customer_support_events (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL,
  case_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('created','status','assignment','note')),
  detail text NOT NULL CHECK (length(detail) BETWEEN 1 AND 5000),
  actor_id text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id,case_id) REFERENCES public.customer_support_cases(restaurant_id,id) ON DELETE CASCADE
);
CREATE INDEX customer_support_events_case ON public.customer_support_events(restaurant_id,case_id,created_at DESC);
ALTER TABLE public.customer_support_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_event_scope ON public.customer_support_events FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.customer_support_events FROM PUBLIC;
GRANT SELECT,INSERT ON public.customer_support_events TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(146);
