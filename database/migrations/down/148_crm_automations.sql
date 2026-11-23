DROP INDEX IF EXISTS public.crm_activities_automation_key;
ALTER TABLE public.crm_activities DROP COLUMN IF EXISTS automation_key;
DROP TABLE IF EXISTS public.crm_automation_settings;
DELETE FROM schema_versions WHERE version=148;
