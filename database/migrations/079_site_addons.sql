-- Add-ons visibles sur le site public : pages 404 personnalisées et données
-- publiques des add-ons installés (livraison, formules, prestations).
INSERT INTO public.addon_categories(id,name,description,position) VALUES
  ('not-found-pages','Pages 404','Une page « introuvable » à l’image de votre établissement, plutôt qu’une impasse.',12)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('not-found-plate','not-found-pages','not_found','plate','Assiette vide','Un 404 dressé comme une table : l’assiette est vide, les couverts attendent. Simple et chaleureux.','free',0,201),
  ('not-found-compass','not-found-pages','not_found','compass','Boussole perdue','Une boussole qui cherche son nord pour remettre vos visiteurs sur le bon chemin.','free',0,202),
  ('not-found-neon','not-found-pages','not_found','neon','Néon 404','Une enseigne néon qui grésille dans la nuit, pour les établissements qui ont du caractère.','one_time',300,203),
  ('not-found-stars','not-found-pages','not_found','stars','Ciel étoilé','Une page perdue dans les étoiles, avec une étoile filante pour revenir à l’accueil.','one_time',300,204)
ON CONFLICT (id) DO NOTHING;

-- Données destinées à l’affichage public : uniquement ce que le site montre déjà
-- à ses visiteurs, pour des add-ons installés, sans aucune donnée client.
CREATE FUNCTION app.site_addon_data(rid text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id=rid AND archived_at IS NULL) THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'installed', coalesce((SELECT jsonb_agg(a) FROM unnest(ARRAY['estimation-studio','loyalty','booking','menu-allergens','shipping-rules','product-bundles','appointment-booking']) a
      WHERE app.addon_installed(rid,a)), '[]'::jsonb),
    'loadingScreens', coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'renderer',p.renderer,'name',p.name) ORDER BY p.position)
      FROM addon_products p WHERE p.kind='loading_screen' AND app.addon_installed(rid,p.id)), '[]'::jsonb),
    'notFoundPages', coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'renderer',p.renderer,'name',p.name) ORDER BY p.position)
      FROM addon_products p WHERE p.kind='not_found' AND app.addon_installed(rid,p.id)), '[]'::jsonb),
    'shipping', CASE WHEN app.addon_installed(rid,'shipping-rules') THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',t.data->>'name','postcodes',t.data->>'postcodes','mode',t.data->>'mode',
        'fee',(t.data->>'fee')::int,'freeAbove',(t.data->>'freeAbove')::int,'delay',(t.data->>'delay')::numeric) ORDER BY t.created_at)
      FROM trade_records t WHERE t.restaurant_id=rid AND t.tool_id='shipping-rules' AND t.entity='zone' AND t.archived_at IS NULL), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'bundles', CASE WHEN app.addon_installed(rid,'product-bundles') THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',t.data->>'name','price',(t.data->>'price')::int,
        'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',m.name,'price',m.price) ORDER BY m.name),'[]'::jsonb)
          FROM menu_items m WHERE m.restaurant_id=rid AND m.archived_at IS NULL
            AND m.id IN (SELECT jsonb_array_elements_text(t.data->'items')))) ORDER BY t.created_at)
      FROM trade_records t WHERE t.restaurant_id=rid AND t.tool_id='product-bundles' AND t.entity='bundle'
        AND t.archived_at IS NULL AND t.data->>'status'='Actif'), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'services', CASE WHEN app.addon_installed(rid,'appointment-booking') THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',t.data->>'name','duration',(t.data->>'duration')::numeric,'price',(t.data->>'price')::int) ORDER BY t.data->>'name')
      FROM trade_records t WHERE t.restaurant_id=rid AND t.tool_id='appointment-booking' AND t.entity='service' AND t.archived_at IS NULL), '[]'::jsonb)
      ELSE '[]'::jsonb END
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.site_addon_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.site_addon_data(text) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(79);
