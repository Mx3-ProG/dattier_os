-- Retour arrière de 038, réservé à la préproduction. Refusé dès qu’un justificatif existe :
-- il y a alors une obligation de conservation et des écritures à préserver.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM fin_documents) OR EXISTS(SELECT 1 FROM fin_entries WHERE journal<>'VE') THEN
    RAISE EXCEPTION 'Retour arrière refusé : des factures fournisseurs existent.';
  END IF;
END $$;
DROP FUNCTION app.fin_reverse_invoice(text,text,text);
DROP FUNCTION app.fin_post_invoice(text,text,text,text,integer,text,text,date,jsonb,text);
DROP FUNCTION app.fin_insert_entry(text,text,text,date,text,text,jsonb,text);
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
DROP TABLE fin_supplier_invoices;
DROP TABLE fin_documents;
ALTER TABLE fin_entries DROP CONSTRAINT fin_entries_kind_check;
ALTER TABLE fin_entries ADD CONSTRAINT fin_entries_kind_check CHECK (kind IN ('sale_payment','reversal','payout','payout_reversal'));
ALTER TABLE fin_events DROP CONSTRAINT fin_events_type_check;
ALTER TABLE fin_events ADD CONSTRAINT fin_events_type_check CHECK (type IN ('payment.confirmed','payout.sent','payout.reversed'));
DELETE FROM schema_versions WHERE version=38;
