-- Animation saisonnière en paiement unique, par établissement.
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position)
VALUES ('santa-loader','loading-screens','loading_screen','santa','Tête de Père Noël',
  'Une tête de Père Noël animée pour accueillir votre équipe pendant les fêtes.','one_time',900,11)
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_versions(version) VALUES(80);
