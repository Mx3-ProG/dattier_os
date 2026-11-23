ALTER TABLE public.crm_campaign_recipients DROP COLUMN IF EXISTS error;
ALTER TABLE public.crm_campaign_recipients DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.crm_campaign_recipients DROP COLUMN IF EXISTS sent_at;
ALTER TABLE public.crm_campaign_recipients DROP COLUMN IF EXISTS attempted_at;
ALTER TABLE public.crm_campaign_recipients DROP CONSTRAINT IF EXISTS crm_campaign_recipients_status_check;
ALTER TABLE public.crm_campaign_recipients ADD CONSTRAINT crm_campaign_recipients_status_check CHECK (status='pending');
ALTER TABLE public.crm_campaigns DROP CONSTRAINT IF EXISTS crm_campaigns_status_check;
ALTER TABLE public.crm_campaigns ADD CONSTRAINT crm_campaigns_status_check CHECK (status IN ('draft','prepared'));
DELETE FROM schema_versions WHERE version=144;
