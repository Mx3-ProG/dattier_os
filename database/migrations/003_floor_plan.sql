ALTER TABLE dining_tables ADD COLUMN label text NOT NULL DEFAULT '';
ALTER TABLE dining_tables ADD COLUMN zone text NOT NULL DEFAULT 'Salle principale';
ALTER TABLE dining_tables ADD COLUMN shape text NOT NULL DEFAULT 'square' CHECK(shape IN ('round','square','rect'));
ALTER TABLE dining_tables ADD COLUMN pos_x integer NOT NULL DEFAULT 50 CHECK(pos_x BETWEEN 0 AND 100);
ALTER TABLE dining_tables ADD COLUMN pos_y integer NOT NULL DEFAULT 50 CHECK(pos_y BETWEEN 0 AND 100);
ALTER TABLE dining_tables ADD COLUMN bookable boolean NOT NULL DEFAULT true;
ALTER TABLE dining_tables ADD COLUMN archived_at timestamptz;
ALTER TABLE dining_tables ADD CHECK(capacity<=20);
-- Disposition initiale en grille de 4 colonnes pour les tables existantes.
UPDATE dining_tables SET
 pos_x=LEAST(88,14+((number-1)%4)*24),
 pos_y=LEAST(85,18+((number-1)/4)*30),
 shape=CASE WHEN capacity<=2 THEN 'round' WHEN capacity>=6 THEN 'rect' ELSE 'square' END;
CREATE INDEX reservations_table ON reservations(table_id,starts_at) WHERE table_id IS NOT NULL;
INSERT INTO schema_versions VALUES(3);
