-- Une licence de démonstration est distincte d'un achat et ne peut être créée
-- par le rôle applicatif. Aucun droit n'est accordé par cette migration.
ALTER TABLE public.addon_licenses DROP CONSTRAINT addon_licenses_source_check;
ALTER TABLE public.addon_licenses ADD CONSTRAINT addon_licenses_source_check
  CHECK (source IN ('free','purchase','demo'));

-- Les nouveaux abonnements Pilotage peuvent être présentés dans la démo
-- via les droits de l'établissement, sans simuler de paiement Stripe.
ALTER TABLE public.addon_legacy_grants DROP CONSTRAINT addon_legacy_grants_addon_id_check;
ALTER TABLE public.addon_legacy_grants ADD CONSTRAINT addon_legacy_grants_addon_id_check
  CHECK (addon_id IN ('invoices','attendance','client-invoices','payroll',
    'offline-conflicts','connections','qr','loyalty','domain',
    'prospect-scanner','pipeline-crm','customer-health'));

INSERT INTO schema_versions(version) VALUES(101);
