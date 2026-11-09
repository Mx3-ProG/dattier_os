-- Retour arrière de 041, réservé à la préproduction. Refusé dès qu’une facture existe :
-- une facture émise doit être conservée.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM fin_invoices) OR EXISTS(SELECT 1 FROM fin_company) THEN
    RAISE EXCEPTION 'Retour arrière refusé : des factures clients existent.';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION app.fin_reverse_event(rid text,key text,reason text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE origin fin_entries; lines jsonb; total integer:=0;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_access(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  FOR origin IN
    SELECT n.* FROM fin_entries n JOIN fin_events e ON e.id=n.event_id
     WHERE n.restaurant_id=rid AND e.dedupe_key=key AND n.kind IN ('purchase_payment','bank_match')
       AND NOT EXISTS(SELECT 1 FROM fin_entries x WHERE x.reverses_entry_id=n.id)
     ORDER BY n.number DESC
  LOOP
    SELECT jsonb_agg(jsonb_build_object('account',account_code,'debit',credit,'credit',debit,'label',label) ORDER BY line_no) INTO lines FROM fin_entry_lines WHERE entry_id=origin.id;
    PERFORM app.fin_insert_entry(rid,origin.event_id,'reversal',(now() AT TIME ZONE 'Europe/Paris')::date,left('Contre-passation : '||reason,200),origin.id,lines,origin.journal);
    total:=total+1;
  END LOOP;
  RETURN total;
END $$;
DROP TABLE fin_invoice_payments;
DROP TABLE fin_invoice_lines;
DROP TABLE fin_invoices;
DROP TABLE fin_invoice_sequences;
DROP TABLE fin_company;
DROP FUNCTION app.fin_invoice_lines_guard();
DROP FUNCTION app.fin_invoice_guard();
ALTER TABLE fin_bank_matches DROP CONSTRAINT fin_bank_matches_kind_check;
ALTER TABLE fin_bank_matches ADD CONSTRAINT fin_bank_matches_kind_check CHECK (kind IN ('invoice','invoice_link','online_payout','card_batch','cash_deposit'));
ALTER TABLE fin_entries DROP CONSTRAINT fin_entries_kind_check;
ALTER TABLE fin_entries ADD CONSTRAINT fin_entries_kind_check CHECK (kind IN ('sale_payment','reversal','payout','payout_reversal','purchase','purchase_payment','bank_match'));
ALTER TABLE fin_events DROP CONSTRAINT fin_events_type_check;
ALTER TABLE fin_events ADD CONSTRAINT fin_events_type_check CHECK (type IN ('payment.confirmed','payout.sent','payout.reversed','invoice.validated','invoice.paid','bank.matched'));
DELETE FROM schema_versions WHERE version=41;
