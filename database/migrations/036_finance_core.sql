-- Socle financier : pré-comptabilité à valider par l’expert-comptable.
-- Ce socle ne vaut ni comptabilité certifiée, ni conformité d’un système de caisse.
-- Retour arrière (préproduction uniquement) : down/036_finance_core.sql.

-- Reprise des défauts corrigés au lot 0, sans toucher aux montants encaissés.
UPDATE payment_declarations p
   SET discount=c.discount,promo_id=coalesce(p.promo_id,c.promo_id),customer_id=coalesce(p.customer_id,c.customer_id)
  FROM shop_orders c
 WHERE c.order_id=p.order_id AND p.discount=0 AND c.discount>0;
UPDATE orders o SET status='paid'
 WHERE o.status='active'
   AND EXISTS(SELECT 1 FROM shop_orders c WHERE c.order_id=o.id AND c.payment_status='paid')
   AND EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id)
   AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.status NOT IN ('served','cancelled'));

-- Une déclaration de règlement ne se modifie plus : elle se corrige par contre-passation.
CREATE TRIGGER payment_append_only BEFORE UPDATE OR DELETE ON payment_declarations
 FOR EACH ROW EXECUTE FUNCTION app.immutable_event();

CREATE TABLE fin_settings (
  restaurant_id text PRIMARY KEY REFERENCES restaurants ON DELETE CASCADE,
  -- « unknown » tant que l’établissement n’a pas déclaré son régime : rien n’est déduit.
  vat_regime text NOT NULL DEFAULT 'unknown' CHECK (vat_regime IN ('unknown','normal','franchise')),
  cash_account text NOT NULL DEFAULT '530',
  card_account text NOT NULL DEFAULT '5115',
  other_account text NOT NULL DEFAULT '5118',
  sales_account text NOT NULL DEFAULT '707',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE fin_accounts (
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[1-8][0-9]{1,9}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  PRIMARY KEY (restaurant_id, code)
);
CREATE TABLE fin_tax_rates (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  -- Points de base : 1000 = 10 %. Un taux utilisé ne change pas : on en crée un autre.
  rate_bp integer NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000),
  sales_account text NOT NULL,
  vat_account text NOT NULL,
  archived_at timestamptz,
  UNIQUE (restaurant_id, id),
  UNIQUE (restaurant_id, rate_bp, sales_account, vat_account),
  FOREIGN KEY (restaurant_id, sales_account) REFERENCES fin_accounts(restaurant_id, code),
  FOREIGN KEY (restaurant_id, vat_account) REFERENCES fin_accounts(restaurant_id, code)
);
-- Table séparée de menu_items : menu_items est servi tel quel aux canaux publics.
CREATE TABLE fin_product_vat (
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  menu_id text NOT NULL REFERENCES menu_items ON DELETE CASCADE,
  onsite_rate_id text,
  takeaway_rate_id text,
  PRIMARY KEY (restaurant_id, menu_id),
  FOREIGN KEY (restaurant_id, onsite_rate_id) REFERENCES fin_tax_rates(restaurant_id, id),
  FOREIGN KEY (restaurant_id, takeaway_rate_id) REFERENCES fin_tax_rates(restaurant_id, id)
);
-- TVA figée sur la ligne vendue. NULL = indéterminée : l’opération sera à vérifier.
ALTER TABLE order_items
  ADD COLUMN vat_rate_id text REFERENCES fin_tax_rates,
  ADD COLUMN vat_rate_bp integer CHECK (vat_rate_bp BETWEEN 0 AND 10000);

