-- With online billing enabled, a free trial opens the workspace only once a
-- card is registered on Stripe (subscription trialing). Read-only check used by
-- the application; it never grants access by itself. Idempotent.
CREATE OR REPLACE FUNCTION app.restaurant_card_required(rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE((
    SELECT p.plan=0 AND app.effective_plan(p.plan,p.bonus_plan)=0
      AND p.cancelled_at IS NULL AND p.trial_ends_at>now()
      AND NOT EXISTS (
        SELECT 1 FROM app.plan_subscriptions s
        WHERE s.organization_id=p.organization_id AND s.status IN ('active','trialing','past_due')
      )
    FROM restaurants r JOIN app.organization_plans p ON p.organization_id=r.organization_id
    WHERE r.id=rid AND app.has_restaurant(rid)
  ), false)
$$;
REVOKE ALL ON FUNCTION app.restaurant_card_required(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.restaurant_card_required(text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(112) ON CONFLICT DO NOTHING;
