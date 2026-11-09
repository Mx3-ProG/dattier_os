-- Installation is an establishment preference, separate from the commercial right.
-- Missing rows preserve the state of existing establishments during migration.
CREATE TABLE public.addon_installations (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  addon_id text NOT NULL CHECK (addon_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  installed boolean NOT NULL,
  updated_by text REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, addon_id)
);
ALTER TABLE public.addon_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY addon_installations_read ON public.addon_installations FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.addon_installations FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.addon_installations TO atacuisine_app;

CREATE FUNCTION app.addon_entitled(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE addon
    WHEN 'floor' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'booking' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'loyalty' THEN coalesce(app.restaurant_plan(rid),0)>=69
    WHEN 'website' THEN coalesce(app.restaurant_plan(rid),0)>=69
    WHEN 'online-orders' THEN coalesce(app.restaurant_plan(rid),0)>=99
    WHEN 'invoices' THEN coalesce(app.restaurant_plan(rid),0)>=69 OR EXISTS (
      SELECT 1 FROM addon_subscriptions s WHERE s.restaurant_id=rid AND s.addon='invoices'
        AND s.status='active' AND s.valid_until>now())
    ELSE EXISTS (
      SELECT 1 FROM addon_licenses l WHERE l.restaurant_id=rid AND l.product_id=addon
        AND l.status='active' AND (l.valid_until IS NULL OR l.valid_until>now()))
  END
$$;
CREATE FUNCTION app.addon_installed(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.addon_entitled(rid,addon) AND coalesce((
    SELECT installed FROM addon_installations WHERE restaurant_id=rid AND addon_id=addon
  ),true)
$$;
REVOKE ALL ON FUNCTION app.addon_entitled(text,text),app.addon_installed(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.addon_entitled(text,text),app.addon_installed(text,text) TO atacuisine_app;

CREATE FUNCTION app.addon_installation_set(rid text, addon text, desired boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE module text;
BEGIN
  IF current_setting('app.public',true)='true' OR NOT app.in_restaurant(rid)
     OR NOT app.addon_store_manager(rid) THEN
    RAISE EXCEPTION 'Gestion des add-ons réservée au super admin de l’établissement.';
  END IF;
  IF desired IS NULL OR NOT app.addon_entitled(rid,addon) THEN
    RAISE EXCEPTION 'Cet add-on n’est pas disponible pour cet établissement.';
  END IF;
  PERFORM 1 FROM restaurants WHERE id=rid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Établissement indisponible.'; END IF;
  module:=CASE addon WHEN 'floor' THEN 'floor' WHEN 'booking' THEN 'table-booking' END;
  IF NOT desired AND module='floor' AND app.addon_installed(rid,'booking') THEN
    RAISE EXCEPTION 'Désinstallez d’abord les réservations de tables.';
  END IF;
  IF NOT desired AND module IN ('floor','table-booking') THEN
    IF module='floor' AND (
      EXISTS (SELECT 1 FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id WHERE t.restaurant_id=rid AND s.closed_at IS NULL)
      OR EXISTS (SELECT 1 FROM orders o JOIN table_sessions s ON s.id=o.session_id WHERE o.restaurant_id=rid AND o.status IN ('pending','active'))
    ) THEN RAISE EXCEPTION 'Terminez les services de table en cours.'; END IF;
    IF EXISTS (SELECT 1 FROM reservations WHERE restaurant_id=rid AND status IN ('requested','confirmed','arrived') AND ends_at>now()) THEN
      RAISE EXCEPTION 'Traitez les réservations à venir avant désinstallation.';
    END IF;
  END IF;
  IF desired AND module='table-booking' AND NOT app.module_enabled(rid,'floor') THEN
    RAISE EXCEPTION 'Installez et activez d’abord le plan de salle.';
  END IF;
  INSERT INTO addon_installations(restaurant_id,addon_id,installed,updated_by)
    VALUES(rid,addon,desired,app.user_id())
    ON CONFLICT (restaurant_id,addon_id) DO UPDATE SET installed=excluded.installed,
      updated_by=excluded.updated_by,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION app.addon_installation_set(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.addon_installation_set(text,text,boolean) TO atacuisine_app;

-- The original one-time checkout predates establishment super admins.
CREATE OR REPLACE FUNCTION app.addon_purchase_open(rid text, product text)
RETURNS TABLE(id text, amount_cents integer, currency text, product_name text, stripe_session text, stale boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p addon_products; o addon_purchases;
BEGIN
  IF NOT app.addon_store_manager(rid) THEN
    RAISE EXCEPTION 'Achat refusé : réservé au super admin de l’établissement.';
  END IF;
  SELECT * INTO p FROM addon_products a WHERE a.id=product;
  IF NOT FOUND OR p.pricing_mode<>'one_time' OR NOT p.listed OR NOT p.sellable THEN
    RAISE EXCEPTION 'Cet add-on n’est pas disponible à l’achat.';
  END IF;
  PERFORM 1 FROM restaurants r WHERE r.id=rid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM addon_licenses l WHERE l.restaurant_id=rid AND l.product_id=product
    AND l.status IN ('active','disputed') AND (l.valid_until IS NULL OR l.valid_until>now())) THEN
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
ALTER POLICY addon_purchases_read ON public.addon_purchases TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true'
    AND app.addon_store_manager(restaurant_id));
ALTER POLICY addon_insert ON public.addon_subscriptions WITH CHECK (
  app.addon_store_manager(restaurant_id) AND status='pending' AND stripe_session IS NULL
  AND stripe_subscription IS NULL AND valid_until IS NULL AND renewal_cancelled IS NULL
);
CREATE OR REPLACE FUNCTION app.addon_session(order_id text, session_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE addon_subscriptions a SET stripe_session=session_id WHERE a.id=order_id AND a.status='pending'
    AND (a.stripe_session IS NULL OR a.stripe_session=session_id)
    AND app.addon_store_manager(a.restaurant_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Achat non autorisé.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION app.module_enabled(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT module IN ('floor','table-booking')
    AND app.addon_installed(rid,CASE WHEN module='table-booking' THEN 'booking' ELSE 'floor' END)
    AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
      AND s.module_id=module AND s.applied_state='suspended')
    AND (module<>'table-booking' OR app.addon_installed(rid,'floor')
      AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
        AND s.module_id='floor' AND s.applied_state='suspended'))
$$;

CREATE OR REPLACE FUNCTION app.has_addon(rid text, addon_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.addon_installed(rid,addon_id)
$$;

CREATE OR REPLACE FUNCTION app.analytics_licensed(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
    WHERE l.restaurant_id=rid AND p.kind='analytics' AND app.addon_installed(rid,l.product_id))
$$;
CREATE OR REPLACE FUNCTION app.analytics_licensed_for(rid text, product text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.analytics_reader(rid) AND EXISTS(SELECT 1 FROM addon_products p
    WHERE p.id=product AND p.kind='analytics') AND app.addon_installed(rid,product)
$$;

INSERT INTO schema_versions(version) VALUES(71);
