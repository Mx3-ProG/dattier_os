-- Refuse le retour arrière si un établissement possède une licence ou une commande.
DELETE FROM public.addon_products WHERE id='santa-loader';
DELETE FROM schema_versions WHERE version=80;
