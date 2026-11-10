-- Durcissement de la séparation des tenants. Voir docs/platform/TENANT_ISOLATION.md.

-- 1. Canal public : hors liste explicite, un visiteur anonyme n'atteint aucune table,
--    même dans le contexte de son restaurant. Le worker garde l'accès à son tenant.
--    La liste est aussi dans src/lib/database/public-tables.ts ; le test compare les deux.
CREATE FUNCTION app.not_public() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.public',true) IS DISTINCT FROM 'true'
      OR pg_has_role(current_user,'atacuisine_worker','MEMBER')
$$;
REVOKE ALL ON FUNCTION app.not_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.not_public() TO atacuisine_app;
DO $$ DECLARE
  root text[]:=ARRAY['restaurants','organizations','profiles','schema_versions'];
  open_tables text[]:=ARRAY[
    'menu_items','recipe_ingredients','option_recipes','ingredients','stock_lots','stock_movements','stock_reservations',
    'orders','order_items','table_sessions','dining_tables','floor_zones','floor_layout_access',
    'shop_settings','shop_orders','payment_declarations','online_payments','connect_accounts',
    'promo_codes','promo_redemptions','flash_promotions','product_reviews',
    'loyalty_rewards','loyalty_settings','loyalty_transactions','organization_loyalty_transactions','loyalty_wallets',
    'customers','organization_customers','customer_sessions','customer_access_tokens','customer_email_outbox',
    'customer_password_resets','customer_badges','customer_referral_codes','customer_referrals','reservations',
    'qr_codes','qr_scans','restaurant_cms','cms_versions','cms_media','site_documents','site_publications','site_assets',
    'restaurant_domains'];
  insert_only text[]:=ARRAY['notifications','restaurant_events','audit_logs','ops_security_events','security_events'];
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    IF t=ANY(root) OR t=ANY(open_tables) THEN CONTINUE; END IF;
    IF t=ANY(insert_only) THEN
      EXECUTE format('CREATE POLICY public_no_read ON %I AS RESTRICTIVE FOR SELECT USING(app.not_public())',t);
      EXECUTE format('CREATE POLICY public_no_update ON %I AS RESTRICTIVE FOR UPDATE USING(app.not_public())',t);
      EXECUTE format('CREATE POLICY public_no_delete ON %I AS RESTRICTIVE FOR DELETE USING(app.not_public())',t);
    ELSE
      EXECUTE format('CREATE POLICY public_denied ON %I AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public())',t);
    END IF;
  END LOOP;
END $$;

-- La file de jobs n'est plus accessible au canal public : il dépose par cette fonction,
-- uniquement pour le restaurant de son contexte, sans pouvoir relire la file.
CREATE FUNCTION app.enqueue_job(job_id text,rid text,job_kind text,job_payload jsonb,job_key text,job_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  IF NOT app.in_restaurant(rid) AND NOT pg_has_role(session_user,'atacuisine_worker','MEMBER') THEN RAISE EXCEPTION 'Établissement non autorisé.'; END IF;
  INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key,available_at)
    VALUES(job_id,rid,job_kind,job_payload,job_key,coalesce(job_at,now()))
    ON CONFLICT(restaurant_id,kind,dedupe_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION app.enqueue_job(text,text,text,jsonb,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enqueue_job(text,text,text,jsonb,text,timestamptz) TO atacuisine_app;

-- 2. Une ligne ne peut pas pointer vers la ligne d'un autre établissement.
--    SECURITY DEFINER : le résultat ne dépend pas de ce que l'appelant a le droit de lire.
CREATE FUNCTION app.guard_same_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE doc jsonb:=to_jsonb(NEW); owner_id text; BEGIN
  IF doc->>TG_ARGV[0] IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT restaurant_id::text FROM %I WHERE %I::text=$1',TG_ARGV[1],TG_ARGV[2]) INTO owner_id USING doc->>TG_ARGV[0];
  IF owner_id IS DISTINCT FROM doc->>'restaurant_id' THEN RAISE EXCEPTION 'Reference hors etablissement'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_same_tenant() FROM PUBLIC;
DO $$ DECLARE fk record; BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass::text AS child,a.attname::text AS col,c.confrelid::regclass::text AS parent,b.attname::text AS parent_col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1]
     WHERE c.contype='f' AND array_length(c.conkey,1)=1 AND c.connamespace='public'::regnamespace
       AND c.confrelid NOT IN ('restaurants'::regclass,'profiles'::regclass,'organizations'::regclass)
       AND EXISTS(SELECT 1 FROM pg_attribute x WHERE x.attrelid=c.conrelid AND x.attname='restaurant_id' AND NOT x.attisdropped)
       AND EXISTS(SELECT 1 FROM pg_attribute x WHERE x.attrelid=c.confrelid AND x.attname='restaurant_id' AND NOT x.attisdropped)
       AND NOT EXISTS(SELECT 1 FROM pg_trigger g WHERE g.tgrelid=c.conrelid AND NOT g.tgisinternal AND pg_get_triggerdef(g.oid) ILIKE format('%%guard_links%%%L%%',a.attname))
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION app.guard_same_tenant(%L,%L,%L)',
      'tenant_fk_'||fk.col,fk.col,fk.child,fk.col,fk.parent,fk.parent_col);
  END LOOP;
