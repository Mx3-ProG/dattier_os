INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('snowflake-loader','loading-screens','loading_screen','snowflake','Flocon de Noël','Un grand flocon de glace et une neige légère.','one_time',900,12),
  ('giftbox-loader','loading-screens','loading_screen','giftbox','Cadeau de Noël','Un paquet qui s’ouvre avec une petite étincelle.','one_time',900,13),
  ('wreath-loader','loading-screens','loading_screen','wreath','Couronne de Noël','Une couronne végétale qui scintille en douceur.','one_time',900,14)
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_versions(version) VALUES(83);
