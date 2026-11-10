-- Modèles de page 404 et écrans de chargement : prix TTC, paiement unique par établissement.
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('not-found-trail','not-found-pages','not_found','trail','Le chemin','Une ligne qui ramène doucement vos visiteurs vers l’accueil.','free',0,205),
  ('not-found-portal','not-found-pages','not_found','portal','Le portail','Un passage lumineux vers la bonne page.','free',0,206),
  ('not-found-lantern','not-found-pages','not_found','lantern','La lanterne','Une petite lumière pour retrouver le chemin.','free',0,207),
  ('not-found-map','not-found-pages','not_found','map','La carte','Une carte dépliée avec la route de retour.','free',0,208),
  ('not-found-balloon','not-found-pages','not_found','balloon','Le ballon','Un 404 léger qui flotte avant le retour à l’accueil.','free',0,209),
  ('not-found-snowglobe','not-found-pages','not_found','snowglobe','Boule à neige','Un petit paysage d’hiver dans une boule à neige animée.','one_time',600,210),
  ('not-found-candy','not-found-pages','not_found','candy','Sucre d’orge','Une enseigne festive rayée de rouge et de blanc.','one_time',600,211),
  ('not-found-gingerbread','not-found-pages','not_found','gingerbread','Maison en pain d’épices','Une maison gourmande pour une page égarée.','one_time',600,212),
  ('not-found-gifts','not-found-pages','not_found','gifts','Cadeaux perdus','Des paquets de fête qui dévoilent le chemin de l’accueil.','one_time',600,213),
  ('not-found-aurora','not-found-pages','not_found','aurora','Aurore de Noël','Ciel polaire, étoiles et lumière mouvante.','one_time',900,214),
  ('not-found-village','not-found-pages','not_found','village','Village enneigé','Un village aux fenêtres chaudes sous la neige.','one_time',900,215),
  ('not-found-forest','not-found-pages','not_found','forest','Forêt de sapins','Une forêt d’hiver lumineuse et calme.','one_time',900,216),
  ('not-found-advent','not-found-pages','not_found','advent','Calendrier de l’Avent','Des petites fenêtres numérotées s’ouvrent sur le retour à l’accueil.','one_time',900,217)
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_versions(version) VALUES(82);
