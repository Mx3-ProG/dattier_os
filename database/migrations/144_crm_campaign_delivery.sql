-- Envoi manuel par petits lots, avec résultat conservé pour chaque destinataire.
ALTER TABLE public.crm_campaigns DROP CONSTRAINT crm_campaigns_status_check;
ALTER TABLE public.crm_campaigns ADD CONSTRAINT crm_campaigns_status_check CHECK (status IN ('draft','prepared','sending','completed'));
ALTER TABLE public.crm_campaign_recipients DROP CONSTRAINT crm_campaign_recipients_status_check;
ALTER TABLE public.crm_campaign_recipients ADD CONSTRAINT crm_campaign_recipients_status_check CHECK (status IN ('pending','sent','skipped','error'));
ALTER TABLE public.crm_campaign_recipients ADD COLUMN attempted_at timestamptz;
ALTER TABLE public.crm_campaign_recipients ADD COLUMN sent_at timestamptz;
ALTER TABLE public.crm_campaign_recipients ADD COLUMN provider_id text;
ALTER TABLE public.crm_campaign_recipients ADD COLUMN error text;
INSERT INTO schema_versions(version) VALUES(144);
