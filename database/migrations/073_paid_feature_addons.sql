-- Preserve access already granted to existing establishments when moving features
-- out of the base plans. New establishments need an independent subscription.
ALTER TABLE public.addon_subscriptions DROP CONSTRAINT addon_subscriptions_addon_check;
ALTER TABLE public.addon_subscriptions ADD CONSTRAINT addon_subscriptions_addon_check
  CHECK (addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty'));

CREATE TABLE public.addon_legacy_grants (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  addon_id text NOT NULL CHECK (addon_id IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id,addon_id)
);
INSERT INTO public.addon_legacy_grants(restaurant_id,addon_id)
SELECT r.id, a.addon_id FROM public.restaurants r
JOIN app.organization_plans p ON p.organization_id=r.organization_id
CROSS JOIN (VALUES
  ('invoices',69),('attendance',39),('client-invoices',69),('payroll',69),
  ('offline-conflicts',39),('connections',39),('qr',39),('loyalty',69)
) AS a(addon_id,minimum_plan)
WHERE r.archived_at IS NULL AND p.plan>=a.minimum_plan;
ALTER TABLE public.addon_legacy_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY addon_legacy_read ON public.addon_legacy_grants FOR SELECT TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.addon_legacy_grants FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.addon_legacy_grants TO atacuisine_app;

CREATE FUNCTION app.paid_addon_entitled(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty')
    AND coalesce(app.restaurant_plan(rid),0)>=39 AND (
      EXISTS (SELECT 1 FROM addon_legacy_grants g WHERE g.restaurant_id=rid AND g.addon_id=addon)
      OR EXISTS (SELECT 1 FROM addon_subscriptions s WHERE s.restaurant_id=rid AND s.addon=addon
        AND s.status='active' AND s.valid_until>now())
    )
$$;
REVOKE ALL ON FUNCTION app.paid_addon_entitled(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.paid_addon_entitled(text,text) TO atacuisine_app;

CREATE OR REPLACE FUNCTION app.addon_entitled(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE addon
    WHEN 'floor' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'booking' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'website' THEN coalesce(app.restaurant_plan(rid),0)>=69
    WHEN 'online-orders' THEN coalesce(app.restaurant_plan(rid),0)>=99
    WHEN 'loyalty' THEN app.paid_addon_entitled(rid,'loyalty')
    WHEN 'invoices' THEN app.paid_addon_entitled(rid,'invoices')
    WHEN 'attendance' THEN app.paid_addon_entitled(rid,'attendance')
    WHEN 'client-invoices' THEN app.paid_addon_entitled(rid,'client-invoices')
    WHEN 'payroll' THEN app.paid_addon_entitled(rid,'payroll')
    WHEN 'offline-conflicts' THEN app.paid_addon_entitled(rid,'offline-conflicts')
    WHEN 'connections' THEN app.paid_addon_entitled(rid,'connections')
    WHEN 'qr' THEN app.paid_addon_entitled(rid,'qr')
    WHEN 'loyalty' THEN app.paid_addon_entitled(rid,'loyalty')
    ELSE EXISTS (SELECT 1 FROM addon_licenses l WHERE l.restaurant_id=rid AND l.product_id=addon
      AND l.status='active' AND (l.valid_until IS NULL OR l.valid_until>now()))
  END
$$;

-- Formerly included invoices no longer trigger a separate-renewal plan guard.
DROP TRIGGER IF EXISTS guard_included_addon_renewal ON app.organization_plans;
DROP FUNCTION IF EXISTS app.guard_included_addon_renewal();
INSERT INTO schema_versions(version) VALUES(73);
