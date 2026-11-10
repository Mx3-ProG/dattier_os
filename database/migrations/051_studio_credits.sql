-- Test-only Studio credits: one credit equals one euro cent of prepaid usage.
CREATE TABLE public.studio_credit_orders (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id),
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  pack_cents integer NOT NULL CHECK (pack_cents IN (500,1000,2500)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','expired','disputed')),
  stripe_session text UNIQUE,
  stripe_payment_intent text UNIQUE,
  credited_cents integer NOT NULL DEFAULT 0 CHECK (credited_cents>=0),
  refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents>=0),
  created_by text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (credited_cents+refunded_cents<=pack_cents)
);
CREATE UNIQUE INDEX studio_credit_open_pack ON public.studio_credit_orders(organization_id,pack_cents)
  WHERE status='pending';
CREATE TABLE public.studio_credit_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id),
  order_id text NOT NULL REFERENCES public.studio_credit_orders(id),
  delta_credits integer NOT NULL CHECK (delta_credits<>0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_credit_ledger_org ON public.studio_credit_ledger(organization_id,id DESC);
ALTER TABLE public.studio_credit_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_credit_order_read ON public.studio_credit_orders FOR SELECT TO atacuisine_app
  USING (app.org_admin(organization_id) AND app.in_restaurant(restaurant_id)
    AND current_setting('app.public',true) IS DISTINCT FROM 'true');
ALTER TABLE public.studio_credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_credit_ledger_read ON public.studio_credit_ledger FOR SELECT TO atacuisine_app
  USING (app.org_admin(organization_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.studio_credit_orders,public.studio_credit_ledger FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.studio_credit_orders,public.studio_credit_ledger TO atacuisine_app;
GRANT SELECT,UPDATE ON public.studio_credit_orders TO atacuisine_addon_billing;
GRANT SELECT,INSERT ON public.studio_credit_ledger TO atacuisine_addon_billing;
GRANT USAGE,SELECT ON SEQUENCE public.studio_credit_ledger_id_seq TO atacuisine_addon_billing;
CREATE POLICY studio_credit_billing_orders ON public.studio_credit_orders FOR ALL TO atacuisine_addon_billing
  USING (true) WITH CHECK (true);
CREATE POLICY studio_credit_billing_ledger ON public.studio_credit_ledger FOR ALL TO atacuisine_addon_billing
  USING (true) WITH CHECK (true);

CREATE FUNCTION app.studio_credit_open(rid text, order_id text, pack integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oid text; result text;
BEGIN
  SELECT organization_id INTO oid FROM restaurants WHERE id=rid AND archived_at IS NULL;
  IF oid IS NULL OR current_setting('app.public',true)='true' OR NOT app.in_restaurant(rid)
     OR NOT app.org_admin(oid) OR coalesce(app.restaurant_plan(rid),0)<39 THEN
    RAISE EXCEPTION 'Recharge réservée à l’administrateur de l’organisation.';
  END IF;
  IF pack NOT IN (500,1000,2500) OR order_id IS NULL OR length(order_id)>100 THEN
    RAISE EXCEPTION 'Pack de crédits invalide.';
  END IF;
  INSERT INTO studio_credit_orders(id,organization_id,restaurant_id,pack_cents,created_by)
    VALUES(order_id,oid,rid,pack,app.user_id()) ON CONFLICT DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN
    SELECT id INTO result FROM studio_credit_orders WHERE organization_id=oid AND pack_cents=pack AND status='pending';
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'Commande de crédits indisponible.'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.studio_credit_open(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.studio_credit_open(text,text,integer) TO atacuisine_app;

CREATE FUNCTION app.studio_credit_attach(order_id text, session_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE studio_credit_orders o SET stripe_session=session_id,updated_at=now()
    WHERE o.id=order_id AND o.status='pending'
      AND (o.stripe_session IS NULL OR o.stripe_session=session_id)
      AND app.in_restaurant(o.restaurant_id) AND app.org_admin(o.organization_id)
      AND current_setting('app.public',true) IS DISTINCT FROM 'true';
  IF NOT FOUND THEN RAISE EXCEPTION 'Commande de crédits non autorisée.'; END IF;
END $$;
REVOKE ALL ON FUNCTION app.studio_credit_attach(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.studio_credit_attach(text,text) TO atacuisine_app;

CREATE FUNCTION app.studio_credit_lock(order_id text) RETURNS SETOF public.studio_credit_orders
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT * FROM studio_credit_orders WHERE id=order_id FOR UPDATE
$$;
CREATE FUNCTION app.studio_credit_apply(order_id text, session_id text, intent_id text,
  paid boolean, refunded integer, disputed boolean) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data studio_credit_orders%ROWTYPE; target integer; difference integer;
BEGIN
  SELECT * INTO row_data FROM studio_credit_orders WHERE id=order_id FOR UPDATE;
  IF row_data.id IS NULL OR row_data.stripe_session IS DISTINCT FROM session_id
     OR refunded<0 OR refunded>row_data.pack_cents
     OR (row_data.stripe_payment_intent IS NOT NULL AND row_data.stripe_payment_intent<>intent_id) THEN
    RAISE EXCEPTION 'Règlement de crédits incompatible.';
  END IF;
  target:=CASE WHEN paid AND NOT disputed THEN row_data.pack_cents-refunded ELSE 0 END;
  difference:=target-row_data.credited_cents;
  IF difference<>0 THEN
    INSERT INTO studio_credit_ledger(organization_id,order_id,delta_credits)
      VALUES(row_data.organization_id,order_id,difference);
  END IF;
  UPDATE studio_credit_orders SET status=CASE WHEN disputed THEN 'disputed' WHEN paid THEN
      CASE WHEN refunded=row_data.pack_cents THEN 'refunded' ELSE 'paid' END
      ELSE 'expired' END,
    stripe_payment_intent=coalesce(intent_id,stripe_payment_intent),
    credited_cents=target,refunded_cents=refunded,updated_at=now()
    WHERE id=order_id;
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION app.studio_credit_lock(text),app.studio_credit_apply(text,text,text,boolean,integer,boolean) FROM PUBLIC,atacuisine_app;
GRANT EXECUTE ON FUNCTION app.studio_credit_lock(text),app.studio_credit_apply(text,text,text,boolean,integer,boolean) TO atacuisine_addon_billing;

CREATE FUNCTION app.studio_credit_balance(rid text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(sum(l.delta_credits),0)::integer FROM studio_credit_ledger l
  JOIN restaurants r ON r.organization_id=l.organization_id
  WHERE r.id=rid AND app.in_restaurant(rid) AND current_setting('app.public',true) IS DISTINCT FROM 'true'
$$;
REVOKE ALL ON FUNCTION app.studio_credit_balance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.studio_credit_balance(text) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(51);
