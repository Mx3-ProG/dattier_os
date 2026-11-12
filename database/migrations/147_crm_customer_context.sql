-- Contexte interne des fiches clients, indépendant des commandes et des campagnes.
CREATE TABLE public.crm_customer_notes (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL,
  customer_id text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  author_id text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id,customer_id) REFERENCES public.customers(restaurant_id,id) ON DELETE CASCADE
);
CREATE INDEX crm_customer_notes_customer ON public.crm_customer_notes(restaurant_id,customer_id,created_at DESC);
CREATE TABLE public.crm_customer_tags (
  restaurant_id text NOT NULL,
  customer_id text NOT NULL,
  tag text NOT NULL CHECK (length(tag) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id,customer_id,tag),
  FOREIGN KEY (restaurant_id,customer_id) REFERENCES public.customers(restaurant_id,id) ON DELETE CASCADE
);
CREATE INDEX crm_customer_tags_tag ON public.crm_customer_tags(restaurant_id,tag);
ALTER TABLE public.crm_customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_customer_notes_scope ON public.crm_customer_notes FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
CREATE POLICY crm_customer_tags_scope ON public.crm_customer_tags FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.crm_customer_notes,public.crm_customer_tags FROM PUBLIC;
GRANT SELECT,INSERT ON public.crm_customer_notes TO atacuisine_app;
GRANT SELECT,INSERT,DELETE ON public.crm_customer_tags TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(147);
