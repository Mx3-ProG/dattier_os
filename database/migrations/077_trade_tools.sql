-- Outils métier : vingt add-ons de la boutique, un moteur de fiches commun.
-- Chaque fiche appartient à un établissement et à un outil installé ; la RLS
-- refuse toute lecture ou écriture si l’outil n’y est pas installé.
INSERT INTO public.addon_categories(id,name,description,position) VALUES
  ('metier-restauration','Restauration','Cuisine, carte, service et pertes : les outils du quotidien en restauration.',40),
  ('metier-btp','BTP','Chantiers, rapports, devis et matériel pour les entreprises du bâtiment.',41),
  ('metier-coiffure','Coiffure','Rendez-vous, fauteuils, fiches clients et produits du salon.',42),
  ('metier-commerce','Commerce','Variantes, lots, livraison et relance des paiements non finalisés.',43),
  ('metier-tous','Tous métiers','Segments, campagnes et parcours de conversion, quel que soit votre métier.',44)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.addon_products(id,category_id,kind,renderer,name,description,pricing_mode,price_cents,position) VALUES
  ('kitchen-display','metier-restauration','business','kitchen-display','Écran cuisine','Un écran plein format pour la brigade : chaque commande en ticket, triée par ancienneté, avec chrono et alertes de retard.','free',0,101),
  ('recipe-cost','metier-restauration','business','recipe-cost','Coût des recettes','Calcule le coût matière de chaque plat à partir de vos fiches recettes et le compare au prix de vente.','free',0,102),
  ('menu-allergens','metier-restauration','business','menu-allergens','Allergènes avancés','Une grille des 14 allergènes réglementaires pour toute la carte, publiée directement sur votre boutique en ligne.','free',0,103),
  ('service-pacing','metier-restauration','business','service-pacing','Cadence du service','Visualise la charge du service par poste et par heure, repère les préparations en retard et l’activité de la journée.','free',0,104),
  ('waste-tracker','metier-restauration','business','waste-tracker','Suivi des pertes','Enregistre les pertes en quelques secondes, chiffre leur coût et révèle les causes qui coûtent le plus.','free',0,105),
  ('site-planning','metier-btp','business','site-planning','Planning de chantier','Planifie les chantiers et leurs étapes, affecte les équipes et suit l’avancement et les retards.','free',0,111),
  ('site-report','metier-btp','business','site-report','Rapport de chantier','Un rapport par visite : avancement, effectif, météo, observations et réserves à lever, avec l’historique par chantier.','free',0,112),
  ('quote-builder','metier-btp','business','quote-builder','Devis travaux','Compose un devis poste par poste avec quantités, prix et TVA, calcule les totaux et l’imprime au propre.','free',0,113),
  ('equipment-log','metier-btp','business','equipment-log','Suivi du matériel','Inventaire du matériel, affectations aux équipes et carnet d’entretien avec alertes avant échéance.','free',0,114),
  ('appointment-booking','metier-coiffure','business','appointment-booking','Agenda de rendez-vous','Un agenda par collaborateur avec vos prestations, leur durée et leur prix, et la détection des chevauchements.','free',0,121),
  ('chair-occupancy','metier-coiffure','business','chair-occupancy','Occupation des fauteuils','Mesure le taux d’occupation des fauteuils heure par heure à partir de l’agenda, pour repérer les creux à remplir.','free',0,122),
  ('client-style','metier-coiffure','business','client-style','Fiches prestations','La fiche technique de chaque client : nature de cheveux, formules de couleur, préférences, et l’historique de ses visites.','free',0,123),
  ('salon-stock','metier-coiffure','business','salon-stock','Stocks salon','Suit les produits techniques et de revente, leurs mouvements et alerte avant la rupture.','free',0,124),
  ('product-variants','metier-commerce','business','product-variants','Variantes produit','Décline vos articles par taille, couleur ou finition, avec référence, supplément de prix et stock par variante.','free',0,131),
  ('abandoned-cart','metier-commerce','business','abandoned-cart','Paniers abandonnés','Repère les commandes en ligne dont le paiement n’a pas été finalisé, chiffre le manque à gagner et suit vos relances.','free',0,132),
  ('shipping-rules','metier-commerce','business','shipping-rules','Livraison','Définit vos zones de livraison par code postal, leurs frais, délais et seuil de gratuité, avec un simulateur de frais.','free',0,133),
  ('product-bundles','metier-commerce','business','product-bundles','Lots de produits','Compose des lots à partir de votre catalogue et vérifie la remise accordée et la marge restante.','free',0,134),
  ('customer-segments','metier-tous','business','customer-segments','Segments clients','Regroupe automatiquement vos clients (fidèles, nouveaux, à risque, inactifs) et vos propres segments sur mesure.','free',0,141),
  ('loyalty-campaigns','metier-tous','business','loyalty-campaigns','Campagnes de fidélité','Planifie des campagnes ciblées sur un segment, avec offre, période et canal, et mesure leur portée.','free',0,142),
  ('conversion-insights','metier-tous','business','conversion-insights','Parcours de conversion','Relie les visites de votre site aux commandes et réservations pour mesurer chaque étape du parcours.','free',0,143)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.trade_records (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  tool_id text NOT NULL REFERENCES public.addon_products(id),
  entity text NOT NULL CHECK (entity ~ '^[a-z][a-z-]{0,31}$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data)='object' AND octet_length(data::text)<=32000),
  created_by text REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX trade_records_scope ON public.trade_records(restaurant_id,tool_id,entity,created_at DESC);
ALTER TABLE public.trade_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY trade_records_access ON public.trade_records TO atacuisine_app
  USING (current_setting('app.public',true) IS DISTINCT FROM 'true'
    AND app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,tool_id))
  WITH CHECK (current_setting('app.public',true) IS DISTINCT FROM 'true'
    AND app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,tool_id)
    AND EXISTS (SELECT 1 FROM addon_products p WHERE p.id=tool_id AND p.kind='business'));
CREATE POLICY public_denied ON public.trade_records AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public());
REVOKE ALL ON public.trade_records FROM PUBLIC,atacuisine_app;
GRANT SELECT,INSERT,UPDATE ON public.trade_records TO atacuisine_app;
-- Volume borné par outil et établissement : une saisie automatisée ne peut pas saturer la base.
CREATE FUNCTION app.trade_records_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF (SELECT count(*) FROM trade_records WHERE restaurant_id=NEW.restaurant_id AND tool_id=NEW.tool_id) >= 5000 THEN
    RAISE EXCEPTION 'Quota de fiches atteint pour cet outil.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trade_records_quota BEFORE INSERT ON public.trade_records
  FOR EACH ROW EXECUTE FUNCTION app.trade_records_quota();
-- Une fiche ne change jamais d’établissement ni d’outil.
CREATE FUNCTION app.trade_records_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.restaurant_id<>OLD.restaurant_id OR NEW.tool_id<>OLD.tool_id OR NEW.entity<>OLD.entity OR NEW.id<>OLD.id THEN
    RAISE EXCEPTION 'Fiche non modifiable.';
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END $$;
CREATE TRIGGER trade_records_immutable BEFORE UPDATE ON public.trade_records
  FOR EACH ROW EXECUTE FUNCTION app.trade_records_immutable();
INSERT INTO schema_versions(version) VALUES(77);
