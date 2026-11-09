-- Boutique d’add-ons à catégories, licences définitives et écran de chargement par établissement.
-- Additif : addon_subscriptions (abonnements existants) n’est pas modifiée.
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='atacuisine_addon_billing') THEN CREATE ROLE atacuisine_addon_billing NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$;
GRANT USAGE ON SCHEMA public,app TO atacuisine_addon_billing;

CREATE TABLE public.addon_categories (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.addon_products (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  category_id text NOT NULL REFERENCES public.addon_categories(id),
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 40),
  renderer text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  pricing_mode text NOT NULL CHECK (pricing_mode IN ('free','one_time','subscription')),
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'eur' CHECK (currency='eur'),
  sellable boolean NOT NULL DEFAULT true,
  listed boolean NOT NULL DEFAULT true,
  version text NOT NULL DEFAULT '1.0.0' CHECK (length(version) BETWEEN 1 AND 20),
  position integer NOT NULL DEFAULT 0,
  compatibility text[] NOT NULL DEFAULT '{mobile,tablet,desktop}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addon_price_matches_mode CHECK (
    (pricing_mode='free' AND price_cents=0) OR (pricing_mode<>'free' AND price_cents>=50)
  ),
  -- Les écrans de chargement restent en paiement unique, même si le modèle prévoit l’abonnement.
  CONSTRAINT loading_screen_never_subscription CHECK (kind<>'loading_screen' OR pricing_mode<>'subscription')
);
CREATE INDEX addon_products_category ON public.addon_products(category_id,position);

CREATE TABLE public.addon_purchases (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  product_id text NOT NULL REFERENCES public.addon_products(id),
  buyer_id text REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','failed','refunded','disputed','dispute_lost','duplicate')),
  amount_cents integer NOT NULL CHECK (amount_cents>=0),
  refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents>=0),
  currency text NOT NULL,
  product_version text NOT NULL,
  stripe_session text UNIQUE,
  stripe_payment_intent text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Protection anti double achat : une seule commande ouverte par add-on et établissement.
CREATE UNIQUE INDEX addon_purchase_open ON public.addon_purchases(restaurant_id,product_id) WHERE status='pending';
CREATE INDEX addon_purchases_recent ON public.addon_purchases(created_at DESC);

CREATE TABLE public.addon_licenses (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  product_id text NOT NULL REFERENCES public.addon_products(id),
  source text NOT NULL CHECK (source IN ('free','purchase')),
  purchase_id text REFERENCES public.addon_purchases(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disputed','revoked')),
  -- NULL = licence définitive. Colonne prévue pour de futurs add-ons à abonnement.
  valid_until timestamptz,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id,product_id)
);
CREATE TABLE public.addon_license_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  product_id text NOT NULL REFERENCES public.addon_products(id),
  purchase_id text,
  previous_status text,
  new_status text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addon_license_events_recent ON public.addon_license_events(restaurant_id,created_at DESC);

CREATE TABLE public.loading_screen_settings (
  restaurant_id text PRIMARY KEY REFERENCES public.restaurants(id),
  -- La clé primaire garantit un seul écran actif par établissement.
  product_id text REFERENCES public.addon_products(id),
  enabled boolean NOT NULL DEFAULT false,
  primary_color text CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  speed numeric(3,2) NOT NULL DEFAULT 1 CHECK (speed BETWEEN 0.5 AND 2),
  show_logo boolean NOT NULL DEFAULT false,
  message text CHECK (length(message)<=80),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  updated_by text REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loading_screen_enabled_needs_product CHECK (NOT enabled OR product_id IS NOT NULL)
);
CREATE TABLE public.addon_catalog_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id text NOT NULL,
  target_kind text NOT NULL,
  target_id text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.addon_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_license_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_screen_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_catalog_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY addon_categories_read ON public.addon_categories FOR SELECT TO atacuisine_app USING (true);
CREATE POLICY addon_products_read ON public.addon_products FOR SELECT TO atacuisine_app USING (true);
CREATE POLICY addon_licenses_read ON public.addon_licenses FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
CREATE POLICY loading_screen_settings_read ON public.loading_screen_settings FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
CREATE POLICY addon_purchases_read ON public.addon_purchases FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true'
    AND app.org_admin((SELECT organization_id FROM restaurants WHERE id=restaurant_id)));
