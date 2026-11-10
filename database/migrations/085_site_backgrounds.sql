-- Fonds de site : produits par établissement, prix TTC, aucun abonnement.
INSERT INTO public.addon_categories(id,name,description,position)
VALUES ('site-backgrounds','Fonds du site','Des fonds de Noël et des univers métier à appliquer au site public.',14)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('site-bg-xmas-candy','site-backgrounds','site_background','xmas-candy','Sucres d’orge','Motif festif de sucres d’orge, doux et léger.','free',0,401),
  ('site-bg-xmas-trees','site-backgrounds','site_background','xmas-trees','Forêt de sapins','Des sapins de Noël sur un fond vert pâle.','free',0,402),
  ('site-bg-xmas-santa','site-backgrounds','site_background','xmas-santa','Pères Noël','Un fond chaleureux parsemé de Pères Noël.','free',0,403),
  ('site-bg-xmas-gifts','site-backgrounds','site_background','xmas-gifts','Cadeaux sous le sapin','Cadeaux, papier et lumière de Noël.','one_time',900,404),
  ('site-bg-xmas-elves','site-backgrounds','site_background','xmas-elves','Atelier des lutins','Une ambiance d’atelier de Noël avec de petits lutins.','one_time',900,405),
  ('site-bg-xmas-gingerbread','site-backgrounds','site_background','xmas-gingerbread','Pain d’épices','Textures gourmandes et biscuits de fête.','one_time',900,406),
  ('site-bg-xmas-aurora','site-backgrounds','site_background','xmas-aurora','Aurore boréale','Lueurs polaires et étoiles avec mouvement de profondeur.','one_time',1900,407),
  ('site-bg-xmas-village','site-backgrounds','site_background','xmas-village','Village lumineux','Un village d’hiver lumineux avec mouvement de profondeur.','one_time',1900,408),
  ('site-bg-xmas-sleigh','site-backgrounds','site_background','xmas-sleigh','Traîneau enchanté','Traîneau et reflets de neige avec mouvement de profondeur.','one_time',1900,409),
  ('site-bg-restaurant-table','site-backgrounds','site_background','restaurant-table','Table de restaurant','Une table dressée en tons crème et terre cuite.','free',0,410),
  ('site-bg-btp-plans','site-backgrounds','site_background','btp-plans','Plans de chantier','Un fond clair inspiré des plans de construction.','free',0,411),
  ('site-bg-salon-scissors','site-backgrounds','site_background','salon-scissors','Ciseaux de salon','Un fond délicat pour coiffure et beauté.','free',0,412),
  ('site-bg-bakery-wheat','site-backgrounds','site_background','bakery-wheat','Blé de boulangerie','Épis de blé et couleurs de farine.','free',0,413),
  ('site-bg-florist-bloom','site-backgrounds','site_background','florist-bloom','Fleurs d’atelier','Fleurs discrètes pour les commerces végétaux.','free',0,414),
  ('site-bg-craft-tools','site-backgrounds','site_background','craft-tools','Outils d’artisan','Outils et matière brute pour les métiers manuels.','free',0,415),
  ('site-bg-restaurant-menu','site-backgrounds','site_background','restaurant-menu','Menu signature','Un fond éditorial raffiné pour la restauration.','one_time',900,416),
  ('site-bg-btp-architecture','site-backgrounds','site_background','btp-architecture','Architecture moderne','Trames et volumes pour les entreprises du bâtiment.','one_time',900,417),
  ('site-bg-salon-elegance','site-backgrounds','site_background','salon-elegance','Salon élégant','Lignes élégantes pour coiffure et esthétique.','one_time',900,418),
  ('site-bg-commerce-display','site-backgrounds','site_background','commerce-display','Vitrine de commerce','Motifs géométriques pour les boutiques.','one_time',900,419),
  ('site-bg-wellness-botanical','site-backgrounds','site_background','wellness-botanical','Bien-être botanique','Feuilles et verts doux pour les espaces de soin.','one_time',900,420),
  ('site-bg-artisan-workshop','site-backgrounds','site_background','artisan-workshop','Atelier créatif','Matières et formes pour les ateliers indépendants.','one_time',900,421)
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION app.site_background_data(rid text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'renderer',p.renderer,'name',p.name) ORDER BY p.position),'[]'::jsonb)
  FROM addon_products p
  WHERE p.kind='site_background' AND app.addon_installed(rid,p.id)
$$;
REVOKE ALL ON FUNCTION app.site_background_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.site_background_data(text) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(85);
