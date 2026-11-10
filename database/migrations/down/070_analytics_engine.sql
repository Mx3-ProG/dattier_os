-- Retire aussi les licences de l’add-on : à réserver à un retour arrière sans production.
DELETE FROM public.addon_license_events WHERE product_id='earth-tracker-3d';
DELETE FROM public.addon_licenses WHERE product_id='earth-tracker-3d';
DELETE FROM public.addon_products WHERE id='earth-tracker-3d';
DELETE FROM public.addon_categories WHERE id='tracking-analytics';
CREATE OR REPLACE FUNCTION app.addon_admin_stats()
RETURNS TABLE(product_id text, installations integer, active_uses integer, sales integer, refunds integer, revenue_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM app.addon_admin_guard();
  RETURN QUERY SELECT p.id,
    (SELECT count(*)::int FROM addon_licenses l WHERE l.product_id=p.id AND l.status='active'),
    (SELECT count(*)::int FROM loading_screen_settings s WHERE s.product_id=p.id AND s.enabled),
    (SELECT count(*)::int FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('paid','disputed')),
    (SELECT count(*)::int FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('refunded','dispute_lost','duplicate')),
    (SELECT coalesce(sum(greatest(o.amount_cents-o.refunded_cents,0)),0)::bigint FROM addon_purchases o WHERE o.product_id=p.id AND o.status IN ('paid','disputed'))
  FROM addon_products p ORDER BY p.position,p.id;
END $$;
DROP FUNCTION IF EXISTS app.analytics_purge(text);
DROP FUNCTION IF EXISTS app.analytics_save_settings(text,boolean,text,text,integer,integer);
DROP FUNCTION IF EXISTS app.analytics_ingest(text,text,text,text,text,text,text,numeric,numeric);
DROP FUNCTION IF EXISTS app.analytics_record_filtered(text,text);
DROP FUNCTION IF EXISTS app.analytics_sweep(text);
DROP FUNCTION IF EXISTS app.analytics_is_internal(text,text);
DROP FUNCTION IF EXISTS app.analytics_public_config(text);
DROP FUNCTION IF EXISTS app.analytics_licensed_for(text,text);
DROP FUNCTION IF EXISTS app.analytics_licensed(text);
DROP TABLE IF EXISTS public.analytics_pulses;
DROP TABLE IF EXISTS public.analytics_pages_daily;
DROP TABLE IF EXISTS public.analytics_geo_daily;
DROP TABLE IF EXISTS public.analytics_traffic_hourly;
DROP TABLE IF EXISTS public.analytics_visitors;
DROP TABLE IF EXISTS public.analytics_salts;
DROP TABLE IF EXISTS public.analytics_settings;
DROP FUNCTION IF EXISTS app.analytics_reader(text);
DELETE FROM schema_versions WHERE version=70;
