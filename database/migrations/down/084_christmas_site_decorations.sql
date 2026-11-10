DROP FUNCTION IF EXISTS app.site_decoration_data(text);
-- Une licence ou commande existante empêche la suppression des produits.
DELETE FROM public.addon_products WHERE id IN ('christmas-snowfall','christmas-garland','christmas-lights');
DELETE FROM public.addon_categories WHERE id='site-decorations';
DELETE FROM schema_versions WHERE version=84;
