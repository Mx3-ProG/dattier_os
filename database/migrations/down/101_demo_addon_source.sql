DELETE FROM public.addon_licenses WHERE source='demo';
DELETE FROM public.addon_legacy_grants WHERE addon_id IN ('prospect-scanner','pipeline-crm','customer-health');
ALTER TABLE public.addon_licenses DROP CONSTRAINT addon_licenses_source_check;
ALTER TABLE public.addon_licenses ADD CONSTRAINT addon_licenses_source_check
  CHECK (source IN ('free','purchase'));
ALTER TABLE public.addon_legacy_grants DROP CONSTRAINT addon_legacy_grants_addon_id_check;
ALTER TABLE public.addon_legacy_grants ADD CONSTRAINT addon_legacy_grants_addon_id_check
  CHECK (addon_id IN ('invoices','attendance','client-invoices','payroll',
    'offline-conflicts','connections','qr','loyalty','domain'));
DELETE FROM schema_versions WHERE version=101;
