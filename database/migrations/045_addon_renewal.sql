ALTER TABLE public.addon_subscriptions ADD COLUMN renewal_cancelled boolean;
-- Existing rows remain unknown until confirmed against Stripe.
ALTER POLICY addon_insert ON addon_subscriptions WITH CHECK(
 app.org_admin((SELECT organization_id FROM restaurants WHERE id=restaurant_id))
 AND status='pending' AND stripe_session IS NULL AND stripe_subscription IS NULL
 AND valid_until IS NULL AND renewal_cancelled IS NULL
);
CREATE FUNCTION app.addon_renewal(order_id text, session_id text, stopped boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF stopped IS NULL THEN RAISE EXCEPTION 'État de renouvellement absent.'; END IF;
 UPDATE addon_subscriptions SET renewal_cancelled=stopped,updated_at=now()
 WHERE id=order_id AND stripe_session=session_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Achat introuvable.'; END IF;
END $$;
REVOKE ALL ON FUNCTION app.addon_renewal(text,text,boolean) FROM PUBLIC,atacuisine_app;
INSERT INTO schema_versions(version) VALUES(45);