CREATE TABLE fin_events (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  type text NOT NULL CHECK (type IN ('payment.confirmed')),
  dedupe_key text NOT NULL,
  source_id text NOT NULL,
  amount integer NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, dedupe_key)
);
CREATE TABLE fin_counters (
  restaurant_id text PRIMARY KEY REFERENCES restaurants,
  last_number bigint NOT NULL DEFAULT 0,
  last_hash text NOT NULL DEFAULT ''
);
CREATE TABLE fin_entries (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  event_id text NOT NULL REFERENCES fin_events,
  kind text NOT NULL CHECK (kind IN ('sale_payment','reversal')),
  -- Une écriture par événement, sauf après contre-passation (révision suivante).
  revision integer NOT NULL DEFAULT 0,
  number bigint NOT NULL,
  entry_date date NOT NULL,
  journal text NOT NULL,
  label text NOT NULL,
  reverses_entry_id text REFERENCES fin_entries,
  previous_hash text NOT NULL,
  hash text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, event_id, kind, revision),
  UNIQUE (restaurant_id, number),
  UNIQUE (reverses_entry_id)
);
CREATE INDEX fin_entries_scope ON fin_entries(restaurant_id, number DESC);
CREATE INDEX fin_entries_event ON fin_entries(event_id);
CREATE TABLE fin_entry_lines (
  entry_id text NOT NULL REFERENCES fin_entries,
  line_no integer NOT NULL,
  restaurant_id text NOT NULL,
  account_code text NOT NULL,
  debit bigint NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit bigint NOT NULL DEFAULT 0 CHECK (credit >= 0),
  label text NOT NULL,
  PRIMARY KEY (entry_id, line_no),
  CHECK ((debit > 0) <> (credit > 0)),
  FOREIGN KEY (restaurant_id, account_code) REFERENCES fin_accounts(restaurant_id, code)
);
CREATE TABLE fin_review_items (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  event_id text NOT NULL REFERENCES fin_events,
  kind text NOT NULL CHECK (kind IN ('vat_undetermined','amount_mismatch','correction')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  note text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fin_review_one_open ON fin_review_items(restaurant_id, event_id) WHERE status='open';
CREATE INDEX fin_review_scope ON fin_review_items(restaurant_id, status, created_at DESC);
CREATE INDEX fin_review_event ON fin_review_items(event_id);

-- Dernier rempart : une écriture déséquilibrée fait échouer la transaction entière.
CREATE FUNCTION app.fin_check_balance() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF (SELECT sum(debit)<>sum(credit) FROM fin_entry_lines WHERE entry_id=NEW.entry_id) THEN RAISE EXCEPTION 'Écriture déséquilibrée.'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER fin_lines_balanced AFTER INSERT ON fin_entry_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.fin_check_balance();
CREATE TRIGGER fin_events_append_only BEFORE UPDATE OR DELETE ON fin_events FOR EACH ROW EXECUTE FUNCTION app.immutable_event();
CREATE TRIGGER fin_entries_append_only BEFORE UPDATE OR DELETE ON fin_entries FOR EACH ROW EXECUTE FUNCTION app.immutable_event();
CREATE TRIGGER fin_lines_append_only BEFORE UPDATE OR DELETE ON fin_entry_lines FOR EACH ROW EXECUTE FUNCTION app.immutable_event();

-- Connexion directe du rôle propriétaire (démo locale, migrations) : même règle que app.restaurant_plan.
CREATE FUNCTION app.fin_owner_session() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT session_user=current_user AND current_setting('role')='none' $$;
-- Membre connecté de l’établissement : jamais un canal public.
CREATE FUNCTION app.fin_member(rid text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.public',true),'')<>'true' AND app.user_id() IS NOT NULL AND app.in_restaurant(rid) $$;
-- Accès aux chiffres : mêmes rôles que la permission métier « finance ».
CREATE FUNCTION app.fin_access(rid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT app.fin_member(rid) AND (
    app.org_admin((SELECT organization_id FROM restaurants WHERE id=rid))
    OR EXISTS(SELECT 1 FROM memberships m WHERE m.restaurant_id=rid AND m.profile_id=app.user_id() AND m.role IN ('OWNER','SUPER_ADMIN','ACCOUNTANT'))
    OR EXISTS(SELECT 1 FROM support_grants g WHERE g.profile_id=app.user_id() AND g.restaurant_id=rid AND g.expires_at>now() AND g.revoked_at IS NULL)
  ) $$;

ALTER TABLE fin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_product_vat ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_review_items ENABLE ROW LEVEL SECURITY;
-- Configuration : lisible par l’équipe (le règlement en a besoin), modifiable par la finance.
CREATE POLICY fin_read ON fin_settings FOR SELECT USING (app.fin_member(restaurant_id));
CREATE POLICY fin_write ON fin_settings FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_settings FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_accounts FOR SELECT USING (app.fin_member(restaurant_id));
CREATE POLICY fin_write ON fin_accounts FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_accounts FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_tax_rates FOR SELECT USING (app.fin_member(restaurant_id));
CREATE POLICY fin_write ON fin_tax_rates FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_tax_rates FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_product_vat FOR SELECT USING (app.fin_member(restaurant_id));
CREATE POLICY fin_write ON fin_product_vat FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_product_vat FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
-- Écritures : lecture réservée à la finance, création uniquement par les fonctions ci-dessous.
CREATE POLICY fin_read ON fin_events FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_entries FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_entry_lines FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_review_items FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_review_items FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));

-- Toute déclaration crée son événement, quel que soit le chemin d’insertion (service, import, seed).
CREATE FUNCTION app.fin_capture_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid text;
BEGIN
  rid:=coalesce((SELECT restaurant_id FROM orders WHERE id=NEW.order_id),(SELECT d.restaurant_id FROM table_sessions s JOIN dining_tables d ON d.id=s.table_id WHERE s.id=NEW.session_id));
  INSERT INTO fin_events(id,restaurant_id,type,dedupe_key,source_id,amount,occurred_at)
  VALUES(gen_random_uuid()::text,rid,'payment.confirmed','payment:'||NEW.id,NEW.id,NEW.amount,NEW.created_at)
  ON CONFLICT(restaurant_id,dedupe_key) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_financial_event AFTER INSERT ON payment_declarations FOR EACH ROW EXECUTE FUNCTION app.fin_capture_payment();

-- Fige la TVA configurée sur les lignes d’une commande. Sans configuration : reste NULL.
CREATE FUNCTION app.fin_freeze_order_vat(oid text, force boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid text; mode text;
BEGIN
  SELECT o.restaurant_id,coalesce(c.consumption,CASE WHEN o.channel='takeaway' THEN 'takeaway' ELSE 'onsite' END) INTO rid,mode
    FROM orders o LEFT JOIN shop_orders c ON c.order_id=o.id WHERE o.id=oid;
  IF rid IS NULL OR NOT (app.fin_owner_session() OR app.in_restaurant(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  UPDATE order_items i SET vat_rate_id=r.id,vat_rate_bp=r.rate_bp
    FROM fin_product_vat p JOIN fin_tax_rates r ON r.restaurant_id=p.restaurant_id AND r.id=CASE WHEN mode='takeaway' THEN p.takeaway_rate_id ELSE p.onsite_rate_id END
   WHERE i.order_id=oid AND p.restaurant_id=rid AND p.menu_id=i.menu_id AND r.archived_at IS NULL AND (force OR i.vat_rate_bp IS NULL);
END $$;

CREATE FUNCTION app.fin_insert_entry(rid text,ev text,entry_kind text,day date,entry_label text,reverses text,lines jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE counter fin_counters; rev integer; entry text:=gen_random_uuid()::text; digest text; total_debit bigint; total_credit bigint; n integer; canonical jsonb;
BEGIN
  -- Forme unique : la vérification de la chaîne recalcule exactement ce contenu.
  SELECT jsonb_agg(jsonb_build_object('account',l->>'account','debit',(l->>'debit')::bigint,'credit',(l->>'credit')::bigint,'label',l->>'label') ORDER BY o) INTO lines FROM jsonb_array_elements(lines) WITH ORDINALITY t(l,o);
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  SELECT * INTO counter FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  SELECT count(*),coalesce(sum((l->>'debit')::bigint),0),coalesce(sum((l->>'credit')::bigint),0) INTO n,total_debit,total_credit FROM jsonb_array_elements(lines) l;
  IF n<2 OR total_debit<>total_credit OR total_debit<=0 THEN RAISE EXCEPTION 'Écriture déséquilibrée.'; END IF;
  SELECT count(*) INTO rev FROM fin_entries WHERE restaurant_id=rid AND event_id=ev AND kind=entry_kind;
  canonical:=jsonb_build_array(rid,counter.last_number+1,day::text,'VE',entry_kind,ev,entry_label,coalesce(reverses,''),lines);
  digest:=encode(sha256(convert_to(counter.last_hash||canonical::text,'UTF8')),'hex');
  INSERT INTO fin_entries(id,restaurant_id,event_id,kind,revision,number,entry_date,journal,label,reverses_entry_id,previous_hash,hash,created_by)
  VALUES(entry,rid,ev,entry_kind,rev,counter.last_number+1,day,'VE',entry_label,reverses,counter.last_hash,digest,app.user_id());
  INSERT INTO fin_entry_lines(entry_id,line_no,restaurant_id,account_code,debit,credit,label)
  SELECT entry,o::integer,rid,l->>'account',(l->>'debit')::bigint,(l->>'credit')::bigint,l->>'label' FROM jsonb_array_elements(lines) WITH ORDINALITY t(l,o);
  UPDATE fin_counters SET last_number=counter.last_number+1,last_hash=digest WHERE restaurant_id=rid;
  RETURN entry;
END $$;
REVOKE ALL ON FUNCTION app.fin_insert_entry(text,text,text,date,text,text,jsonb) FROM PUBLIC;

-- Idempotent : un événement déjà comptabilisé renvoie son écriture, sans en créer une seconde.
CREATE FUNCTION app.fin_post_entry(rid text,key text,entry_label text,lines jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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

CREATE FUNCTION app.fin_open_review(rid text,key text,review_kind text,review_message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ev text;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_member(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  SELECT id INTO ev FROM fin_events WHERE restaurant_id=rid AND dedupe_key=key;
  IF ev IS NULL THEN RAISE EXCEPTION 'Élément introuvable dans cet établissement.'; END IF;
  INSERT INTO fin_review_items(id,restaurant_id,event_id,kind,message) VALUES(gen_random_uuid()::text,rid,ev,review_kind,left(review_message,500))
  ON CONFLICT(restaurant_id,event_id) WHERE status='open' DO UPDATE SET kind=excluded.kind,message=excluded.message;
END $$;

-- Contre-passation : l’écriture d’origine reste, une écriture inverse l’annule, et l’opération revient à vérifier.
CREATE FUNCTION app.fin_reverse_entry(rid text,target text,reason text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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

-- Recalcule toute la chaîne : détecte une écriture altérée, retirée ou insérée.
CREATE FUNCTION app.fin_verify_chain(rid text) RETURNS TABLE(checked bigint,broken_at bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e fin_entries; previous text:=''; expected bigint:=0; lines jsonb; digest text; last_known fin_counters;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_access(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  FOR e IN SELECT * FROM fin_entries WHERE restaurant_id=rid ORDER BY number LOOP
    expected:=expected+1;
    SELECT jsonb_agg(jsonb_build_object('account',account_code,'debit',debit,'credit',credit,'label',label) ORDER BY line_no) INTO lines FROM fin_entry_lines WHERE entry_id=e.id;
    digest:=encode(sha256(convert_to(previous||jsonb_build_array(rid,e.number,e.entry_date::text,e.journal,e.kind,e.event_id,e.label,coalesce(e.reverses_entry_id,''),lines)::text,'UTF8')),'hex');
    IF e.number<>expected OR e.previous_hash<>previous OR e.hash<>digest THEN checked:=expected-1; broken_at:=e.number; RETURN NEXT; RETURN; END IF;
    previous:=e.hash;
  END LOOP;
  SELECT * INTO last_known FROM fin_counters WHERE restaurant_id=rid;
  checked:=expected;
  broken_at:=CASE WHEN coalesce(last_known.last_number,0)<>expected OR coalesce(last_known.last_hash,'')<>previous THEN expected+1 END;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION app.fin_owner_session(),app.fin_member(text),app.fin_access(text),app.fin_capture_payment(),app.fin_freeze_order_vat(text,boolean),app.fin_post_entry(text,text,text,jsonb),app.fin_open_review(text,text,text,text),app.fin_reverse_entry(text,text,text),app.fin_verify_chain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fin_owner_session(),app.fin_member(text),app.fin_access(text),app.fin_freeze_order_vat(text,boolean),app.fin_post_entry(text,text,text,jsonb),app.fin_open_review(text,text,text,text),app.fin_reverse_entry(text,text,text),app.fin_verify_chain(text) TO atacuisine_app;
GRANT SELECT,INSERT,UPDATE ON fin_settings,fin_accounts,fin_tax_rates,fin_product_vat TO atacuisine_app;
GRANT SELECT,UPDATE ON fin_review_items TO atacuisine_app;
GRANT SELECT ON fin_events,fin_entries,fin_entry_lines TO atacuisine_app;

-- Reprise de l’historique : un événement par règlement. Aucune écriture n’est déduite ici :
-- sans TVA connue, ces opérations seront présentées comme « à vérifier ».
INSERT INTO fin_events(id,restaurant_id,type,dedupe_key,source_id,amount,occurred_at)
SELECT gen_random_uuid()::text,coalesce(o.restaurant_id,t.restaurant_id),'payment.confirmed','payment:'||p.id,p.id,p.amount,p.created_at
  FROM payment_declarations p
  LEFT JOIN orders o ON o.id=p.order_id
  LEFT JOIN table_sessions s ON s.id=p.session_id
  LEFT JOIN dining_tables t ON t.id=s.table_id
ON CONFLICT(restaurant_id,dedupe_key) DO NOTHING;

INSERT INTO schema_versions(version) VALUES (36);
