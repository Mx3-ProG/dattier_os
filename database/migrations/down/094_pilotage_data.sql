DROP TABLE IF EXISTS public.scanner_prospects;
DROP TABLE IF EXISTS public.prospect_scans;
DROP TABLE IF EXISTS public.crm_activities;
DROP TABLE IF EXISTS public.crm_opportunities;
DROP TABLE IF EXISTS public.crm_contacts;
DROP TABLE IF EXISTS public.crm_companies;
DELETE FROM schema_versions WHERE version=94;
