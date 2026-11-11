-- Retour arrière de 175. Les fonctions d'accès reprennent la définition de 093 / 150 :
-- réappliquer 150_module_display.sql puis 093 pour paid_addon_entitled / addon_entitled.
DROP FUNCTION IF EXISTS app.email_trigger(text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS app.email_claim(text,text,integer);
DROP FUNCTION IF EXISTS app.email_delivery_context(text);
DROP FUNCTION IF EXISTS app.email_complete(text,text,text,text,text,text,text,text,boolean);
DROP TABLE IF EXISTS public.email_messages;
DROP TABLE IF EXISTS public.email_transports;
DROP TABLE IF EXISTS public.email_templates;
DROP TABLE IF EXISTS public.email_brands;
DELETE FROM addon_subscriptions WHERE addon='email-automation';
ALTER TABLE public.addon_subscriptions DROP CONSTRAINT IF EXISTS addon_subscriptions_addon_check;
ALTER TABLE public.addon_subscriptions ADD CONSTRAINT addon_subscriptions_addon_check
  CHECK (addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain','prospect-scanner','pipeline-crm','customer-health'));
DELETE FROM addon_legacy_grants WHERE addon_id='email-automation';
ALTER TABLE public.addon_legacy_grants DROP CONSTRAINT IF EXISTS addon_legacy_grants_addon_id_check;
ALTER TABLE public.addon_legacy_grants ADD CONSTRAINT addon_legacy_grants_addon_id_check
  CHECK (addon_id IN ('invoices','attendance','client-invoices','payroll',
    'offline-conflicts','connections','qr','loyalty','domain',
    'prospect-scanner','pipeline-crm','customer-health'));
DELETE FROM schema_versions WHERE version=175;
