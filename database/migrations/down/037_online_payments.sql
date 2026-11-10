-- Retour arrière de 037, réservé à la préproduction. Refusé dès qu’un paiement en ligne
-- existe : ces écritures et ces fonds ne doivent pas disparaître par un script.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM online_payments) OR EXISTS(SELECT 1 FROM online_payouts) OR EXISTS(SELECT 1 FROM connect_accounts) THEN
    RAISE EXCEPTION 'Retour arrière refusé : des données de paiement en ligne existent.';
  END IF;
END $$;
DROP FUNCTION app.online_release_due(text,text,text);
DROP FUNCTION app.online_restaurant_for(text);
DROP FUNCTION app.online_ready(text);
DROP FUNCTION app.fin_post_transfer(text,text,text,text,integer,text,text,jsonb);
CREATE OR REPLACE FUNCTION app.fin_post_entry(rid text,key text,entry_label text,lines jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ev fin_events; existing text;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_member(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  SELECT * INTO ev FROM fin_events WHERE restaurant_id=rid AND dedupe_key=key;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'Élément introuvable dans cet établissement.'; END IF;
  SELECT e.id INTO existing FROM fin_entries e WHERE e.event_id=ev.id AND e.kind='sale_payment' AND NOT EXISTS(SELECT 1 FROM fin_entries x WHERE x.reverses_entry_id=e.id) LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  RETURN app.fin_insert_entry(rid,ev.id,'sale_payment',(ev.occurred_at AT TIME ZONE 'Europe/Paris')::date,entry_label,NULL,lines);
END $$;
CREATE OR REPLACE FUNCTION app.fin_open_review(rid text,key text,review_kind text,review_message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ev text;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_member(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  SELECT id INTO ev FROM fin_events WHERE restaurant_id=rid AND dedupe_key=key;
  IF ev IS NULL THEN RAISE EXCEPTION 'Élément introuvable dans cet établissement.'; END IF;
  INSERT INTO fin_review_items(id,restaurant_id,event_id,kind,message) VALUES(gen_random_uuid()::text,rid,ev,review_kind,left(review_message,500))
  ON CONFLICT(restaurant_id,event_id) WHERE status='open' DO UPDATE SET kind=excluded.kind,message=excluded.message;
END $$;
CREATE OR REPLACE FUNCTION app.fin_reverse_entry(rid text,target text,reason text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE origin fin_entries; lines jsonb; created text;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_access(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  SELECT * INTO origin FROM fin_entries WHERE id=target AND restaurant_id=rid;
  IF origin.id IS NULL THEN RAISE EXCEPTION 'Élément introuvable dans cet établissement.'; END IF;
  IF origin.kind<>'sale_payment' OR EXISTS(SELECT 1 FROM fin_entries WHERE reverses_entry_id=target) THEN RAISE EXCEPTION 'Écriture déjà contre-passée.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('account',account_code,'debit',credit,'credit',debit,'label',label) ORDER BY line_no) INTO lines FROM fin_entry_lines WHERE entry_id=target;
  created:=app.fin_insert_entry(rid,origin.event_id,'reversal',(now() AT TIME ZONE 'Europe/Paris')::date,left('Contre-passation : '||reason,200),target,lines);
  INSERT INTO fin_review_items(id,restaurant_id,event_id,kind,message) VALUES(gen_random_uuid()::text,rid,origin.event_id,'correction',left('Écriture contre-passée : '||reason,500))
  ON CONFLICT(restaurant_id,event_id) WHERE status='open' DO NOTHING;
  RETURN created;
END $$;
CREATE OR REPLACE FUNCTION app.fin_freeze_order_vat(oid text, force boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid text; mode text;
BEGIN
  SELECT o.restaurant_id,coalesce(c.consumption,CASE WHEN o.channel='takeaway' THEN 'takeaway' ELSE 'onsite' END) INTO rid,mode
    FROM orders o LEFT JOIN shop_orders c ON c.order_id=o.id WHERE o.id=oid;
  IF rid IS NULL OR NOT (app.fin_owner_session() OR app.in_restaurant(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  UPDATE order_items i SET vat_rate_id=r.id,vat_rate_bp=r.rate_bp
    FROM fin_product_vat p JOIN fin_tax_rates r ON r.restaurant_id=p.restaurant_id AND r.id=CASE WHEN mode='takeaway' THEN p.takeaway_rate_id ELSE p.onsite_rate_id END
   WHERE i.order_id=oid AND p.restaurant_id=rid AND p.menu_id=i.menu_id AND r.archived_at IS NULL AND (force OR i.vat_rate_bp IS NULL);
END $$;
DROP POLICY worker_update ON fin_review_items;
DROP POLICY worker_read ON fin_review_items;
DROP POLICY worker_read ON fin_events;
DROP POLICY worker_read ON fin_entries;
DROP POLICY worker_read ON fin_tax_rates;
DROP POLICY worker_read ON fin_settings;
DROP TABLE online_payments;
DROP TABLE online_payouts;
DROP TABLE connect_accounts;
ALTER TABLE fin_entries DROP CONSTRAINT fin_entries_kind_check;
ALTER TABLE fin_entries ADD CONSTRAINT fin_entries_kind_check CHECK (kind IN ('sale_payment','reversal'));
ALTER TABLE fin_events DROP CONSTRAINT fin_events_type_check;
ALTER TABLE fin_events ADD CONSTRAINT fin_events_type_check CHECK (type IN ('payment.confirmed'));
ALTER TABLE fin_settings DROP COLUMN online_account, DROP COLUMN transfer_account, DROP COLUMN commission_account;
ALTER TABLE payment_declarations DROP CONSTRAINT payment_declarations_method_check;
ALTER TABLE payment_declarations ADD CONSTRAINT payment_declarations_method_check CHECK (method IN ('card','cash','other'));
ALTER TABLE payment_declarations ALTER COLUMN actor SET NOT NULL;
DROP TABLE fin_category_vat;
DROP FUNCTION app.fin_system();
DELETE FROM schema_versions WHERE version=37;
