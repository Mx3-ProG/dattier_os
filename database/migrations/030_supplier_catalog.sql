-- Catalogue fournisseurs : ce que chaque fournisseur vend. Cuisine IA s’en sert
-- pour trouver « qui vend des fraises » et préparer la commande.
CREATE TABLE IF NOT EXISTS supplier_ingredients (
  supplier_id text NOT NULL REFERENCES suppliers ON DELETE CASCADE,
  ingredient_id text NOT NULL REFERENCES ingredients ON DELETE CASCADE,
  restaurant_id text NOT NULL REFERENCES restaurants,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS supplier_ingredients_ingredient ON supplier_ingredients(ingredient_id);
ALTER TABLE supplier_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON supplier_ingredients;
CREATE POLICY tenant_access ON supplier_ingredients USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
GRANT SELECT, INSERT, DELETE ON supplier_ingredients TO atacuisine_app;

-- Ce qui a déjà été commandé à un fournisseur fait partie de son catalogue.
INSERT INTO supplier_ingredients(supplier_id, ingredient_id, restaurant_id)
SELECT DISTINCT supplier_id, ingredient_id, restaurant_id FROM purchase_orders
ON CONFLICT DO NOTHING;

INSERT INTO schema_versions(version) VALUES (30);
