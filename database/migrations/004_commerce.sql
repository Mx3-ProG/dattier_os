-- Reprise additive des modules Donuts, sans seed ni suppression.
CREATE TABLE shop_settings(restaurant_id text PRIMARY KEY REFERENCES restaurants ON DELETE CASCADE, config jsonb NOT NULL);
ALTER TABLE menu_items ADD COLUMN images jsonb NOT NULL DEFAULT '[]', ADD COLUMN allergens text NOT NULL DEFAULT '', ADD COLUMN options jsonb NOT NULL DEFAULT '[]';
CREATE TABLE shop_orders(order_id text PRIMARY KEY REFERENCES orders ON DELETE CASCADE, number bigint GENERATED ALWAYS AS IDENTITY UNIQUE, token text NOT NULL UNIQUE, request_hash text NOT NULL, consumption text NOT NULL CHECK(consumption IN ('onsite','takeaway')), payment_method text NOT NULL CHECK(payment_method IN ('counter','stripe')), payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid')), total integer NOT NULL CHECK(total>0), stripe_session text UNIQUE, stripe_url text, email_preview text NOT NULL DEFAULT '');
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;


ALTER TABLE ingredients ADD COLUMN archived_at timestamptz;
CREATE INDEX ingredients_restaurant_active
ON ingredients(restaurant_id, archived_at, name);


ALTER TABLE promo_codes ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE promo_codes ADD COLUMN effect text NOT NULL DEFAULT 'discount' CHECK(effect IN ('discount','points'));
ALTER TABLE promo_codes ADD COLUMN points_award integer NOT NULL DEFAULT 0 CHECK(points_award>=0);
ALTER TABLE promo_codes ADD COLUMN required_menu_id text REFERENCES menu_items;
ALTER TABLE promo_codes ADD COLUMN usage_limit integer NOT NULL DEFAULT 1 CHECK(usage_limit>0);
ALTER TABLE promo_codes ADD COLUMN usage_count integer NOT NULL DEFAULT 0 CHECK(usage_count>=0);
ALTER TABLE promo_codes ADD COLUMN public boolean NOT NULL DEFAULT false;
ALTER TABLE loyalty_transactions ALTER COLUMN actor DROP NOT NULL;
ALTER TABLE payment_declarations DROP CONSTRAINT payment_declarations_promo_id_key;
CREATE INDEX payment_promo ON payment_declarations(promo_id);
ALTER TABLE shop_orders DROP CONSTRAINT shop_orders_total_check;
ALTER TABLE shop_orders ADD CHECK(total>=0);
ALTER TABLE shop_orders ADD COLUMN subtotal integer NOT NULL DEFAULT 0 CHECK(subtotal>=0);
ALTER TABLE shop_orders ADD COLUMN discount integer NOT NULL DEFAULT 0 CHECK(discount>=0);
ALTER TABLE shop_orders ADD COLUMN promo_id text REFERENCES promo_codes;
CREATE TABLE promo_redemptions (
 id text PRIMARY KEY,
 promo_id text NOT NULL REFERENCES promo_codes,
 order_id text NOT NULL UNIQUE REFERENCES orders ON DELETE CASCADE,
 customer_id text NOT NULL REFERENCES customers,
 discount integer NOT NULL DEFAULT 0 CHECK(discount>=0),
 points_awarded integer NOT NULL DEFAULT 0 CHECK(points_awarded>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(promo_id,customer_id)
);
CREATE TABLE loyalty_rewards (
 id text PRIMARY KEY,
 restaurant_id text NOT NULL REFERENCES restaurants,
 name text NOT NULL,
 points_cost integer NOT NULL CHECK(points_cost>0),
 kind text NOT NULL CHECK(kind IN ('fixed','product','custom')),
 value integer NOT NULL DEFAULT 0 CHECK(value>=0),
 menu_id text REFERENCES menu_items,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_rewards_restaurant ON loyalty_rewards(restaurant_id,active);


ALTER TABLE shop_orders ADD COLUMN customer_id text REFERENCES customers;
ALTER TABLE shop_orders ADD COLUMN reorder_items jsonb NOT NULL DEFAULT '[]';
ALTER TABLE shop_orders ADD COLUMN terms_version text NOT NULL DEFAULT '2026-10-18';
ALTER TABLE shop_orders ADD COLUMN terms_accepted_at timestamptz;

CREATE TABLE customer_access_tokens (
 id text PRIMARY KEY,
 customer_id text NOT NULL REFERENCES customers ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_access_tokens_customer ON customer_access_tokens(customer_id);
CREATE INDEX shop_orders_customer ON shop_orders(customer_id,number DESC);



ALTER TABLE customers ADD COLUMN password_hash text;

CREATE TABLE customer_sessions (
 token_hash text PRIMARY KEY,
 customer_id text NOT NULL REFERENCES customers ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_password_resets (
 token_hash text PRIMARY KEY,
 customer_id text NOT NULL REFERENCES customers ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_email_outbox (
 id text PRIMARY KEY,
 customer_id text NOT NULL REFERENCES customers ON DELETE CASCADE,
 recipient text NOT NULL,
 subject text NOT NULL,
 body text NOT NULL,
 status text NOT NULL CHECK(status IN ('demo','sent','error')),
 provider_id text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_sessions_customer ON customer_sessions(customer_id);
CREATE INDEX customer_password_resets_customer ON customer_password_resets(customer_id,created_at DESC);
CREATE INDEX customer_email_outbox_customer ON customer_email_outbox(customer_id,created_at DESC);



CREATE TABLE product_reviews (
 id text PRIMARY KEY,
 restaurant_id text NOT NULL REFERENCES restaurants,
 menu_id text NOT NULL REFERENCES menu_items,
 customer_id text NOT NULL REFERENCES customers ON DELETE CASCADE,
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 body text NOT NULL CHECK(char_length(body) BETWEEN 10 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','archived')),
 admin_reply text NOT NULL DEFAULT '',
 moderated_by text REFERENCES profiles,
 moderated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_id,menu_id)
);

CREATE INDEX product_reviews_restaurant_status ON product_reviews(restaurant_id,status,created_at DESC);
CREATE INDEX product_reviews_menu_status ON product_reviews(menu_id,status,created_at DESC);



ALTER TABLE product_reviews
ADD COLUMN verified_purchase boolean NOT NULL DEFAULT false;



INSERT INTO schema_versions VALUES(4);
