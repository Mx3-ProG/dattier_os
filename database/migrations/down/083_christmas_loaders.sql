-- Refuse la suppression d’un écran acheté ou installé.
DELETE FROM public.addon_products WHERE id IN ('snowflake-loader','giftbox-loader','wreath-loader');
DELETE FROM schema_versions WHERE version=83;
