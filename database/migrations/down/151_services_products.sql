DROP FUNCTION IF EXISTS app.offer_media_public(text,text);
DROP FUNCTION IF EXISTS app.public_offers(text);
DROP FUNCTION IF EXISTS app.product_availability(public.business_products);
DROP TRIGGER IF EXISTS business_product_stock_link ON public.business_products;
DROP FUNCTION IF EXISTS app.check_product_stock_link();
DROP TABLE IF EXISTS public.business_products;
DROP TABLE IF EXISTS public.business_services;
DELETE FROM schema_versions WHERE version=151;
