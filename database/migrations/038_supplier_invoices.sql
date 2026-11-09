-- Factures fournisseurs : justificatif archivé, lecture assistée, validation humaine,
-- puis écritures d’achat et de paiement. Rien n’est comptabilisé sans validation.
-- Retour arrière (préproduction uniquement) : down/038_supplier_invoices.sql.

INSERT INTO fin_accounts(restaurant_id,code,label)
SELECT s.restaurant_id,a.code,a.label FROM fin_settings s
CROSS JOIN (VALUES
  ('401','Fournisseurs'),('44566','TVA déductible'),('512','Banque'),
  ('607','Achats de marchandises'),('6061','Énergie et eau'),('6063','Petit matériel et fournitures'),
  ('613','Locations'),('615','Entretien et réparations'),('6226','Honoraires'),('628','Autres charges externes')
) a(code,label)
ON CONFLICT DO NOTHING;

ALTER TABLE fin_events DROP CONSTRAINT fin_events_type_check;
ALTER TABLE fin_events ADD CHECK (type IN ('payment.confirmed','payout.sent','payout.reversed','invoice.validated','invoice.paid'));
ALTER TABLE fin_entries DROP CONSTRAINT fin_entries_kind_check;
ALTER TABLE fin_entries ADD CHECK (kind IN ('sale_payment','reversal','payout','payout_reversal','purchase','purchase_payment'));

-- Justificatif : conservé tel que reçu, jamais modifié ni supprimé par l’application.
CREATE TABLE fin_documents (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  object_key text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  bytes integer NOT NULL CHECK (bytes>0),
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, sha256)
);
CREATE TRIGGER fin_documents_append_only BEFORE UPDATE OR DELETE ON fin_documents FOR EACH ROW EXECUTE FUNCTION app.immutable_event();

CREATE TABLE fin_supplier_invoices (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  document_id text NOT NULL UNIQUE REFERENCES fin_documents,
  supplier_id text REFERENCES suppliers,
  supplier_name text,
  supplier_vat text,
  invoice_number text,
  invoice_date date,
  due_date date,
  net integer CHECK (net>=0),
  vat integer CHECK (vat>=0),
  gross integer CHECK (gross>=0),
  category text CHECK (category IN ('merchandise','energy','supplies','rent','maintenance','fees','other')),
  source text NOT NULL CHECK (source IN ('facturx','xml','ai','manual')),
  uncertain jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'to_review' CHECK (status IN ('to_review','validated','paid','cancelled')),
  dedupe_key text,
  validated_by text,
  validated_at timestamptz,
  paid_on date,
  paid_method text CHECK (paid_method IN ('bank','card','cash')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('validated','paid') OR (supplier_name IS NOT NULL AND invoice_number IS NOT NULL AND invoice_date IS NOT NULL AND net IS NOT NULL AND vat IS NOT NULL AND gross>0 AND net+vat=gross AND category IS NOT NULL AND dedupe_key IS NOT NULL)),
  CHECK (status<>'paid' OR (paid_on IS NOT NULL AND paid_method IS NOT NULL))
);
-- Une même facture d’un même fournisseur ne peut être comptabilisée deux fois.
CREATE UNIQUE INDEX fin_invoices_once ON fin_supplier_invoices(restaurant_id,dedupe_key) WHERE status IN ('validated','paid');
CREATE INDEX fin_invoices_scope ON fin_supplier_invoices(restaurant_id,status,invoice_date DESC);
CREATE INDEX fin_invoices_supplier ON fin_supplier_invoices(supplier_id);

ALTER TABLE fin_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_read ON fin_documents FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_documents FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_supplier_invoices FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_supplier_invoices FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_supplier_invoices FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
GRANT SELECT,INSERT ON fin_documents TO atacuisine_app;
GRANT SELECT,INSERT,UPDATE ON fin_supplier_invoices TO atacuisine_app;

