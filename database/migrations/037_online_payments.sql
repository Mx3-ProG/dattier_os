-- TVA par catégorie et paiements en ligne : Dattier encaisse via Stripe Connect
-- (charges et transferts séparés), puis transfère au restaurant après le délai de
-- sécurité et les contrôles anti-fraude. Le restaurateur reste responsable de sa TVA.
-- Ne pas activer en production sans validation juridique et comptable.
-- Retour arrière (préproduction uniquement) : down/037_online_payments.sql.

-- Le worker agit sous son propre rôle, que le rôle web ne peut pas endosser.
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='atacuisine_worker') THEN CREATE ROLE atacuisine_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$;
GRANT atacuisine_app TO atacuisine_worker;
CREATE FUNCTION app.fin_system() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.fin_owner_session() OR current_setting('role')='atacuisine_worker' $$;

-- Taux par catégorie : s’applique aux produits sans taux propre.
CREATE TABLE fin_category_vat (
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  category text NOT NULL,
  onsite_rate_id text,
  takeaway_rate_id text,
  PRIMARY KEY (restaurant_id, category),
  FOREIGN KEY (restaurant_id, onsite_rate_id) REFERENCES fin_tax_rates(restaurant_id, id),
  FOREIGN KEY (restaurant_id, takeaway_rate_id) REFERENCES fin_tax_rates(restaurant_id, id)
);
ALTER TABLE fin_category_vat ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_read ON fin_category_vat FOR SELECT USING (app.fin_member(restaurant_id));
CREATE POLICY fin_write ON fin_category_vat FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_category_vat FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
GRANT SELECT,INSERT,UPDATE ON fin_category_vat TO atacuisine_app;

