DROP FUNCTION IF EXISTS app.site_background_data(text);
-- Les licences et commandes existantes protègent les produits acquis.
DELETE FROM public.addon_products WHERE id IN (
  'site-bg-xmas-candy','site-bg-xmas-trees','site-bg-xmas-santa',
  'site-bg-xmas-gifts','site-bg-xmas-elves','site-bg-xmas-gingerbread',
  'site-bg-xmas-aurora','site-bg-xmas-village','site-bg-xmas-sleigh',
  'site-bg-restaurant-table','site-bg-btp-plans','site-bg-salon-scissors',
  'site-bg-bakery-wheat','site-bg-florist-bloom','site-bg-craft-tools',
  'site-bg-restaurant-menu','site-bg-btp-architecture','site-bg-salon-elegance',
  'site-bg-commerce-display','site-bg-wellness-botanical','site-bg-artisan-workshop'
);
DELETE FROM public.addon_categories WHERE id='site-backgrounds';
DELETE FROM schema_versions WHERE version=85;
