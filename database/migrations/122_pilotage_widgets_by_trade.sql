-- Vue d'ensemble modulaire : blocs propres à chaque métier (rendez-vous,
-- chantiers, devis, stocks…). La liste des blocs masquables s'élargit.
-- Idempotent : la base de démonstration partagée peut la rejouer.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.pilotage_preferences'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%hidden%'
  LOOP
    EXECUTE format('ALTER TABLE public.pilotage_preferences DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.pilotage_preferences ADD CONSTRAINT pilotage_preferences_hidden_check
  CHECK(cardinality(hidden)<=40 AND hidden <@ ARRAY['receipts','orders','sales','goal','service','favorites','qr','news','stock','customers','team','tables','ready','reservations','appointments','agenda','salon-stock','sites','quotes','reserves','equipment','followups']::text[]);

INSERT INTO schema_versions(version) VALUES(122) ON CONFLICT DO NOTHING;
