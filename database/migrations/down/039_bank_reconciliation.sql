-- Retour arrière de 039, réservé à la préproduction. Refusé dès qu’un relevé existe.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM fin_bank_imports) OR EXISTS(SELECT 1 FROM fin_bank_accounts) THEN
    RAISE EXCEPTION 'Retour arrière refusé : des données bancaires existent.';
  END IF;
END $$;
DROP FUNCTION app.fin_reverse_event(text,text,text);
DROP TABLE fin_bank_match_targets;
DROP TABLE fin_bank_matches;
DROP TABLE fin_bank_transactions;
DROP TABLE fin_bank_imports;
DROP TABLE fin_bank_accounts;
DROP FUNCTION app.fin_bank_tx_guard();
ALTER TABLE fin_entries DROP CONSTRAINT fin_entries_kind_check;
ALTER TABLE fin_entries ADD CONSTRAINT fin_entries_kind_check CHECK (kind IN ('sale_payment','reversal','payout','payout_reversal','purchase','purchase_payment'));
ALTER TABLE fin_events DROP CONSTRAINT fin_events_type_check;
ALTER TABLE fin_events ADD CONSTRAINT fin_events_type_check CHECK (type IN ('payment.confirmed','payout.sent','payout.reversed','invoice.validated','invoice.paid'));
ALTER TABLE fin_settings DROP COLUMN bank_auto_match;
DELETE FROM schema_versions WHERE version=39;
