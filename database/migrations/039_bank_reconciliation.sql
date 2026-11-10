-- Relevés bancaires et rapprochement. Un mouvement sans correspondance fiable reste à
-- vérifier : aucune vente ni facture n’est jamais créée pour le justifier.
-- Retour arrière (préproduction uniquement) : down/039_bank_reconciliation.sql.

INSERT INTO fin_accounts(restaurant_id,code,label)
SELECT restaurant_id,'627','Services bancaires' FROM fin_settings ON CONFLICT DO NOTHING;
-- Désactivé par défaut : chaque rapprochement reste proposé tant que l’établissement n’en décide pas autrement.
ALTER TABLE fin_settings ADD COLUMN bank_auto_match boolean NOT NULL DEFAULT false;

ALTER TABLE fin_events DROP CONSTRAINT fin_events_type_check;
ALTER TABLE fin_events ADD CHECK (type IN ('payment.confirmed','payout.sent','payout.reversed','invoice.validated','invoice.paid','bank.matched'));
ALTER TABLE fin_entries DROP CONSTRAINT fin_entries_kind_check;
ALTER TABLE fin_entries ADD CHECK (kind IN ('sale_payment','reversal','payout','payout_reversal','purchase','purchase_payment','bank_match'));

CREATE TABLE fin_bank_accounts (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  -- Quatre derniers caractères seulement : l’IBAN complet n’est pas utile ici.
  iban_end text CHECK (iban_end ~ '^[A-Z0-9]{4}$'),
  -- Solde connu à une date, si l’établissement le déclare. Sinon, celui des relevés.
  opening_balance integer,
  opening_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id),
  CHECK ((opening_balance IS NULL)=(opening_date IS NULL))
);
CREATE TABLE fin_bank_imports (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  account_id text NOT NULL,
  object_key text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  filename text NOT NULL,
  format text NOT NULL CHECK (format IN ('csv','ofx','camt053')),
  added integer NOT NULL CHECK (added>=0),
  skipped integer NOT NULL CHECK (skipped>=0),
  statement_balance integer,
  balance_date date,
  imported_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, account_id, sha256),
  FOREIGN KEY (restaurant_id, account_id) REFERENCES fin_bank_accounts(restaurant_id, id)
);
CREATE TABLE fin_bank_transactions (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  account_id text NOT NULL,
  import_id text NOT NULL REFERENCES fin_bank_imports,
  booked_on date NOT NULL,
  amount integer NOT NULL CHECK (amount<>0),
  label text NOT NULL,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'to_review' CHECK (status IN ('to_review','matched','ignored')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Le même mouvement, réimporté par un relevé qui chevauche le précédent, n’entre qu’une fois.
  UNIQUE (restaurant_id, account_id, dedupe_key),
  FOREIGN KEY (restaurant_id, account_id) REFERENCES fin_bank_accounts(restaurant_id, id)
);
CREATE INDEX fin_bank_tx_scope ON fin_bank_transactions(restaurant_id,status,booked_on DESC);
CREATE INDEX fin_bank_tx_import ON fin_bank_transactions(import_id);
CREATE TABLE fin_bank_matches (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  transaction_id text NOT NULL REFERENCES fin_bank_transactions,
  kind text NOT NULL CHECK (kind IN ('invoice','invoice_link','online_payout','card_batch','cash_deposit')),
  label text NOT NULL,
  difference integer NOT NULL DEFAULT 0,
  automatic boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by text
);
CREATE UNIQUE INDEX fin_bank_one_match ON fin_bank_matches(transaction_id) WHERE undone_at IS NULL;
CREATE INDEX fin_bank_match_scope ON fin_bank_matches(restaurant_id,created_at DESC);
-- Une facture, un versement ou une journée de cartes ne se rapproche qu’une fois.
CREATE TABLE fin_bank_match_targets (
  restaurant_id text NOT NULL REFERENCES restaurants,
  target_key text NOT NULL,
  match_id text NOT NULL REFERENCES fin_bank_matches,
  PRIMARY KEY (restaurant_id, target_key)
);
CREATE INDEX fin_bank_targets_match ON fin_bank_match_targets(match_id);

-- Le contenu d’un mouvement bancaire est une preuve : seul son traitement peut évoluer.
CREATE FUNCTION app.fin_bank_tx_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Journal en ajout seul'; END IF;
  IF (NEW.restaurant_id,NEW.account_id,NEW.import_id,NEW.booked_on,NEW.amount,NEW.label,NEW.dedupe_key)
     IS DISTINCT FROM (OLD.restaurant_id,OLD.account_id,OLD.import_id,OLD.booked_on,OLD.amount,OLD.label,OLD.dedupe_key)
  THEN RAISE EXCEPTION 'Journal en ajout seul'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_bank_tx_protected BEFORE UPDATE OR DELETE ON fin_bank_transactions FOR EACH ROW EXECUTE FUNCTION app.fin_bank_tx_guard();
CREATE TRIGGER fin_bank_imports_append_only BEFORE UPDATE OR DELETE ON fin_bank_imports FOR EACH ROW EXECUTE FUNCTION app.immutable_event();

ALTER TABLE fin_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_bank_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_bank_match_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_read ON fin_bank_accounts FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_bank_accounts FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_bank_accounts FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_bank_imports FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_bank_imports FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_bank_transactions FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_bank_transactions FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_bank_transactions FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_bank_matches FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_bank_matches FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_update ON fin_bank_matches FOR UPDATE USING (app.fin_access(restaurant_id)) WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_read ON fin_bank_match_targets FOR SELECT USING (app.fin_access(restaurant_id));
CREATE POLICY fin_write ON fin_bank_match_targets FOR INSERT WITH CHECK (app.fin_access(restaurant_id));
CREATE POLICY fin_delete ON fin_bank_match_targets FOR DELETE USING (app.fin_access(restaurant_id));
GRANT SELECT,INSERT,UPDATE ON fin_bank_accounts,fin_bank_transactions,fin_bank_matches TO atacuisine_app;
GRANT SELECT,INSERT ON fin_bank_imports TO atacuisine_app;
GRANT SELECT,INSERT,DELETE ON fin_bank_match_targets TO atacuisine_app;

-- Annule les écritures actives d’un événement précis.
CREATE FUNCTION app.fin_reverse_event(rid text,key text,reason text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
REVOKE ALL ON FUNCTION app.fin_reverse_event(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fin_reverse_event(text,text,text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES (39);
