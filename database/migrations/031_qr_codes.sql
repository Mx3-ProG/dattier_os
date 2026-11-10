-- QR codes tracés : un code court par objet de l'établissement (site, table,
-- commande, réservation, client, promo, fournisseur…) ou lien personnalisé.
-- /q/<token> enregistre le scan puis redirige selon qui scanne (client ou équipe).
CREATE TABLE IF NOT EXISTS qr_codes (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (token ~ '^[a-z0-9]{10}$'),
  kind text NOT NULL CHECK (kind ~ '^[a-z-]{2,20}$'),
  ref text NOT NULL,
  label text NOT NULL DEFAULT '',
  target text,
  created_by text REFERENCES profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (restaurant_id, kind, ref)
);
CREATE TABLE IF NOT EXISTS qr_scans (
  id text PRIMARY KEY,
  qr_id text NOT NULL REFERENCES qr_codes ON DELETE CASCADE,
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('public','staff')),
  scanned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qr_scans_code ON qr_scans(qr_id, scanned_at DESC);

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON qr_codes;
CREATE POLICY tenant_access ON qr_codes USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
ALTER TABLE qr_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON qr_scans;
CREATE POLICY tenant_access ON qr_scans USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON qr_codes, qr_scans TO atacuisine_app;

-- La fonction de scan (app.scan_qr) est dans 032_qr_scan_staff.sql.

INSERT INTO schema_versions(version) VALUES (31);
