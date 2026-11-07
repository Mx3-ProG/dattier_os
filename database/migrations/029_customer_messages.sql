-- Messages envoyés en un clic depuis la fiche client : email ou SMS, relance, offre ou information.
-- Chaque envoi est tracé (destinataire, texte, auteur, statut fournisseur). Migration additive.
CREATE TABLE IF NOT EXISTS customer_messages(
 id text PRIMARY KEY,
 restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
 customer_id text NOT NULL REFERENCES customers ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('email','sms')),
 purpose text NOT NULL CHECK(purpose IN ('relance','offre','information')),
 recipient text NOT NULL CHECK(length(recipient) BETWEEN 3 AND 254),
 subject text CHECK(subject IS NULL OR length(subject)<=150),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 5000),
 status text NOT NULL CHECK(status IN ('demo','sent','error')),
 provider_id text,
 error text,
 actor text REFERENCES profiles,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_messages_restaurant ON customer_messages(restaurant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_messages_customer ON customer_messages(customer_id,channel,created_at DESC);
ALTER TABLE customer_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON customer_messages;
CREATE POLICY tenant_access ON customer_messages USING(app.in_restaurant(restaurant_id)) WITH CHECK(app.in_restaurant(restaurant_id));
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='atacuisine_app') THEN
 GRANT SELECT,INSERT ON customer_messages TO atacuisine_app;
END IF; END $$;
INSERT INTO schema_versions VALUES(29);