END $$;

-- 3. Entre établissements d'une organisation : un employé ne voit que les comptes clients
--    connus de son établissement. Le solde de points n'est écrit que par app.loyalty_delta.
DROP POLICY scoped_read ON organization_customers;
CREATE POLICY scoped_read ON organization_customers FOR SELECT USING(
  subject=app.user_id() OR app.org_admin(organization_id)
  OR (app.not_public() AND EXISTS(SELECT 1 FROM customers c WHERE c.account_id=organization_customers.id))
);
DROP POLICY wallet_scope ON loyalty_wallets;
CREATE POLICY wallet_read ON loyalty_wallets FOR SELECT USING(
  EXISTS(SELECT 1 FROM organization_customers c WHERE c.id=loyalty_wallets.account_id)
);
REVOKE INSERT,UPDATE,DELETE ON loyalty_wallets FROM atacuisine_app;
CREATE OR REPLACE FUNCTION app.ai_history(rid text, lim integer DEFAULT 20)
 RETURNS TABLE(delta integer, kind text, engine text, detail text, created_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT l.delta,l.kind,l.engine,l.detail,l.created_at FROM app.ai_ledger l
  JOIN restaurants r ON r.organization_id=l.organization_id
  WHERE r.id=rid AND app.has_restaurant(rid) AND (l.restaurant_id=rid OR l.restaurant_id IS NULL)
  ORDER BY l.created_at DESC, l.id DESC LIMIT least(greatest(lim,1),100)
$$;

-- 4. Moindre privilège. scripts/migrate.ts accordait tout à chaque déploiement et annulait
--    ces restrictions ; il n'accorde plus rien, et les bases déjà déployées sont corrigées ici.
GRANT USAGE ON SCHEMA public,app TO atacuisine_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO atacuisine_app;
GRANT atacuisine_app TO atacuisine_worker;
GRANT EXECUTE ON FUNCTION app.organization_plan(text),app.referral_summary(text),app.referral_leaderboard(text) TO atacuisine_app;
REVOKE ALL ON FUNCTION
  app.addon_purchase_apply(text,text,text,text,integer),
  app.addon_purchase_by_intent(text),
  app.addon_purchase_lock(text),
  app.addon_reconcile(text,text,text,text,timestamp with time zone),
  app.addon_renewal(text,text,boolean),
  app.ai_credit(text,integer,text,text,bigint),
  app.claim_jobs(text),
  app.configure_organization_plan(text,integer,integer,text[]),
  app.ensure_referral_code(text),
  app.fin_capture_payment(),
  app.fin_insert_entry(text,text,text,date,text,text,jsonb,text),
  app.guard_table_quota(),
  app.paying_referrals(text),
  app.queue_seo_audit(text,text),
  app.refresh_referrer(text),
  app.rename_zone_tables(),
  app.setup_floor_zone(),
  app.studio_credit_apply(text,text,text,boolean,integer,boolean),
  app.studio_credit_lock(text),
  app.sync_table_zone()
FROM PUBLIC,atacuisine_app;
REVOKE ALL ON fin_counters,addon_catalog_events,schema_versions FROM atacuisine_app;
REVOKE ALL ON addon_categories FROM atacuisine_app; GRANT SELECT ON addon_categories TO atacuisine_app;
REVOKE ALL ON addon_license_events FROM atacuisine_app; GRANT SELECT ON addon_license_events TO atacuisine_app;
REVOKE ALL ON addon_licenses FROM atacuisine_app; GRANT SELECT ON addon_licenses TO atacuisine_app;
REVOKE ALL ON addon_products FROM atacuisine_app; GRANT SELECT ON addon_products TO atacuisine_app;
REVOKE ALL ON addon_purchases FROM atacuisine_app; GRANT SELECT ON addon_purchases TO atacuisine_app;
REVOKE ALL ON addon_subscriptions FROM atacuisine_app; GRANT INSERT, SELECT ON addon_subscriptions TO atacuisine_app;
REVOKE ALL ON connect_accounts FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON connect_accounts TO atacuisine_app;
REVOKE ALL ON customer_messages FROM atacuisine_app; GRANT INSERT, SELECT ON customer_messages TO atacuisine_app;
REVOKE ALL ON fin_accounts FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_accounts TO atacuisine_app;
REVOKE ALL ON fin_bank_accounts FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_bank_accounts TO atacuisine_app;
REVOKE ALL ON fin_bank_imports FROM atacuisine_app; GRANT INSERT, SELECT ON fin_bank_imports TO atacuisine_app;
REVOKE ALL ON fin_bank_match_targets FROM atacuisine_app; GRANT DELETE, INSERT, SELECT ON fin_bank_match_targets TO atacuisine_app;
REVOKE ALL ON fin_bank_matches FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_bank_matches TO atacuisine_app;
REVOKE ALL ON fin_bank_transactions FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_bank_transactions TO atacuisine_app;
REVOKE ALL ON fin_category_vat FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_category_vat TO atacuisine_app;
REVOKE ALL ON fin_company FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_company TO atacuisine_app;
REVOKE ALL ON fin_documents FROM atacuisine_app; GRANT INSERT, SELECT ON fin_documents TO atacuisine_app;
REVOKE ALL ON fin_entries FROM atacuisine_app; GRANT SELECT ON fin_entries TO atacuisine_app;
REVOKE ALL ON fin_entry_lines FROM atacuisine_app; GRANT SELECT ON fin_entry_lines TO atacuisine_app;
REVOKE ALL ON fin_events FROM atacuisine_app; GRANT SELECT ON fin_events TO atacuisine_app;
REVOKE ALL ON fin_invoice_payments FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_invoice_payments TO atacuisine_app;
REVOKE ALL ON fin_invoice_sequences FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_invoice_sequences TO atacuisine_app;
REVOKE ALL ON fin_invoices FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_invoices TO atacuisine_app;
REVOKE ALL ON fin_product_vat FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_product_vat TO atacuisine_app;
REVOKE ALL ON fin_review_items FROM atacuisine_app; GRANT SELECT, UPDATE ON fin_review_items TO atacuisine_app;
REVOKE ALL ON fin_settings FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_settings TO atacuisine_app;
REVOKE ALL ON fin_supplier_invoices FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_supplier_invoices TO atacuisine_app;
REVOKE ALL ON fin_tax_rates FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON fin_tax_rates TO atacuisine_app;
REVOKE ALL ON hr_absences FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON hr_absences TO atacuisine_app;
REVOKE ALL ON hr_contracts FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON hr_contracts TO atacuisine_app;
REVOKE ALL ON hr_payroll_periods FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON hr_payroll_periods TO atacuisine_app;
REVOKE ALL ON hr_settings FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON hr_settings TO atacuisine_app;
REVOKE ALL ON loading_screen_settings FROM atacuisine_app; GRANT SELECT ON loading_screen_settings TO atacuisine_app;
REVOKE ALL ON module_setting_events FROM atacuisine_app; GRANT SELECT ON module_setting_events TO atacuisine_app;
REVOKE ALL ON module_settings FROM atacuisine_app; GRANT SELECT ON module_settings TO atacuisine_app;
REVOKE ALL ON online_payments FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON online_payments TO atacuisine_app;
REVOKE ALL ON online_payouts FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON online_payouts TO atacuisine_app;
REVOKE ALL ON pilotage_preferences FROM atacuisine_app; GRANT INSERT, SELECT, UPDATE ON pilotage_preferences TO atacuisine_app;
REVOKE ALL ON seo_ai_observations FROM atacuisine_app; GRANT DELETE, INSERT, SELECT ON seo_ai_observations TO atacuisine_app;
REVOKE ALL ON seo_audits FROM atacuisine_app; GRANT SELECT ON seo_audits TO atacuisine_app;
REVOKE ALL ON studio_credit_ledger FROM atacuisine_app; GRANT SELECT ON studio_credit_ledger TO atacuisine_app;
REVOKE ALL ON studio_credit_orders FROM atacuisine_app; GRANT SELECT ON studio_credit_orders TO atacuisine_app;
REVOKE ALL ON supplier_ingredients FROM atacuisine_app; GRANT DELETE, INSERT, SELECT ON supplier_ingredients TO atacuisine_app;

INSERT INTO schema_versions VALUES(60);
