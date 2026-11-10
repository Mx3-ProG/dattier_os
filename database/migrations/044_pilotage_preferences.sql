CREATE TABLE public.pilotage_preferences (
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hidden text[] NOT NULL DEFAULT '{}' CHECK(cardinality(hidden)<=10 AND hidden <@ ARRAY['receipts','orders','tables','ready','sales','goal','service','favorites','qr','news']::text[]),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(restaurant_id,profile_id)
);
ALTER TABLE pilotage_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_pilotage ON pilotage_preferences
 USING(profile_id=app.user_id() AND app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true')
 WITH CHECK(profile_id=app.user_id() AND app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON pilotage_preferences FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON pilotage_preferences TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(44);
