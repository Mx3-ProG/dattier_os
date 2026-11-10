# Catalogue de modèles de sites

Le studio « Mon site web » s’ouvre sur une **boutique de modèles** avec recherche, filtres gratuit/premium et fiches de présentation. Le bouton « Modifier mon site » ouvre directement l’éditeur existant ; le retour à la bibliothèque conserve le brouillon en mémoire. La navigation reprend le cadre du poste de travail. La collection propose : quatre modèles gratuits (Le Bistrot, Le Jardin, Le Comptoir, La Pause) et quatre modèles premium (Signature, Riviera, L’Atelier, Escale). Prix premium confirmé : **à partir de 9 € par modèle**.

Les huit compositions sont maintenant rendues sur le site public (pas seulement dans les miniatures) via `theme.presentation` et `components/cms-site/templates.css`. Le Bistrot utilise un cadre de brasserie ; Le Jardin inverse texte/image ; Le Comptoir privilégie les grands titres et la commande ; La Pause adopte une composition centrée. Signature propose une grille éditoriale, Riviera des arches et rayures discrètes, L’Atelier une affiche typographique et Escale une composition décalée.

Les gratuits ont un en-tête non fixe et aucun effet premium par défaut. Les premium activent un en-tête sticky, une barre inférieure réservation/commande, des animations légères et un clin d’œil interactif. Les réglages « Composition et interactions » dans Couleurs & polices permettent de les désactiver. La barre s’efface quand le panier est rempli et sur les pages compte/paiement/suivi. Elle respecte les liens propres à l’établissement ; sans commerce, Commander devient Nous contacter. Les animations respectent `prefers-reduced-motion`.

Le champ facultatif conserve l’apparence des sites existants qui n’ont pas choisi un modèle. L’application reste dans le brouillon avec Annuler/Rétablir. L’identité, les coordonnées, le juridique, le catalogue et les pages protégées sont conservés. L’option composition remplace aussi le titre, l’image et le bouton principal de l’accueil, et réordonne ses sections. Huit illustrations SVG originales légères servent de visuels de départ, à remplacer par les photos du restaurant dans l’éditeur.

### Références étudiées le 7 novembre 2026

- https://www.septime-charonne.fr/ : accès direct au menu, horaires et réservation.
- https://www.bigmammagroup.com/ : histoire, établissements, carte et réservation.
- https://www.burgerking.fr/ : priorité à la commande, carte et services.

Ces références guident les usages ; leurs marques, textes et visuels ne sont pas réutilisés.

## Limite commerciale

Les premium sont essayables uniquement dans l’interface de démonstration. Hors démonstration, le bouton indique « Vente bientôt disponible ». Il n’existe encore ni encaissement de modèles ni licence vérifiée côté serveur. Le catalogue client n’est pas un mécanisme de protection des modèles.

Avant commercialisation : définir les prix finaux et leur traitement fiscal, connecter le paiement, enregistrer les achats par organisation, vérifier les événements de paiement côté serveur et contrôler les droits d’application/publication. Ne pas présenter le catalogue actuel comme une boutique opérationnelle.

## Vérification

`tests/cms-templates.test.ts` vérifie les huit configurations, les contrastes, la non-mutation de la source et la conservation de l’identité et des pages autres que l’accueil. TypeScript et lint ciblé passent. Le parcours mobile du studio a été vérifié : onglet Modèles, application du Bistrot au brouillon, puis annulation sans publication.

Validation de la refonte : 107 tests passent, dont la distinction gratuit/premium, les huit compositions, la conservation des anciennes configurations et la sauvegarde des options désactivées. Vérification navigateur : application de Signature au brouillon, bascule du sticky header, ouverture du clin d’œil, aperçu mobile de Signature et du Comptoir, puis annulation sans enregistrement ni publication. Typecheck et lint ciblé passent.
