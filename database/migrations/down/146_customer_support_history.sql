DROP TABLE IF EXISTS public.customer_support_events;
ALTER TABLE public.customer_support_cases DROP CONSTRAINT IF EXISTS customer_support_cases_tenant_id;
DELETE FROM schema_versions WHERE version=146;
