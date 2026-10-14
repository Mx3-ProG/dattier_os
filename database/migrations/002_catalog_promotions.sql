ALTER TABLE menu_items ADD COLUMN archived_at timestamptz;
CREATE TABLE promo_codes (
 id text PRIMARY KEY,
 restaurant_id text NOT NULL REFERENCES restaurants,
 customer_id text NOT NULL REFERENCES customers,
 code text NOT NULL CHECK(code=upper(code)),
 kind text NOT NULL CHECK(kind IN ('percent','fixed')),
 value integer NOT NULL CHECK(value>0 AND (kind<>'percent' OR value<=100)),
 points_cost integer NOT NULL CHECK(points_cost>=0),
 expires_on date NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','redeemed','cancelled')),
 token text NOT NULL UNIQUE,
 created_by text NOT NULL REFERENCES profiles,
 created_at timestamptz NOT NULL DEFAULT now(),
 redeemed_at timestamptz,
 UNIQUE(restaurant_id,code)
);
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_declarations DROP CONSTRAINT payment_declarations_amount_check;
ALTER TABLE payment_declarations ADD CHECK(amount>=0);
ALTER TABLE payment_declarations ADD COLUMN customer_id text REFERENCES customers;
ALTER TABLE payment_declarations ADD COLUMN promo_id text UNIQUE REFERENCES promo_codes;
ALTER TABLE payment_declarations ADD COLUMN discount integer NOT NULL DEFAULT 0 CHECK(discount>=0);
CREATE INDEX promo_customer ON promo_codes(restaurant_id,customer_id);
INSERT INTO schema_versions VALUES(2);
