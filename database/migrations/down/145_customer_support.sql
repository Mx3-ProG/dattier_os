DROP TABLE IF EXISTS public.customer_support_cases;
DROP FUNCTION IF EXISTS app.customer_support_order_guard();
DROP INDEX IF EXISTS public.orders_restaurant_id_id;
DELETE FROM schema_versions WHERE version=145;
