-- Dossiers SAV rattachés au commerce, au client et éventuellement à une commande.
CREATE UNIQUE INDEX IF NOT EXISTS orders_restaurant_id_id ON public.orders(restaurant_id,id);
CREATE TABLE public.customer_support_cases (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  customer_id text NOT NULL,
  order_id text,
  category text NOT NULL CHECK (category IN ('question','return','exchange','warranty')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 180),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  resolution text NOT NULL DEFAULT '' CHECK (length(resolution)<=5000),
  assigned_to text REFERENCES public.profiles(id),
  created_by text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id,customer_id) REFERENCES public.customers(restaurant_id,id),
  FOREIGN KEY (restaurant_id,order_id) REFERENCES public.orders(restaurant_id,id)
);
CREATE INDEX customer_support_cases_restaurant ON public.customer_support_cases(restaurant_id,status,updated_at DESC);
CREATE INDEX customer_support_cases_customer ON public.customer_support_cases(restaurant_id,customer_id,created_at DESC);
CREATE FUNCTION app.customer_support_order_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shop_orders s JOIN public.orders o ON o.id=s.order_id
    WHERE o.restaurant_id=NEW.restaurant_id AND s.order_id=NEW.order_id AND s.customer_id=NEW.customer_id
  ) THEN RAISE EXCEPTION 'Commande non liée à ce client dans cet établissement.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_support_order_guard BEFORE INSERT OR UPDATE OF order_id,customer_id
ON public.customer_support_cases FOR EACH ROW EXECUTE FUNCTION app.customer_support_order_guard();
ALTER TABLE public.customer_support_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_scope ON public.customer_support_cases FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.customer_support_cases FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.customer_support_cases TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(145);
