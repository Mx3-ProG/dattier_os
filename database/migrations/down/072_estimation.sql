-- Refuse un retour arrière si un établissement possède encore l’add-on.
DROP FUNCTION IF EXISTS app.estimation_public(text);
DROP FUNCTION IF EXISTS app.estimation_save(text,text,text,jsonb,integer,boolean,integer);
DROP TABLE IF EXISTS public.estimation_configs;
DELETE FROM public.addon_products WHERE id='estimation-studio';
DELETE FROM public.addon_categories WHERE id='pilotage-tools';
DELETE FROM schema_versions WHERE version=72;
