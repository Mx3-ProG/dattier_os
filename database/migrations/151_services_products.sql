-- Services et Produits (Gestion) : le gérant crée ses prestations et ses produits, et choisit
-- lesquels apparaissent sur son site internet. Compris dans Studio, pour tous les secteurs.
--
-- Le stock reste facultatif : un produit peut ne pas être suivi, suivre sa propre quantité,
-- ou être relié à un article de « Stocks & inventaire ». Un service n'a pas de stock.
-- Idempotent : plusieurs sessions de développement partagent la même base de démonstration.

CREATE TABLE IF NOT EXISTS public.business_services (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  category text NOT NULL DEFAULT '' CHECK (length(category)<=80),
  summary text NOT NULL DEFAULT '' CHECK (length(summary)<=280),
  description text NOT NULL DEFAULT '' CHECK (length(description)<=5000),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
  buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 240),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  price_from boolean NOT NULL DEFAULT false,
  vat_rate numeric(4,2) NOT NULL DEFAULT 20 CHECK (vat_rate IN (0,2.1,5.5,10,20)),
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 500),
  location text NOT NULL DEFAULT 'on_site' CHECK (location IN ('on_site','at_customer','online')),
  -- Créneaux hebdomadaires : [{"day":1,"start":"09:00","end":"18:00"}, …] (0 = dimanche).
  availability jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(availability)='array'),
  notice_hours integer NOT NULL DEFAULT 0 CHECK (notice_hours BETWEEN 0 AND 2160),
  images jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images)='array' AND jsonb_array_length(images)<=8),
  published boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_by text REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_services_restaurant ON public.business_services(restaurant_id,archived_at,position);

