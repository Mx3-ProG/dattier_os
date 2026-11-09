INSERT INTO public.addon_categories(id,name,description,position)
VALUES('pilotage-tools','Pilotage et estimations','Outils de simulation et d’aide à la décision.',25)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position)
VALUES('estimation-studio','pilotage-tools','estimation','estimation','Estimation','Simulateur public de prix indicatif et analyse interne des coûts et marges.','free',0,1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.estimation_configs (
  restaurant_id text PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
  introduction text NOT NULL DEFAULT '' CHECK(length(introduction)<=500),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items)<=20),
  fixed_costs_cents integer NOT NULL DEFAULT 0 CHECK(fixed_costs_cents BETWEEN 0 AND 100000000),
  published boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_by text REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(NOT published OR jsonb_array_length(items)>0)
);
ALTER TABLE public.estimation_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY estimation_admin_read ON public.estimation_configs FOR SELECT TO atacuisine_app
  USING(current_setting('app.public',true) IS DISTINCT FROM 'true'
    AND app.in_restaurant(restaurant_id) AND app.addon_store_manager(restaurant_id));
REVOKE ALL ON public.estimation_configs FROM PUBLIC,atacuisine_app;
GRANT SELECT ON public.estimation_configs TO atacuisine_app;

CREATE FUNCTION app.estimation_save(rid text, new_title text, new_intro text, new_items jsonb,
  new_fixed integer, new_published boolean, expected_revision integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE next_revision integer;
BEGIN
  IF NOT app.addon_store_manager(rid) OR NOT app.addon_installed(rid,'estimation-studio') THEN
    RAISE EXCEPTION 'Gestion de l’estimation réservée au super admin avec add-on installé.';
  END IF;
  IF new_title IS NULL OR length(new_title) NOT BETWEEN 1 AND 100 OR new_intro IS NULL
    OR length(new_intro)>500 OR new_items IS NULL OR jsonb_typeof(new_items)<>'array'
    OR jsonb_array_length(new_items)>20 OR (new_published AND jsonb_array_length(new_items)=0)
    OR new_fixed IS NULL OR new_fixed NOT BETWEEN 0 AND 100000000
    OR expected_revision IS NULL OR expected_revision<0 THEN
    RAISE EXCEPTION 'Configuration d’estimation invalide.';
  END IF;
  PERFORM 1 FROM restaurants WHERE id=rid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Établissement indisponible.'; END IF;
  IF expected_revision=0 THEN
    INSERT INTO estimation_configs(restaurant_id,title,introduction,items,fixed_costs_cents,published,updated_by)
    VALUES(rid,new_title,new_intro,new_items,new_fixed,new_published,app.user_id())
    ON CONFLICT DO NOTHING RETURNING revision INTO next_revision;
  ELSE
    UPDATE estimation_configs SET title=new_title,introduction=new_intro,items=new_items,
      fixed_costs_cents=new_fixed,published=new_published,revision=revision+1,
      updated_by=app.user_id(),updated_at=now()
    WHERE restaurant_id=rid AND revision=expected_revision RETURNING revision INTO next_revision;
  END IF;
  IF next_revision IS NULL THEN RAISE EXCEPTION 'Configuration modifiée ailleurs. Rechargez la page.'; END IF;
  RETURN next_revision;
END $$;
REVOKE ALL ON FUNCTION app.estimation_save(text,text,text,jsonb,integer,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.estimation_save(text,text,text,jsonb,integer,boolean,integer) TO atacuisine_app;

-- Public response contains only selling prices. Internal costs never cross this boundary.
CREATE FUNCTION app.estimation_public(rid text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('title',c.title,'introduction',c.introduction,'items',
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',item->'id','kind',item->'kind','name',item->'name',
      'priceCents',item->'priceCents','defaultQuantity',item->'defaultQuantity',
      'maxQuantity',item->'maxQuantity','featured',item->'featured') ORDER BY ord),'[]'::jsonb)
     FROM jsonb_array_elements(c.items) WITH ORDINALITY AS parts(item,ord)))
  FROM estimation_configs c JOIN restaurants r ON r.id=c.restaurant_id
  WHERE c.restaurant_id=rid AND c.published AND r.archived_at IS NULL
    AND app.in_restaurant(rid) AND app.addon_installed(rid,'estimation-studio')
    AND app.addon_installed(rid,'website')
$$;
REVOKE ALL ON FUNCTION app.estimation_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.estimation_public(text) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(72);
