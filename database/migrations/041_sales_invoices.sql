-- Factures clients et avoirs. Une facture émise ne se modifie plus : elle se corrige par avoir.
-- Le PDF n’est pas une facture électronique au sens de la réforme : la transmission
-- officielle passera par une plateforme agréée.
-- Retour arrière (préproduction uniquement) : down/041_sales_invoices.sql.

INSERT INTO fin_accounts(restaurant_id,code,label)
SELECT restaurant_id,'411','Clients' FROM fin_settings ON CONFLICT DO NOTHING;

ALTER TABLE fin_events DROP CONSTRAINT fin_events_type_check;
ALTER TABLE fin_events ADD CHECK (type IN ('payment.confirmed','payout.sent','payout.reversed','invoice.validated','invoice.paid','bank.matched','sale_invoice.issued','sale_invoice.paid','sale_credit.issued'));
ALTER TABLE fin_entries DROP CONSTRAINT fin_entries_kind_check;
ALTER TABLE fin_entries ADD CHECK (kind IN ('sale_payment','reversal','payout','payout_reversal','purchase','purchase_payment','bank_match','sale_invoice','sale_invoice_payment','sale_credit'));
ALTER TABLE fin_bank_matches DROP CONSTRAINT fin_bank_matches_kind_check;
ALTER TABLE fin_bank_matches ADD CHECK (kind IN ('invoice','invoice_link','online_payout','card_batch','cash_deposit','customer_invoice'));

-- Identité de l’établissement sur ses factures.
CREATE TABLE fin_company (
  restaurant_id text PRIMARY KEY REFERENCES restaurants,
  legal_name text NOT NULL,
  legal_form text NOT NULL DEFAULT '',
  address text NOT NULL,
  siren text NOT NULL CHECK (siren ~ '^[0-9]{9}$'),
  vat_number text,
  share_capital text NOT NULL DEFAULT '',
  rcs text NOT NULL DEFAULT '',
  payment_days integer NOT NULL DEFAULT 30 CHECK (payment_days BETWEEN 0 AND 60),
  late_penalty text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Numérotation continue, par série et par année. Une transaction annulée ne consomme aucun numéro.
CREATE TABLE fin_invoice_sequences (
  restaurant_id text NOT NULL REFERENCES restaurants,
  series text NOT NULL CHECK (series IN ('F','AV')),
  year integer NOT NULL,
  last_number integer NOT NULL,
  PRIMARY KEY (restaurant_id, series, year)
);
CREATE TABLE fin_invoices (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  kind text NOT NULL CHECK (kind IN ('invoice','credit_note')),
  number text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','discarded')),
  customer_name text NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 200),
  customer_address text NOT NULL DEFAULT '',
  customer_siren text CHECK (customer_siren ~ '^[0-9]{9}$'),
  customer_vat text,
  is_business boolean NOT NULL DEFAULT false,
  service_date date NOT NULL,
  issue_date date,
  due_date date,
  net integer NOT NULL DEFAULT 0,
  vat integer NOT NULL DEFAULT 0,
  gross integer NOT NULL DEFAULT 0 CHECK (gross>=0),
  -- Part d’un avoir imputée sur ce qui restait dû : le reste est à rembourser.
  applied integer NOT NULL DEFAULT 0 CHECK (applied>=0),
  vat_regime text NOT NULL,
  -- Vente déjà encaissée et comptabilisée : le document ne crée pas de seconde écriture de vente.
  source_payment_id text REFERENCES payment_declarations,
  credits_invoice_id text REFERENCES fin_invoices,
  company jsonb,
  note text NOT NULL DEFAULT '',
  created_by text,
  issued_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, number),
  CHECK (status='draft' OR status='discarded' OR (number IS NOT NULL AND issue_date IS NOT NULL AND company IS NOT NULL)),
  CHECK (net+vat=gross),
  CHECK ((kind='credit_note')=(credits_invoice_id IS NOT NULL))
);
CREATE UNIQUE INDEX fin_invoice_one_per_payment ON fin_invoices(restaurant_id,source_payment_id) WHERE source_payment_id IS NOT NULL AND kind='invoice' AND status<>'discarded';
CREATE INDEX fin_invoices_list ON fin_invoices(restaurant_id,status,created_at DESC);
CREATE INDEX fin_invoices_credits ON fin_invoices(credits_invoice_id);
CREATE TABLE fin_invoice_lines (
  invoice_id text NOT NULL REFERENCES fin_invoices,
  line_no integer NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
  quantity numeric(12,3) NOT NULL CHECK (quantity>0),
  unit_gross integer NOT NULL,
  line_gross integer NOT NULL,
  rate_id text REFERENCES fin_tax_rates,
  rate_bp integer NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000),
  source_line integer,
  PRIMARY KEY (invoice_id, line_no)
);
CREATE TABLE fin_invoice_payments (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  invoice_id text NOT NULL REFERENCES fin_invoices,
  amount integer NOT NULL CHECK (amount>0),
  paid_on date NOT NULL,
  method text NOT NULL CHECK (method IN ('bank','card','cash','sale')),
  bank_transaction_id text REFERENCES fin_bank_transactions,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE INDEX fin_invoice_payments_invoice ON fin_invoice_payments(invoice_id);

-- Une fois émise, seule l’avancée du règlement peut évoluer.
CREATE FUNCTION app.fin_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER fin_invoices_protected BEFORE UPDATE OR DELETE ON fin_invoices FOR EACH ROW EXECUTE FUNCTION app.fin_invoice_guard();
CREATE FUNCTION app.fin_invoice_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent text; state text;
BEGIN
  parent:=CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  SELECT status INTO state FROM fin_invoices WHERE id=parent;
  IF state<>'draft' THEN RAISE EXCEPTION 'Journal en ajout seul'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_invoice_lines_protected BEFORE INSERT OR UPDATE OR DELETE ON fin_invoice_lines FOR EACH ROW EXECUTE FUNCTION app.fin_invoice_lines_guard();

ALTER TABLE fin_company ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_read ON fin_company FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_company FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_company FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_invoice_sequences FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_invoice_sequences FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_invoice_sequences FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_invoices FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_invoices FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_invoices FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_invoice_lines FOR SELECT USING (EXISTS(SELECT 1 FROM fin_invoices i WHERE i.id=invoice_id));
CREATE POLICY fin_write ON fin_invoice_lines FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM fin_invoices i WHERE i.id=invoice_id));
CREATE POLICY fin_update ON fin_invoice_lines FOR UPDATE USING (EXISTS(SELECT 1 FROM fin_invoices i WHERE i.id=invoice_id));
CREATE POLICY fin_delete ON fin_invoice_lines FOR DELETE USING (EXISTS(SELECT 1 FROM fin_invoices i WHERE i.id=invoice_id));
CREATE POLICY fin_read ON fin_invoice_payments FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_invoice_payments FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_invoice_payments FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
GRANT SELECT,INSERT,UPDATE ON fin_company,fin_invoice_sequences,fin_invoices,fin_invoice_payments TO atacuisine_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON fin_invoice_lines TO atacuisine_app;

