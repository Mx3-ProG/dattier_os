DROP TABLE IF EXISTS public.crm_campaign_recipients;
ALTER TABLE public.crm_campaigns DROP CONSTRAINT IF EXISTS crm_campaigns_tenant_id;
ALTER TABLE public.crm_campaigns DROP COLUMN IF EXISTS prepared_at;
ALTER TABLE public.crm_campaigns DROP CONSTRAINT IF EXISTS crm_campaigns_status_check;
ALTER TABLE public.crm_campaigns ADD CONSTRAINT crm_campaigns_status_check CHECK (status='draft');
DELETE FROM schema_versions WHERE version=143;