-- Le journal devient un paramètre : VE ventes, AC achats, BQ paiements.
DROP FUNCTION app.fin_insert_entry(text,text,text,date,text,text,jsonb);
CREATE FUNCTION app.fin_insert_entry(rid text,ev text,entry_kind text,day date,entry_label text,reverses text,lines jsonb,entry_journal text DEFAULT 'VE') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE counter fin_counters; rev integer; entry text:=gen_random_uuid()::text; digest text; total_debit bigint; total_credit bigint; n integer; canonical jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('account',l->>'account','debit',(l->>'debit')::bigint,'credit',(l->>'credit')::bigint,'label',l->>'label') ORDER BY o) INTO lines FROM jsonb_array_elements(lines) WITH ORDINALITY t(l,o);
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  SELECT * INTO counter FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  SELECT count(*),coalesce(sum((l->>'debit')::bigint),0),coalesce(sum((l->>'credit')::bigint),0) INTO n,total_debit,total_credit FROM jsonb_array_elements(lines) l;
  IF n<2 OR total_debit<>total_credit OR total_debit<=0 THEN RAISE EXCEPTION 'Écriture déséquilibrée.'; END IF;
  SELECT count(*) INTO rev FROM fin_entries WHERE restaurant_id=rid AND event_id=ev AND kind=entry_kind;
  canonical:=jsonb_build_array(rid,counter.last_number+1,day::text,entry_journal,entry_kind,ev,entry_label,coalesce(reverses,''),lines);
  digest:=encode(sha256(convert_to(counter.last_hash||canonical::text,'UTF8')),'hex');
  INSERT INTO fin_entries(id,restaurant_id,event_id,kind,revision,number,entry_date,journal,label,reverses_entry_id,previous_hash,hash,created_by)
  VALUES(entry,rid,ev,entry_kind,rev,counter.last_number+1,day,entry_journal,entry_label,reverses,counter.last_hash,digest,app.user_id());
  INSERT INTO fin_entry_lines(entry_id,line_no,restaurant_id,account_code,debit,credit,label)
  SELECT entry,o::integer,rid,l->>'account',(l->>'debit')::bigint,(l->>'credit')::bigint,l->>'label' FROM jsonb_array_elements(lines) WITH ORDINALITY t(l,o);
  UPDATE fin_counters SET last_number=counter.last_number+1,last_hash=digest WHERE restaurant_id=rid;
  RETURN entry;
END $$;
REVOKE ALL ON FUNCTION app.fin_insert_entry(text,text,text,date,text,text,jsonb,text) FROM PUBLIC;

-- Écriture d’achat ou de paiement. Une seule active par événement.
CREATE FUNCTION app.fin_post_invoice(rid text,key text,event_type text,source text,total integer,entry_kind text,entry_label text,day date,lines jsonb,journal text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ev fin_events; existing text;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_access(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  INSERT INTO fin_events(id,restaurant_id,type,dedupe_key,source_id,amount,occurred_at) VALUES(gen_random_uuid()::text,rid,event_type,key,source,total,now()) ON CONFLICT(restaurant_id,dedupe_key) DO NOTHING;
  SELECT * INTO ev FROM fin_events WHERE restaurant_id=rid AND dedupe_key=key;
  SELECT e.id INTO existing FROM fin_entries e WHERE e.event_id=ev.id AND e.kind=entry_kind AND NOT EXISTS(SELECT 1 FROM fin_entries x WHERE x.reverses_entry_id=e.id) LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  RETURN app.fin_insert_entry(rid,ev.id,entry_kind,day,entry_label,NULL,lines,journal);
END $$;
-- Annule les écritures actives d’une facture par contre-passation.
CREATE FUNCTION app.fin_reverse_invoice(rid text,source text,reason text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE origin fin_entries; lines jsonb; total integer:=0;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_access(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  FOR origin IN
    SELECT n.* FROM fin_entries n JOIN fin_events e ON e.id=n.event_id
     WHERE n.restaurant_id=rid AND e.source_id=source AND n.kind IN ('purchase','purchase_payment')
       AND NOT EXISTS(SELECT 1 FROM fin_entries x WHERE x.reverses_entry_id=n.id)
     ORDER BY n.number DESC
  LOOP
    SELECT jsonb_agg(jsonb_build_object('account',account_code,'debit',credit,'credit',debit,'label',label) ORDER BY line_no) INTO lines FROM fin_entry_lines WHERE entry_id=origin.id;
    PERFORM app.fin_insert_entry(rid,origin.event_id,'reversal',(now() AT TIME ZONE 'Europe/Paris')::date,left('Contre-passation : '||reason,200),origin.id,lines,origin.journal);
    total:=total+1;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION app.fin_post_invoice(text,text,text,text,integer,text,text,date,jsonb,text),app.fin_reverse_invoice(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fin_post_invoice(text,text,text,text,integer,text,text,date,jsonb,text),app.fin_reverse_invoice(text,text,text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES (38);
