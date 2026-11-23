-- Espace client contextuel : ce que le client suit (article, formation, prestation).
-- L'espace client s'adapte au modèle de site : lecteur, apprenant ou services.
CREATE TABLE public.customer_follows(
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants,
  customer_id text NOT NULL REFERENCES customers,
  kind text NOT NULL CHECK(kind IN ('article','course','service')),
  ref_id text NOT NULL,
  label text NOT NULL DEFAULT '',
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, customer_id, kind, ref_id)
);
ALTER TABLE public.customer_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON customer_follows
  USING(app.in_restaurant((SELECT restaurant_id FROM customers c WHERE c.id=customer_follows.customer_id)))
  WITH CHECK(app.in_restaurant((SELECT restaurant_id FROM customers c WHERE c.id=customer_follows.customer_id)));
CREATE INDEX customer_follows_customer ON customer_follows(customer_id, updated_at DESC);
INSERT INTO schema_versions(version) VALUES(153) ON CONFLICT DO NOTHING;
