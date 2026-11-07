-- Idempotent : une version intermédiaire (025/026) a pu être appliquée en local.
-- Engagement client : points automatiques, parrainage entre clients,
-- promotions flash sur les plats, badges et réservations liées au compte.

-- Réglages de gamification, un par établissement (valeurs par défaut sinon).
CREATE TABLE IF NOT EXISTS loyalty_settings (
  restaurant_id text PRIMARY KEY REFERENCES restaurants ON DELETE CASCADE,
  points_per_euro numeric(6,2) NOT NULL DEFAULT 1 CHECK (points_per_euro >= 0 AND points_per_euro <= 100),
  booking_points integer NOT NULL DEFAULT 20 CHECK (booking_points BETWEEN 0 AND 10000),
  referrer_points integer NOT NULL DEFAULT 100 CHECK (referrer_points BETWEEN 0 AND 10000),
  welcome_kind text NOT NULL DEFAULT 'fixed' CHECK (welcome_kind IN ('fixed','percent')),
  welcome_value integer NOT NULL DEFAULT 500 CHECK (welcome_value >= 0 AND (welcome_kind <> 'percent' OR welcome_value <= 100)),
  welcome_days integer NOT NULL DEFAULT 30 CHECK (welcome_days BETWEEN 1 AND 365),
  milestones jsonb NOT NULL DEFAULT '[{"count":3,"points":150,"label":"Dessert offert"},{"count":5,"points":300,"label":"Menu offert"},{"count":10,"points":800,"label":"Ambassadeur de la maison"}]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lien de parrainage personnel d'un client (un par fiche établissement).
CREATE TABLE IF NOT EXISTS customer_referral_codes (
  customer_id text PRIMARY KEY REFERENCES customers ON DELETE CASCADE,
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Un client n'a qu'un parrain ; la récompense tombe à sa première commande payée.
CREATE TABLE IF NOT EXISTS customer_referrals (
  referred_customer_id text PRIMARY KEY REFERENCES customers ON DELETE CASCADE,
  referrer_customer_id text NOT NULL REFERENCES customers ON DELETE CASCADE,
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  welcome_promo_id text REFERENCES promo_codes,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  CHECK (referred_customer_id <> referrer_customer_id)
);
CREATE INDEX IF NOT EXISTS customer_referrals_referrer ON customer_referrals(referrer_customer_id);

-- Promotion flash : prix réduit d'un plat sur une fenêtre horaire.
CREATE TABLE IF NOT EXISTS flash_promotions (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants ON DELETE CASCADE,
  menu_id text NOT NULL REFERENCES menu_items,
  kind text NOT NULL CHECK (kind IN ('percent','price')),
  value integer NOT NULL CHECK (value > 0 AND (kind <> 'percent' OR value <= 90)),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  member_bonus_points integer NOT NULL DEFAULT 0 CHECK (member_bonus_points BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  created_by text REFERENCES profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS flash_promotions_window ON flash_promotions(restaurant_id, ends_at);

CREATE TABLE IF NOT EXISTS customer_badges (
  customer_id text NOT NULL REFERENCES customers ON DELETE CASCADE,
  badge text NOT NULL CHECK (badge ~ '^[a-z0-9-]{2,40}$'),
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, badge)
);

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_id text REFERENCES customers;
CREATE INDEX IF NOT EXISTS reservations_customer ON reservations(customer_id) WHERE customer_id IS NOT NULL;

-- Points de la commande elle-même (hors code fidélité) et bonus flash membre.
ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS loyalty_points integer NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  ADD COLUMN IF NOT EXISTS loyalty_awarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS flash_bonus_points integer NOT NULL DEFAULT 0 CHECK (flash_bonus_points >= 0),
  ADD COLUMN IF NOT EXISTS flash_items integer NOT NULL DEFAULT 0 CHECK (flash_items >= 0);

-- Clé d'idempotence : un même événement ne crédite jamais deux fois.
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS reference text;
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_transactions_reference ON loyalty_transactions(customer_id, reference) WHERE reference IS NOT NULL;

ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON loyalty_settings;
CREATE POLICY tenant_access ON loyalty_settings USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
ALTER TABLE customer_referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON customer_referral_codes;
CREATE POLICY tenant_access ON customer_referral_codes USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
ALTER TABLE customer_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON customer_referrals;
CREATE POLICY tenant_access ON customer_referrals USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
ALTER TABLE flash_promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON flash_promotions;
CREATE POLICY tenant_access ON flash_promotions USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
ALTER TABLE customer_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON customer_badges;
CREATE POLICY tenant_access ON customer_badges
  USING (app.in_restaurant((SELECT restaurant_id FROM customers c WHERE c.id = customer_badges.customer_id)))
  WITH CHECK (app.in_restaurant((SELECT restaurant_id FROM customers c WHERE c.id = customer_badges.customer_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON loyalty_settings, customer_referral_codes, customer_referrals, flash_promotions, customer_badges TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES (27);
