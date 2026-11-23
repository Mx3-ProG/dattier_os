-- Audience figée à la préparation ; aucun message n'est envoyé par cette migration.
ALTER TABLE public.crm_campaigns DROP CONSTRAINT crm_campaigns_status_check;
ALTER TABLE public.crm_campaigns ADD CONSTRAINT crm_campaigns_status_check CHECK (status IN ('draft','prepared'));
ALTER TABLE public.crm_campaigns ADD COLUMN prepared_at timestamptz;
ALTER TABLE public.crm_campaigns ADD CONSTRAINT crm_campaigns_tenant_id UNIQUE (restaurant_id,id);
CREATE TABLE public.crm_campaign_recipients (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL,
  campaign_id text NOT NULL,
  customer_id text NOT NULL,
  recipient text NOT NULL CHECK (length(recipient) BETWEEN 3 AND 254),
  status text NOT NULL DEFAULT 'pending' CHECK (status='pending'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,customer_id),
  UNIQUE (campaign_id,recipient),
  FOREIGN KEY (restaurant_id,campaign_id) REFERENCES public.crm_campaigns(restaurant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id,customer_id) REFERENCES public.customers(restaurant_id,id)
);
CREATE INDEX crm_campaign_recipients_restaurant ON public.crm_campaign_recipients(restaurant_id,campaign_id,status);
ALTER TABLE public.crm_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_campaign_recipient_scope ON public.crm_campaign_recipients FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.crm_campaign_recipients FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.crm_campaign_recipients TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(143);