CREATE TABLE IF NOT EXISTS public.business_products (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  category text NOT NULL DEFAULT '' CHECK (length(category)<=80),
  sku text NOT NULL DEFAULT '' CHECK (length(sku)<=64),
  summary text NOT NULL DEFAULT '' CHECK (length(summary)<=280),
  description text NOT NULL DEFAULT '' CHECK (length(description)<=5000),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  compare_at_cents integer CHECK (compare_at_cents IS NULL OR compare_at_cents BETWEEN 0 AND 100000000),
  vat_rate numeric(4,2) NOT NULL DEFAULT 20 CHECK (vat_rate IN (0,2.1,5.5,10,20)),
  images jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images)='array' AND jsonb_array_length(images)<=8),
  delivery_modes text[] NOT NULL DEFAULT ARRAY['pickup']::text[]
    CHECK (delivery_modes <@ ARRAY['pickup','local_delivery','shipping']::text[]),
  delivery_min_days integer NOT NULL DEFAULT 0 CHECK (delivery_min_days BETWEEN 0 AND 365),
  delivery_max_days integer NOT NULL DEFAULT 0 CHECK (delivery_max_days BETWEEN 0 AND 365),
  shipping_fee_cents integer NOT NULL DEFAULT 0 CHECK (shipping_fee_cents BETWEEN 0 AND 10000000),
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams BETWEEN 0 AND 10000000),
  stock_mode text NOT NULL DEFAULT 'none' CHECK (stock_mode IN ('none','own','linked')),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity BETWEEN 0 AND 10000000),
  stock_threshold integer NOT NULL DEFAULT 0 CHECK (stock_threshold BETWEEN 0 AND 10000000),
  stock_ingredient_id text REFERENCES public.ingredients(id),
  published boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_by text REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (delivery_max_days>=delivery_min_days),
  CHECK ((stock_mode='linked')=(stock_ingredient_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS business_products_restaurant ON public.business_products(restaurant_id,archived_at,position);

-- Un article de stock relié appartient au même établissement.
CREATE OR REPLACE FUNCTION app.check_product_stock_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.stock_ingredient_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ingredients i WHERE i.id=NEW.stock_ingredient_id AND i.restaurant_id=NEW.restaurant_id
  ) THEN
    RAISE EXCEPTION 'Article de stock inconnu pour cet établissement.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS business_product_stock_link ON public.business_products;
CREATE TRIGGER business_product_stock_link BEFORE INSERT OR UPDATE OF stock_ingredient_id,restaurant_id
  ON public.business_products FOR EACH ROW EXECUTE FUNCTION app.check_product_stock_link();

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['business_services','business_products'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('DROP POLICY IF EXISTS offers_scope ON public.%I',tab);
    -- Le canal public ne lit jamais ces tables directement : il passe par app.public_offers.
    EXECUTE format('CREATE POLICY offers_scope ON public.%I FOR ALL TO atacuisine_app USING (app.in_restaurant(restaurant_id) AND current_setting(''app.public'',true) IS DISTINCT FROM ''true'') WITH CHECK (app.in_restaurant(restaurant_id) AND current_setting(''app.public'',true) IS DISTINCT FROM ''true'')',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',tab);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO atacuisine_app',tab);
  END LOOP;
END $$;

-- Disponibilité publique d'un produit : jamais la quantité exacte, seulement un état.
CREATE OR REPLACE FUNCTION app.product_availability(p public.business_products) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE p.stock_mode
    WHEN 'none' THEN 'available'
    WHEN 'own' THEN CASE WHEN p.stock_quantity<=0 THEN 'out' WHEN p.stock_quantity<=p.stock_threshold THEN 'low' ELSE 'available' END
    ELSE (SELECT CASE WHEN q<=0 THEN 'out' WHEN q<=i.threshold THEN 'low' ELSE 'available' END
      FROM ingredients i,
        LATERAL (SELECT coalesce(sum(l.quantity-l.reserved),0) AS q FROM stock_lots l
          WHERE l.ingredient_id=i.id AND l.expires_on>=current_date) s
      WHERE i.id=p.stock_ingredient_id)
  END
$$;
REVOKE ALL ON FUNCTION app.product_availability(public.business_products) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.product_availability(public.business_products) TO atacuisine_app;

-- Lecture publique : uniquement ce que le gérant a choisi d'afficher sur son site.
CREATE OR REPLACE FUNCTION app.public_offers(rid text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT app.has_restaurant(rid) OR NOT EXISTS (SELECT 1 FROM restaurants WHERE id=rid AND archived_at IS NULL) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'services', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'category',s.category,'summary',s.summary,'description',s.description,
        'duration',s.duration_minutes,'price',s.price_cents,'priceFrom',s.price_from,
        'capacity',s.capacity,'location',s.location,'availability',s.availability,
        'noticeHours',s.notice_hours,'images',s.images) ORDER BY s.position,s.created_at)
      FROM business_services s WHERE s.restaurant_id=rid AND s.published AND s.archived_at IS NULL),'[]'::jsonb),
    'products', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.name,'category',p.category,'summary',p.summary,'description',p.description,
        'price',p.price_cents,'compareAt',p.compare_at_cents,'images',p.images,
        'deliveryModes',to_jsonb(p.delivery_modes),'deliveryMin',p.delivery_min_days,
        'deliveryMax',p.delivery_max_days,'shippingFee',p.shipping_fee_cents,
        'featured',p.featured,'availability',app.product_availability(p)) ORDER BY p.featured DESC,p.position,p.created_at)
      FROM business_products p WHERE p.restaurant_id=rid AND p.published AND p.archived_at IS NULL),'[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION app.public_offers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.public_offers(text) TO atacuisine_app;

-- Une image n'est publique que si un service ou un produit publié l'utilise.
CREATE OR REPLACE FUNCTION app.offer_media_public(rid text, asset text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.has_restaurant(rid) AND (
    EXISTS (SELECT 1 FROM business_products p WHERE p.restaurant_id=rid AND p.published AND p.archived_at IS NULL
      AND p.images @> jsonb_build_array('/api/media/'||rid||'/'||asset))
    OR EXISTS (SELECT 1 FROM business_services s WHERE s.restaurant_id=rid AND s.published AND s.archived_at IS NULL
      AND s.images @> jsonb_build_array('/api/media/'||rid||'/'||asset)))
$$;
REVOKE ALL ON FUNCTION app.offer_media_public(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.offer_media_public(text,text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(151) ON CONFLICT DO NOTHING;
