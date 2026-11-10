-- Retire les protections de 060. Les droits resserrés ne sont pas rouverts : c'était le comportement voulu des migrations.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT polname,polrelid::regclass::text AS t FROM pg_policy WHERE polname IN ('public_denied','public_no_read','public_no_update','public_no_delete') LOOP
    EXECUTE format('DROP POLICY %I ON %I',r.polname,r.t);
  END LOOP;
  FOR r IN SELECT g.tgname,g.tgrelid::regclass::text AS t FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid WHERE p.proname='guard_same_tenant' LOOP
    EXECUTE format('DROP TRIGGER %I ON %I',r.tgname,r.t);
  END LOOP;
END $$;
DROP FUNCTION app.guard_same_tenant();
DROP FUNCTION app.enqueue_job(text,text,text,jsonb,text,timestamptz);
DROP POLICY scoped_read ON organization_customers;
CREATE POLICY scoped_read ON organization_customers FOR SELECT USING(subject=app.user_id() OR app.org_member(organization_id));
DROP POLICY wallet_read ON loyalty_wallets;
CREATE POLICY wallet_scope ON loyalty_wallets USING(EXISTS(SELECT 1 FROM organization_customers c WHERE c.id=loyalty_wallets.account_id AND (c.subject=app.user_id() OR app.org_member(c.organization_id)))) WITH CHECK(EXISTS(SELECT 1 FROM organization_customers c WHERE c.id=loyalty_wallets.account_id AND (c.subject=app.user_id() OR app.org_member(c.organization_id))));
GRANT INSERT,UPDATE,DELETE ON loyalty_wallets TO atacuisine_app;
CREATE OR REPLACE FUNCTION app.ai_history(rid text, lim integer DEFAULT 20)
 RETURNS TABLE(delta integer, kind text, engine text, detail text, created_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT l.delta,l.kind,l.engine,l.detail,l.created_at FROM app.ai_ledger l
  JOIN restaurants r ON r.organization_id=l.organization_id
  WHERE r.id=rid AND app.has_restaurant(rid)
  ORDER BY l.created_at DESC, l.id DESC LIMIT least(greatest(lim,1),100)
$$;
DROP FUNCTION app.not_public();
DELETE FROM schema_versions WHERE version=60;