CREATE OR REPLACE FUNCTION app.fin_freeze_order_vat(oid text, force boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid text; mode text;
BEGIN
  SELECT o.restaurant_id,coalesce(c.consumption,CASE WHEN o.channel='takeaway' THEN 'takeaway' ELSE 'onsite' END) INTO rid,mode
    FROM orders o LEFT JOIN shop_orders c ON c.order_id=o.id WHERE o.id=oid;
  IF rid IS NULL OR NOT (app.fin_owner_session() OR app.in_restaurant(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  UPDATE order_items i SET vat_rate_id=r.id,vat_rate_bp=r.rate_bp
    FROM menu_items m
    LEFT JOIN fin_product_vat p ON p.restaurant_id=m.restaurant_id AND p.menu_id=m.id
    LEFT JOIN fin_category_vat k ON k.restaurant_id=m.restaurant_id AND k.category=m.category
    JOIN fin_tax_rates r ON r.restaurant_id=m.restaurant_id AND r.id=CASE WHEN mode='takeaway' THEN coalesce(p.takeaway_rate_id,k.takeaway_rate_id) ELSE coalesce(p.onsite_rate_id,k.onsite_rate_id) END
   WHERE i.order_id=oid AND m.id=i.menu_id AND m.restaurant_id=rid AND r.archived_at IS NULL AND (force OR i.vat_rate_bp IS NULL);
END $$;

-- Règlements en ligne : pas de membre de l’équipe à l’origine, un mode de plus.
ALTER TABLE payment_declarations ALTER COLUMN actor DROP NOT NULL;
ALTER TABLE payment_declarations DROP CONSTRAINT payment_declarations_method_check;
ALTER TABLE payment_declarations ADD CHECK (method IN ('card','cash','other','online'));

ALTER TABLE fin_settings
  ADD COLUMN online_account text NOT NULL DEFAULT '4671',
  ADD COLUMN transfer_account text NOT NULL DEFAULT '580',
  ADD COLUMN commission_account text NOT NULL DEFAULT '6222';
INSERT INTO fin_accounts(restaurant_id,code,label)
SELECT s.restaurant_id,a.code,a.label FROM fin_settings s
CROSS JOIN (VALUES ('4671','Ventes en ligne à recevoir de la plateforme'),('580','Virements en cours'),('6222','Commissions de la plateforme')) a(code,label)
ON CONFLICT DO NOTHING;

ALTER TABLE fin_events DROP CONSTRAINT fin_events_type_check;
ALTER TABLE fin_events ADD CHECK (type IN ('payment.confirmed','payout.sent','payout.reversed'));
ALTER TABLE fin_entries DROP CONSTRAINT fin_entries_kind_check;
ALTER TABLE fin_entries ADD CHECK (kind IN ('sale_payment','reversal','payout','payout_reversal'));

CREATE TABLE connect_accounts (
  restaurant_id text PRIMARY KEY REFERENCES restaurants,
  stripe_account_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','restricted')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE online_payouts (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  gross integer NOT NULL CHECK (gross>0),
  commission integer NOT NULL CHECK (commission>=0),
  stripe_fee_estimate integer NOT NULL CHECK (stripe_fee_estimate>=0),
  amount integer NOT NULL CHECK (amount>0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
  reason text NOT NULL CHECK (reason IN ('schedule','request')),
  requested_by text,
  stripe_transfer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX online_payouts_scope ON online_payouts(restaurant_id,created_at DESC);
CREATE TABLE online_payments (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  order_id text NOT NULL UNIQUE REFERENCES orders,
  session_id text NOT NULL UNIQUE,
  payment_intent_id text UNIQUE,
  gross integer NOT NULL CHECK (gross>0),
  commission integer NOT NULL CHECK (commission>=0),
  stripe_fee_estimate integer NOT NULL CHECK (stripe_fee_estimate>=0),
  net integer NOT NULL CHECK (net>=0),
  hold_days integer NOT NULL CHECK (hold_days>=0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','released','disputed','refunded','manual_review','expired')),
  -- « pending » tant que Stripe n’a pas noté le paiement, « review » s’il faut un contrôle humain.
  risk_status text NOT NULL DEFAULT 'pending' CHECK (risk_status IN ('pending','clear','review')),
  risk_level text,
  paid_at timestamptz,
  available_at timestamptz,
  payout_id text REFERENCES online_payouts,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (commission+stripe_fee_estimate+net=gross)
);
CREATE INDEX online_payments_due ON online_payments(restaurant_id,available_at) WHERE status='paid';
CREATE INDEX online_payments_scope ON online_payments(restaurant_id,created_at DESC);

ALTER TABLE connect_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_read ON connect_accounts FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON connect_accounts FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON connect_accounts FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON online_payouts FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON online_payments FOR SELECT USING (app.fin_access(restaurant_id));
-- Le canal public ne fait que déposer le paiement en attente de sa propre commande.
CREATE POLICY public_start ON online_payments FOR INSERT WITH CHECK (app.in_restaurant(restaurant_id) AND status='pending' AND paid_at IS NULL AND payout_id IS NULL);

-- Le worker traite les notifications Stripe : aucun autre rôle n’a ces droits.
CREATE POLICY worker_all ON connect_accounts TO atacuisine_worker USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
CREATE POLICY worker_all ON online_payouts TO atacuisine_worker USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
CREATE POLICY worker_all ON online_payments TO atacuisine_worker USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
CREATE POLICY worker_read ON fin_settings FOR SELECT TO atacuisine_worker USING (app.in_restaurant(restaurant_id));
CREATE POLICY worker_read ON fin_tax_rates FOR SELECT TO atacuisine_worker USING (app.in_restaurant(restaurant_id));
CREATE POLICY worker_read ON fin_entries FOR SELECT TO atacuisine_worker USING (app.in_restaurant(restaurant_id));
CREATE POLICY worker_read ON fin_events FOR SELECT TO atacuisine_worker USING (app.in_restaurant(restaurant_id));
CREATE POLICY worker_read ON fin_review_items FOR SELECT TO atacuisine_worker USING (app.in_restaurant(restaurant_id));
CREATE POLICY worker_update ON fin_review_items FOR UPDATE TO atacuisine_worker USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));

CREATE OR REPLACE FUNCTION app.fin_post_entry(rid text,key text,entry_label text,lines jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ev fin_events; existing text;
BEGIN
  IF NOT (app.fin_system() OR app.fin_member(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
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
  IF NOT (app.fin_system() OR app.fin_member(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  SELECT id INTO ev FROM fin_events WHERE restaurant_id=rid AND dedupe_key=key;
  IF ev IS NULL THEN RAISE EXCEPTION 'Élément introuvable dans cet établissement.'; END IF;
  INSERT INTO fin_review_items(id,restaurant_id,event_id,kind,message) VALUES(gen_random_uuid()::text,rid,ev,review_kind,left(review_message,500))
  ON CONFLICT(restaurant_id,event_id) WHERE status='open' DO UPDATE SET kind=excluded.kind,message=excluded.message;
END $$;
CREATE OR REPLACE FUNCTION app.fin_reverse_entry(rid text,target text,reason text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE origin fin_entries; lines jsonb; created text;
BEGIN
  IF NOT (app.fin_system() OR app.fin_access(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
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

-- Écriture de versement, réservée au worker. Idempotente par événement.
CREATE FUNCTION app.fin_post_transfer(rid text,key text,event_type text,source text,total integer,entry_kind text,entry_label text,lines jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ev fin_events; existing text;
BEGIN
  IF NOT app.fin_system() THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  INSERT INTO fin_events(id,restaurant_id,type,dedupe_key,source_id,amount,occurred_at) VALUES(gen_random_uuid()::text,rid,event_type,key,source,total,now()) ON CONFLICT(restaurant_id,dedupe_key) DO NOTHING;
  SELECT * INTO ev FROM fin_events WHERE restaurant_id=rid AND dedupe_key=key;
  SELECT id INTO existing FROM fin_entries WHERE event_id=ev.id AND kind=entry_kind LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  RETURN app.fin_insert_entry(rid,ev.id,entry_kind,(now() AT TIME ZONE 'Europe/Paris')::date,entry_label,NULL,lines);
END $$;

-- Lecture minimale pour le canal public : le paiement en ligne est-il proposé ?
CREATE FUNCTION app.online_ready(rid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM connect_accounts WHERE restaurant_id=rid AND status='active') $$;
-- Rattache une notification Stripe signée à son établissement.
CREATE FUNCTION app.online_restaurant_for(intent text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT restaurant_id FROM online_payments WHERE payment_intent_id=intent $$;

-- Regroupe en un versement tout ce qui a passé le délai et les contrôles anti-fraude.
-- Atomique : une vente ne peut pas partir dans deux versements.
CREATE FUNCTION app.online_release_due(rid text,why text,who text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE payout text:=gen_random_uuid()::text; g bigint; c bigint; f bigint; n bigint;
BEGIN
  IF NOT (app.fin_system() OR app.fin_access(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  IF NOT app.online_ready(rid) THEN RAISE EXCEPTION 'Le compte de versement n’est pas encore actif.'; END IF;
  PERFORM 1 FROM connect_accounts WHERE restaurant_id=rid FOR UPDATE;
  SELECT coalesce(sum(gross),0),coalesce(sum(commission),0),coalesce(sum(stripe_fee_estimate),0),coalesce(sum(net),0) INTO g,c,f,n
    FROM online_payments WHERE restaurant_id=rid AND status='paid' AND risk_status='clear' AND available_at<=now() AND payout_id IS NULL;
  IF n<=0 THEN RETURN NULL; END IF;
  INSERT INTO online_payouts(id,restaurant_id,gross,commission,stripe_fee_estimate,amount,reason,requested_by) VALUES(payout,rid,g,c,f,n,why,who);
  UPDATE online_payments SET status='released',payout_id=payout WHERE restaurant_id=rid AND status='paid' AND risk_status='clear' AND available_at<=now() AND payout_id IS NULL;
  INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key) VALUES(gen_random_uuid()::text,rid,'stripe_payout',jsonb_build_object('payout',payout),payout);
  RETURN payout;
END $$;

REVOKE ALL ON FUNCTION app.fin_system(),app.fin_post_transfer(text,text,text,text,integer,text,text,jsonb),app.online_ready(text),app.online_restaurant_for(text),app.online_release_due(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fin_system(),app.fin_post_transfer(text,text,text,text,integer,text,text,jsonb),app.online_ready(text),app.online_restaurant_for(text),app.online_release_due(text,text,text) TO atacuisine_app;
GRANT SELECT,INSERT,UPDATE ON connect_accounts,online_payments,online_payouts TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES (37);
