-- Defense in depth: a counter belongs to exactly one establishment. The
-- application role still has no direct table grant; accounting functions keep
-- their existing SECURITY DEFINER behavior.
CREATE POLICY fin_counter_isolation ON public.fin_counters
  FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.fin_access(restaurant_id))
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.fin_access(restaurant_id));
INSERT INTO schema_versions(version) VALUES(46);