CREATE OR REPLACE FUNCTION app.fin_reverse_event(rid text,key text,reason text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE origin fin_entries; lines jsonb; total integer:=0;
BEGIN
  IF NOT (app.fin_owner_session() OR app.fin_access(rid)) THEN RAISE EXCEPTION 'Accès refusé pour ce profil.'; END IF;
  INSERT INTO fin_counters(restaurant_id) VALUES(rid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM fin_counters WHERE restaurant_id=rid FOR UPDATE;
  FOR origin IN
    SELECT n.* FROM fin_entries n JOIN fin_events e ON e.id=n.event_id
     WHERE n.restaurant_id=rid AND e.dedupe_key=key AND n.kind IN ('purchase_payment','bank_match','sale_invoice_payment')
       AND NOT EXISTS(SELECT 1 FROM fin_entries x WHERE x.reverses_entry_id=n.id)
     ORDER BY n.number DESC
  LOOP
    SELECT jsonb_agg(jsonb_build_object('account',account_code,'debit',credit,'credit',debit,'label',label) ORDER BY line_no) INTO lines FROM fin_entry_lines WHERE entry_id=origin.id;
    PERFORM app.fin_insert_entry(rid,origin.event_id,'reversal',(now() AT TIME ZONE 'Europe/Paris')::date,left('Contre-passation : '||reason,200),origin.id,lines,origin.journal);
    total:=total+1;
  END LOOP;
  RETURN total;
END $$;

INSERT INTO schema_versions(version) VALUES (41);
