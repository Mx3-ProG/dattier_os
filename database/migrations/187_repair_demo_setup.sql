-- Une démo créée d’un bloc (migrations + données d’exemple dans la même
-- transaction) héritait du `session_replication_role = replica` de la
-- migration 130 : les déclencheurs de création d’établissement ne tournaient
-- pas. Résultat : ni site (restaurant_cms), ni réglages boutique, ni salle.
-- Signature exacte du défaut : un établissement sans ligne restaurant_cms
-- (un établissement normal en a toujours une, créée avec lui). On rejoue,
-- pour ceux-là seulement, ce que font les déclencheurs. Idempotent.
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE repair_demo_targets ON COMMIT DROP AS
  SELECT r.id, r.address, r.phone FROM restaurants r
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_cms c WHERE c.restaurant_id = r.id);

INSERT INTO shop_settings(restaurant_id, config)
  SELECT t.id, jsonb_build_object('open', false, 'prepMinutes', 20, 'interval', 15, 'capacity', 10, 'hours', '[]'::jsonb,
    'categories', '["Entrées","Plats","Desserts","Boissons"]'::jsonb, 'address', coalesce(t.address, ''), 'phone', coalesce(t.phone, ''), 'logo', '')
  FROM repair_demo_targets t
  ON CONFLICT DO NOTHING;
INSERT INTO site_documents(restaurant_id) SELECT id FROM repair_demo_targets ON CONFLICT DO NOTHING;
INSERT INTO ops_security_settings(restaurant_id) SELECT id FROM repair_demo_targets ON CONFLICT DO NOTHING;
INSERT INTO floor_zones(id, restaurant_id, name)
  SELECT gen_random_uuid()::text, t.id, 'Salle principale' FROM repair_demo_targets t
  WHERE NOT EXISTS (SELECT 1 FROM floor_zones z WHERE z.restaurant_id = t.id);
INSERT INTO restaurant_cms(restaurant_id) SELECT id FROM repair_demo_targets ON CONFLICT DO NOTHING;

INSERT INTO schema_versions(version) VALUES(187) ON CONFLICT DO NOTHING;