CREATE POLICY addon_license_events_read ON public.addon_license_events FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true'
    AND app.org_admin((SELECT organization_id FROM restaurants WHERE id=restaurant_id)));
REVOKE ALL ON public.addon_categories,public.addon_products,public.addon_purchases,public.addon_licenses,
  public.addon_license_events,public.loading_screen_settings,public.addon_catalog_events FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.addon_categories,public.addon_products,public.addon_purchases,public.addon_licenses,
  public.addon_license_events,public.loading_screen_settings TO atacuisine_app;

-- Gestion courante : même périmètre que la permission applicative « settings ».
CREATE FUNCTION app.addon_store_manager(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT current_setting('app.public',true) IS DISTINCT FROM 'true' AND app.in_restaurant(rid) AND (
    app.org_admin((SELECT organization_id FROM restaurants WHERE id=rid))
    OR EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.profile_id
      WHERE m.restaurant_id=rid AND m.profile_id=app.user_id() AND p.status='active'
        AND m.role IN ('OWNER','SUPER_ADMIN'))
  )
$$;

CREATE FUNCTION app.addon_install_free(rid text, product text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous text;
BEGIN
  IF NOT app.addon_store_manager(rid) THEN RAISE EXCEPTION 'Installation refusée pour ce profil.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM addon_products WHERE id=product AND pricing_mode='free' AND listed AND sellable) THEN
    RAISE EXCEPTION 'Cet add-on n’est pas disponible gratuitement.';
  END IF;
  SELECT status INTO previous FROM addon_licenses WHERE restaurant_id=rid AND product_id=product FOR UPDATE;
  IF previous IN ('active','disputed') THEN RETURN; END IF;
  INSERT INTO addon_licenses(restaurant_id,product_id,source) VALUES(rid,product,'free')
  ON CONFLICT (restaurant_id,product_id) DO UPDATE SET source='free',purchase_id=NULL,status='active',updated_at=now();
  INSERT INTO addon_license_events(restaurant_id,product_id,previous_status,new_status,reason)
  VALUES(rid,product,previous,'active','free_install');
END $$;
REVOKE ALL ON FUNCTION app.addon_install_free(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.addon_install_free(text,text) TO atacuisine_app;

-- Le montant vient toujours du catalogue serveur, jamais de la requête.
CREATE FUNCTION app.addon_purchase_open(rid text, product text)
RETURNS TABLE(id text, amount_cents integer, currency text, product_name text, stripe_session text, stale boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p addon_products; o addon_purchases;
BEGIN
  IF current_setting('app.public',true)='true' OR NOT app.in_restaurant(rid)
     OR NOT app.org_admin((SELECT organization_id FROM restaurants r WHERE r.id=rid)) THEN
    RAISE EXCEPTION 'Achat refusé : réservé à l’administrateur de l’organisation.';
  END IF;
  SELECT * INTO p FROM addon_products a WHERE a.id=product;
  IF NOT FOUND OR p.pricing_mode<>'one_time' OR NOT p.listed OR NOT p.sellable THEN
    RAISE EXCEPTION 'Cet add-on n’est pas disponible à l’achat.';
  END IF;
  PERFORM 1 FROM restaurants r WHERE r.id=rid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM addon_licenses l WHERE l.restaurant_id=rid AND l.product_id=product AND l.status IN ('active','disputed')) THEN
    RAISE EXCEPTION 'Cet add-on est déjà acquis par cet établissement.';
  END IF;
  SELECT * INTO o FROM addon_purchases a WHERE a.restaurant_id=rid AND a.product_id=product AND a.status='pending' FOR UPDATE;
  IF FOUND AND o.stripe_session IS NULL AND o.amount_cents<>p.price_cents THEN
    UPDATE addon_purchases a SET amount_cents=p.price_cents,product_version=p.version,updated_at=now() WHERE a.id=o.id RETURNING * INTO o;
  ELSIF NOT FOUND THEN
    INSERT INTO addon_purchases(id,restaurant_id,product_id,buyer_id,amount_cents,currency,product_version)
    VALUES(gen_random_uuid()::text,rid,product,app.user_id(),p.price_cents,p.currency,p.version) RETURNING * INTO o;
  END IF;
  RETURN QUERY SELECT o.id,o.amount_cents,o.currency,p.name,o.stripe_session,o.amount_cents<>p.price_cents;
END $$;
REVOKE ALL ON FUNCTION app.addon_purchase_open(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.addon_purchase_open(text,text) TO atacuisine_app;

CREATE FUNCTION app.addon_purchase_attach(order_id text, session_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE addon_purchases a SET stripe_session=session_id,updated_at=now()
  WHERE a.id=order_id AND a.status='pending' AND (a.stripe_session IS NULL OR a.stripe_session=session_id)
    AND app.in_restaurant(a.restaurant_id)
    AND app.org_admin((SELECT organization_id FROM restaurants WHERE id=a.restaurant_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'Achat non autorisé.'; END IF;
END $$;
REVOKE ALL ON FUNCTION app.addon_purchase_attach(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.addon_purchase_attach(text,text) TO atacuisine_app;

-- Fonctions réservées à la connexion de facturation : l’état Stripe vérifié est la seule source de droits.
CREATE FUNCTION app.addon_purchase_lock(order_id text) RETURNS SETOF public.addon_purchases
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT * FROM addon_purchases WHERE id=order_id FOR UPDATE
$$;
CREATE FUNCTION app.addon_purchase_by_intent(intent_id text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT id FROM addon_purchases WHERE stripe_payment_intent=intent_id
$$;
CREATE FUNCTION app.addon_purchase_apply(order_id text, session_id text, intent_id text, new_status text, refunded integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o addon_purchases; lic addon_licenses; effective text:=new_status; next_license text;
BEGIN
  IF new_status NOT IN ('paid','expired','failed','refunded','disputed','dispute_lost') THEN RAISE EXCEPTION 'Statut invalide.'; END IF;
  SELECT * INTO o FROM addon_purchases WHERE id=order_id AND stripe_session=session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Achat introuvable.'; END IF;
  -- Une notification tardive d’expiration ne peut pas annuler un paiement déjà confirmé.
  IF new_status IN ('expired','failed') AND o.status<>'pending' THEN RETURN o.status; END IF;
  SELECT * INTO lic FROM addon_licenses WHERE restaurant_id=o.restaurant_id AND product_id=o.product_id FOR UPDATE;
  IF new_status='paid' THEN
    IF lic.status IN ('active','disputed') AND lic.purchase_id IS DISTINCT FROM o.id THEN
      effective:='duplicate';
    ELSIF lic.status IS DISTINCT FROM 'active' THEN
      next_license:='active';
    END IF;
  ELSIF lic.purchase_id=o.id THEN
    IF new_status='disputed' AND lic.status<>'disputed' THEN next_license:='disputed';
    ELSIF new_status IN ('refunded','dispute_lost') AND lic.status<>'revoked' THEN next_license:='revoked';
    END IF;
  END IF;
  IF next_license IS NOT NULL THEN
    INSERT INTO addon_licenses(restaurant_id,product_id,source,purchase_id,status)
    VALUES(o.restaurant_id,o.product_id,'purchase',o.id,next_license)
    ON CONFLICT (restaurant_id,product_id) DO UPDATE SET source='purchase',purchase_id=o.id,status=next_license,updated_at=now();
    INSERT INTO addon_license_events(restaurant_id,product_id,purchase_id,previous_status,new_status,reason)
    VALUES(o.restaurant_id,o.product_id,o.id,lic.status,next_license,effective);
  END IF;
  UPDATE addon_purchases SET status=effective,stripe_payment_intent=coalesce(intent_id,stripe_payment_intent),
    refunded_cents=greatest(refunded_cents,coalesce(refunded,0)),
    paid_at=CASE WHEN effective IN ('paid','duplicate') THEN coalesce(paid_at,now()) ELSE paid_at END,updated_at=now()
  WHERE id=o.id AND (status IS DISTINCT FROM effective OR stripe_payment_intent IS DISTINCT FROM coalesce(intent_id,stripe_payment_intent)
    OR refunded_cents<coalesce(refunded,0));
  RETURN effective;
END $$;
REVOKE ALL ON FUNCTION app.addon_purchase_lock(text) FROM PUBLIC,atacuisine_app;
REVOKE ALL ON FUNCTION app.addon_purchase_by_intent(text) FROM PUBLIC,atacuisine_app;
REVOKE ALL ON FUNCTION app.addon_purchase_apply(text,text,text,text,integer) FROM PUBLIC,atacuisine_app;
GRANT EXECUTE ON FUNCTION app.addon_purchase_lock(text),app.addon_purchase_by_intent(text),
  app.addon_purchase_apply(text,text,text,text,integer) TO atacuisine_addon_billing;

CREATE FUNCTION app.loading_screen_save(rid text, product text, is_enabled boolean, primary_c text, secondary_c text,
  speed_value numeric, logo boolean, msg text, expected_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE next_revision integer;
BEGIN
  IF NOT app.addon_store_manager(rid) THEN RAISE EXCEPTION 'Personnalisation refusée pour ce profil.'; END IF;
  IF product IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
    WHERE l.restaurant_id=rid AND l.product_id=product AND l.status='active' AND p.kind='loading_screen'
      AND (l.valid_until IS NULL OR l.valid_until>now())
  ) THEN
    RAISE EXCEPTION 'Cet écran n’est pas acquis par cet établissement.';
  END IF;
  IF expected_revision=0 THEN
    INSERT INTO loading_screen_settings(restaurant_id,product_id,enabled,primary_color,secondary_color,speed,show_logo,message,updated_by)
    VALUES(rid,product,is_enabled,primary_c,secondary_c,speed_value,logo,nullif(msg,''),app.user_id())
    ON CONFLICT DO NOTHING RETURNING revision INTO next_revision;
  ELSE
    UPDATE loading_screen_settings SET product_id=product,enabled=is_enabled,primary_color=primary_c,secondary_color=secondary_c,
      speed=speed_value,show_logo=logo,message=nullif(msg,''),revision=revision+1,updated_by=app.user_id(),updated_at=now()
    WHERE restaurant_id=rid AND revision=expected_revision RETURNING revision INTO next_revision;
  END IF;
  IF next_revision IS NULL THEN RAISE EXCEPTION 'Configuration modifiée ailleurs. Rechargez la page.'; END IF;
  RETURN next_revision;
END $$;
REVOKE ALL ON FUNCTION app.loading_screen_save(text,text,boolean,text,text,numeric,boolean,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.loading_screen_save(text,text,boolean,text,text,numeric,boolean,text,integer) TO atacuisine_app;

-- Administration de la plateforme : chaque fonction vérifie elle-même le rôle.
CREATE FUNCTION app.addon_admin_guard() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF app.user_id() IS NULL OR NOT app.is_platform_admin(app.user_id()) THEN
    RAISE EXCEPTION 'Administration de la plateforme refusée.';
  END IF;
END $$;
CREATE FUNCTION app.addon_admin_save_category(data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM app.addon_admin_guard();
  INSERT INTO addon_categories(id,name,description,position,visible)
  VALUES(data->>'id',data->>'name',coalesce(data->>'description',''),coalesce((data->>'position')::int,0),coalesce((data->>'visible')::boolean,true))
  ON CONFLICT (id) DO UPDATE SET name=excluded.name,description=excluded.description,position=excluded.position,visible=excluded.visible,updated_at=now();
  INSERT INTO addon_catalog_events(actor_id,target_kind,target_id,snapshot) VALUES(app.user_id(),'category',data->>'id',data);
END $$;
CREATE FUNCTION app.addon_admin_delete_category(category text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM app.addon_admin_guard();
  IF EXISTS(SELECT 1 FROM addon_products WHERE category_id=category) THEN
    RAISE EXCEPTION 'Cette catégorie contient encore des add-ons.';
  END IF;
  DELETE FROM addon_categories WHERE id=category;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catégorie introuvable.'; END IF;
  INSERT INTO addon_catalog_events(actor_id,target_kind,target_id,snapshot) VALUES(app.user_id(),'category',category,'{"deleted":true}');
END $$;
-- Retirer un add-on du catalogue passe par listed=false : les licences acquises restent intactes.
CREATE FUNCTION app.addon_admin_save_product(data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM app.addon_admin_guard();
  INSERT INTO addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,sellable,listed,version,position)
  VALUES(data->>'id',data->>'categoryId',data->>'kind',data->>'renderer',data->>'name',coalesce(data->>'description',''),data->>'pricingMode',
    (data->>'priceCents')::int,(data->>'sellable')::boolean,(data->>'listed')::boolean,data->>'version',coalesce((data->>'position')::int,0))
  ON CONFLICT (id) DO UPDATE SET category_id=excluded.category_id,renderer=excluded.renderer,name=excluded.name,description=excluded.description,
    pricing_mode=excluded.pricing_mode,price_cents=excluded.price_cents,sellable=excluded.sellable,listed=excluded.listed,
    version=excluded.version,position=excluded.position,updated_at=now();
  INSERT INTO addon_catalog_events(actor_id,target_kind,target_id,snapshot) VALUES(app.user_id(),'product',data->>'id',data);
END $$;
CREATE FUNCTION app.addon_admin_stats()
RETURNS TABLE(product_id text, installations integer, active_uses integer, sales integer, refunds integer, revenue_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM app.addon_admin_guard();
  RETURN QUERY SELECT p.id,
    (SELECT count(*)::int FROM addon_licenses l WHERE l.product_id=p.id AND l.status='active'),
    (SELECT count(*)::int FROM loading_screen_settings s WHERE s.product_id=p.id AND s.enabled),
    (SELECT count(*)::int FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('paid','disputed')),
    (SELECT count(*)::int FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('refunded','dispute_lost','duplicate')),
    (SELECT coalesce(sum(greatest(o.amount_cents-o.refunded_cents,0)),0)::bigint FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('paid','disputed'))
  FROM addon_products p ORDER BY p.position,p.id;
END $$;
CREATE FUNCTION app.addon_admin_purchases(max_rows integer)
RETURNS TABLE(id text, restaurant_name text, product_name text, status text, amount_cents integer, refunded_cents integer, currency text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM app.addon_admin_guard();
  RETURN QUERY SELECT o.id,r.name,p.name,o.status,o.amount_cents,o.refunded_cents,o.currency,o.created_at
  FROM addon_purchases o JOIN restaurants r ON r.id=o.restaurant_id JOIN addon_products p ON p.id=o.product_id
  ORDER BY o.created_at DESC LIMIT least(greatest(max_rows,1),200);
END $$;
REVOKE ALL ON FUNCTION app.addon_admin_guard(),app.addon_admin_save_category(jsonb),app.addon_admin_delete_category(text),
  app.addon_admin_save_product(jsonb),app.addon_admin_stats(),app.addon_admin_purchases(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.addon_admin_guard(),app.addon_admin_save_category(jsonb),app.addon_admin_delete_category(text),
  app.addon_admin_save_product(jsonb),app.addon_admin_stats(),app.addon_admin_purchases(integer) TO atacuisine_app;

INSERT INTO public.addon_categories(id,name,description,position) VALUES
  ('loading-screens','Écrans de chargement','Une animation à l’image de votre établissement, partagée par toute votre équipe.',10);
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('magic-loader','loading-screens','loading_screen','magic','Magic Loader','Particules lumineuses, petites étoiles et scintillements en boucle douce.','free',0,1),
  ('kitchen-loader','loading-screens','loading_screen','kitchen','Kitchen Loader','La fourchette et le couteau tournoient puis se recroisent dans un petit tchin.','free',0,2),
  ('studio-s','loading-screens','loading_screen','studio-s','Studio S','Une lettre S minimaliste qui tourne sur elle-même, avec profondeur et légère lueur.','free',0,3),
  ('liquid-flow','loading-screens','loading_screen','liquid','Liquid Flow','Des vagues fluides et des dégradés aux mouvements organiques.','one_time',500,4),
  ('neon-pulse','loading-screens','loading_screen','neon','Neon Pulse','Un cercle néon futuriste, ses pulsations, son halo et son énergie.','one_time',500,5),
  ('coffee-break','loading-screens','loading_screen','coffee','Coffee Break','Une tasse de café stylisée dont la vapeur monte naturellement.','one_time',500,6),
  ('orbit-galaxy','loading-screens','loading_screen','orbit','Orbit Galaxy','Une planète entourée d’anneaux et de particules en orbite.','one_time',700,7),
  ('infinity-loop','loading-screens','loading_screen','infinity','Infinity Loop','Une ligne lumineuse parcourt sans fin le symbole de l’infini.','one_time',700,8),
  ('crystal-morph','loading-screens','loading_screen','crystal','Crystal Morph','Une forme cristalline qui se transforme, pivote et capte la lumière.','one_time',900,9),
  ('golden-luxury','loading-screens','loading_screen','golden','Golden Luxury','Des anneaux dorés aux reflets métalliques, pour les établissements premium.','one_time',900,10);
INSERT INTO schema_versions(version) VALUES(49);
