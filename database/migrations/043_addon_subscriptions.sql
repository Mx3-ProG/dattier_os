CREATE TABLE public.addon_subscriptions (
 id text PRIMARY KEY,
 restaurant_id text NOT NULL REFERENCES restaurants(id),
 addon text NOT NULL CHECK(addon='invoices'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','cancelled','expired')),
 stripe_session text UNIQUE,
 stripe_subscription text UNIQUE,
 valid_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX addon_open_subscription ON addon_subscriptions(restaurant_id,addon) WHERE status IN ('pending','active');
ALTER TABLE addon_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY addon_read ON addon_subscriptions FOR SELECT USING(app.has_restaurant(restaurant_id));
CREATE POLICY addon_insert ON addon_subscriptions FOR INSERT WITH CHECK(app.org_admin((SELECT organization_id FROM restaurants WHERE id=restaurant_id)) AND status='pending' AND stripe_session IS NULL AND stripe_subscription IS NULL AND valid_until IS NULL);
REVOKE ALL ON addon_subscriptions FROM PUBLIC;
GRANT SELECT,INSERT ON addon_subscriptions TO atacuisine_app;
CREATE FUNCTION app.addon_session(order_id text, session_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE addon_subscriptions a SET stripe_session=session_id WHERE a.id=order_id AND a.status='pending'
 AND (a.stripe_session IS NULL OR a.stripe_session=session_id)
 AND app.org_admin((SELECT organization_id FROM restaurants WHERE id=a.restaurant_id));
 IF NOT FOUND THEN RAISE EXCEPTION 'Achat non autorisé.'; END IF;
END $$;
-- Only the server's billing connection may reconcile verified Stripe state.
CREATE FUNCTION app.addon_reconcile(order_id text, session_id text, subscription_id text, new_status text, until_date timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF new_status NOT IN ('active','cancelled','expired') THEN RAISE EXCEPTION 'Statut invalide.'; END IF;
 UPDATE addon_subscriptions SET status=new_status,stripe_subscription=subscription_id,valid_until=until_date,updated_at=now()
 WHERE id=order_id AND stripe_session=session_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Achat introuvable.'; END IF;
END $$;
REVOKE ALL ON FUNCTION app.addon_reconcile(text,text,text,text,timestamptz) FROM PUBLIC,atacuisine_app;
CREATE FUNCTION app.has_addon(rid text, addon_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(app.restaurant_plan(rid),0)>=39 AND EXISTS(SELECT 1 FROM addon_subscriptions WHERE restaurant_id=rid AND addon=addon_id AND status='active' AND valid_until>now())
$$;
INSERT INTO schema_versions(version) VALUES(43);
