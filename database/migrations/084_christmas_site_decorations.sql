-- Décorations du site public : une licence définitive par établissement et par décor.
INSERT INTO public.addon_categories(id,name,description,position)
VALUES ('site-decorations','Décorations du site','Habillez votre site public pour les fêtes sans ralentir son contenu.',13)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('christmas-snowfall','site-decorations','site_decoration','snowfall','Neige douce','Une neige légère qui traverse le site sans gêner la lecture.','one_time',900,301),
  ('christmas-garland','site-decorations','site_decoration','garland','Guirlande de sapin','Une guirlande végétale et des baies au sommet du site.','one_time',900,302),
  ('christmas-lights','site-decorations','site_decoration','lights','Lumières de Noël','Une ligne de petites lumières colorées au-dessus du site.','one_time',900,303)
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION app.site_decoration_data(rid text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'renderer',p.renderer,'name',p.name) ORDER BY p.position),'[]'::jsonb)
  FROM addon_products p
  WHERE p.kind='site_decoration' AND app.addon_installed(rid,p.id)
$$;
REVOKE ALL ON FUNCTION app.site_decoration_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.site_decoration_data(text) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(84);
