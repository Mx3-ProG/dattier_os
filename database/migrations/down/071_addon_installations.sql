-- Revert installation gating before dropping its functions and table.
CREATE OR REPLACE FUNCTION app.module_enabled(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT module IN ('floor','table-booking') AND coalesce(app.restaurant_plan(rid),0)>=39
    AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
      AND s.module_id=module AND s.applied_state='suspended')
    AND (module<>'table-booking' OR NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
      AND s.module_id='floor' AND s.applied_state='suspended'))
$$;
CREATE OR REPLACE FUNCTION app.has_addon(rid text, addon_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(app.restaurant_plan(rid),0)>=39 AND EXISTS (
    SELECT 1 FROM addon_subscriptions WHERE restaurant_id=rid AND addon=addon_id
      AND status='active' AND valid_until>now())
$$;
CREATE OR REPLACE FUNCTION app.analytics_licensed(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
    WHERE l.restaurant_id=rid AND p.kind='analytics' AND l.status='active'
      AND (l.valid_until IS NULL OR l.valid_until>now()))
$$;
CREATE OR REPLACE FUNCTION app.analytics_licensed_for(rid text, product text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.analytics_reader(rid) AND EXISTS(SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
    WHERE l.restaurant_id=rid AND l.product_id=product AND p.kind='analytics' AND l.status='active'
      AND (l.valid_until IS NULL OR l.valid_until>now()))
$$;
ALTER POLICY addon_purchases_read ON public.addon_purchases TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true'
    AND app.org_admin((SELECT organization_id FROM restaurants WHERE id=restaurant_id)));
ALTER POLICY addon_insert ON public.addon_subscriptions WITH CHECK (
  app.org_admin((SELECT organization_id FROM restaurants WHERE id=restaurant_id))
  AND status='pending' AND stripe_session IS NULL AND stripe_subscription IS NULL
  AND valid_until IS NULL AND renewal_cancelled IS NULL
);
CREATE OR REPLACE FUNCTION app.addon_session(order_id text, session_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE addon_subscriptions a SET stripe_session=session_id WHERE a.id=order_id AND a.status='pending'
    AND (a.stripe_session IS NULL OR a.stripe_session=session_id)
    AND app.org_admin((SELECT organization_id FROM restaurants WHERE id=a.restaurant_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'Achat non autorisé.'; END IF;
END $$;
-- The earlier purchase function is restored by the 049 migration when rolling forward.
DROP FUNCTION app.addon_installation_set(text,text,boolean);
DROP FUNCTION app.addon_installed(text,text);
DROP FUNCTION app.addon_entitled(text,text);
DROP TABLE public.addon_installations;
DELETE FROM schema_versions WHERE version=71;
