-- Alignement des bases migrées pendant le développement des lots financiers, qui ont pu
-- recevoir une version intermédiaire de 037 et 041. Sans effet sur une installation neuve.
ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS applied integer NOT NULL DEFAULT 0 CHECK (applied>=0);
ALTER TABLE online_payouts DROP CONSTRAINT IF EXISTS online_payouts_status_check;
ALTER TABLE online_payouts ADD CONSTRAINT online_payouts_status_check CHECK (status IN ('pending','sent','cancelled'));
CREATE OR REPLACE FUNCTION app.fin_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Journal en ajout seul'; END IF;
  IF OLD.status IN ('issued','paid') AND (
       (NEW.kind,NEW.number,NEW.customer_name,NEW.customer_address,NEW.customer_siren,NEW.customer_vat,NEW.is_business,NEW.service_date,NEW.issue_date,NEW.due_date,NEW.net,NEW.vat,NEW.gross,NEW.applied,NEW.vat_regime,NEW.source_payment_id,NEW.credits_invoice_id,NEW.company,NEW.note,NEW.restaurant_id)
       IS DISTINCT FROM
       (OLD.kind,OLD.number,OLD.customer_name,OLD.customer_address,OLD.customer_siren,OLD.customer_vat,OLD.is_business,OLD.service_date,OLD.issue_date,OLD.due_date,OLD.net,OLD.vat,OLD.gross,OLD.applied,OLD.vat_regime,OLD.source_payment_id,OLD.credits_invoice_id,OLD.company,OLD.note,OLD.restaurant_id)
       OR NEW.status NOT IN ('issued','paid'))
  THEN RAISE EXCEPTION 'Journal en ajout seul'; END IF;
  RETURN NEW;
END $$;
INSERT INTO schema_versions(version) VALUES (42);
