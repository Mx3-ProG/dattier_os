DROP FUNCTION IF EXISTS app.site_addon_data(text);
DELETE FROM public.addon_installations WHERE addon_id IN (SELECT id FROM public.addon_products WHERE kind='not_found');
DELETE FROM public.addon_license_events WHERE product_id IN (SELECT id FROM public.addon_products WHERE kind='not_found');
DELETE FROM public.addon_purchases WHERE product_id IN (SELECT id FROM public.addon_products WHERE kind='not_found');
DELETE FROM public.addon_licenses WHERE product_id IN (SELECT id FROM public.addon_products WHERE kind='not_found');
DELETE FROM public.addon_products WHERE kind='not_found';
DELETE FROM public.addon_categories WHERE id='not-found-pages';
DELETE FROM schema_versions WHERE version=79;
