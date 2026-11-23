INSERT INTO public.addon_categories(id,name,description,position) VALUES
 ('metier-aide-personne','Aide à la personne','Bénéficiaires, intervenants et interventions à domicile.',45)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
 ('home-operations','metier-aide-personne','business','home-operations','Interventions à domicile','Bénéficiaires, intervenants et visites à domicile.','free',0,145)
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_versions(version) VALUES(181) ON CONFLICT DO NOTHING;
