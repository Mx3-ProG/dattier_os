-- Packs de sections du site public : Commerce, Contenu, Engagement.
-- Ces add-ons débloquent les sections avancées du CMS (gating via app.site_addon_data).

INSERT INTO public.addon_categories(id,name,description,position) VALUES
  ('site-packs','Packs de sections','Des sections avancées pour enrichir votre site public.',13)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('site-commerce','site-packs','site_pack','site-commerce','Pack Commerce','Sections orientées vente et conversion : tarifs, comparatif, urgence, accroche, formulaires d’avis.','one_time',900,301),
  ('site-content','site-packs','site_pack','site-content','Pack Contenu','Sections éditoriales : blog, newsletter, témoignages, étapes, partenaires, chiffres, équipe.','one_time',900,302),
  ('site-engagement','site-packs','site_pack','site-engagement','Pack Engagement','Sections ludiques : roue de la fortune et FAQ avancée.','one_time',900,303)
ON CONFLICT (id) DO NOTHING;

-- Met à jour la liste des add-ons site installés pour inclure les nouveaux packs.
CREATE OR REPLACE FUNCTION app.site_addon_data(rid text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id=rid AND archived_at IS NULL) THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'installed', coalesce((SELECT jsonb_agg(a) FROM unnest(ARRAY['estimation-studio','loyalty','booking','menu-allergens','shipping-rules','product-bundles','appointment-booking','site-commerce','site-content','site-engagement']) a
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
INSERT INTO schema_versions(version) VALUES(152);
