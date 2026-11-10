-- La suppression est refusée si une licence ou une commande référence un modèle.
DELETE FROM public.addon_products WHERE id IN (
  'not-found-trail','not-found-portal','not-found-lantern','not-found-map','not-found-balloon',
  'not-found-snowglobe','not-found-candy','not-found-gingerbread','not-found-gifts',
  'not-found-aurora','not-found-village','not-found-forest','not-found-advent'
);
DELETE FROM schema_versions WHERE version=82;
