# Catalogue de modèles de sites

## La Collection (15 novembre 2026)

Modèle premium automobile inspiré de la composition de [Moteur & Sens](https://moteuretsens.com/) : navigation claire, ouverture photographique panoramique avec titre blanc, collection immédiatement visible, présentation de la maison, avis, galerie et vidéo. Le modèle conserve sa propre marque, ses textes et les visuels automobiles déjà présents sous licence Pexels dans le projet. Il ne reprend aucun contenu ni visuel du site de référence.

Un modèle est assemblé en quatre couches : sa fiche, sa palette, ses effets et l’ordre des sections dans `src/features/cms/templates.ts` ; les textes et médias d’exemple dans `src/features/cms/template-content.ts` ; sa signature CSS publique dans `src/components/cms-site/templates.css` ; son aperçu dans `src/components/site-editor/template-variants.css` et `public/cms/templates/collection.svg`. L’identifiant est accepté par `src/features/cms/schema.ts`. L’application par `applySiteTemplate` conserve l’identité, les données métier, les pages protégées et les contenus personnalisés hors composition choisie.

Les visuels automobiles de départ sont réutilisés depuis `public/cms/racing/`. Pour retrouver la qualité d’une concession précise, remplacer dans l’éditeur la bannière et les photos des véhicules par des médias propres à cette concession. Le modèle est inclus dans la boutique de templates, sans blocage d’achat premium.

La composition complète installe les pages « Déjà vendues », « Services », « Pourquoi nous choisir ? » et « Garantie », adapte « À vendre », « Notre histoire » et « Contact », et affiche ces destinations dans la navigation. L’inventaire propre à ce modèle s’édite dans le panneau Couleurs & polices du studio : marque, modèle, prix, année, kilométrage, lieu, description, photos et statut disponible/vendu. La page « À vendre » filtre par marque, lieu, nom et budget, avec un tri par année, nom ou prix ; « Déjà vendues » récupère automatiquement les fiches passées au statut vendu. Chaque automobile possède une fiche publique avec galerie et lien de contact. Le formulaire de contact fonctionne lorsque l’add-on CRM est installé ; sinon, le site propose un lien vers l’adresse électronique configurée.

L’inventaire automobile est séparé du catalogue de restauration afin que les prix et les états vendus ne dépendent pas des recettes ou des portions. Les pages de services, d’histoire et de garantie contiennent des textes de remplacement ; les prestations, contrats, tarifs et coordonnées doivent être renseignés avant publication. La galerie d’une fiche véhicule n’a pas encore de champs dédiés aux options techniques détaillées ou aux documents PDF. Le multilingue n’est pas inclus dans cette version.

Le studio « Mon site web » s’ouvre sur une **boutique de modèles** avec recherche, filtres gratuit/premium et fiches de présentation. Le bouton « Modifier mon site » ouvre directement l’éditeur existant ; le retour à la bibliothèque conserve le brouillon en mémoire. La navigation reprend le cadre du poste de travail. La collection propose : treize modèles gratuits (Le Bistrot, Le Jardin, Le Comptoir, La Pause, La Pizzeria, Le Salon, Le Chantier, Le Manuscrit, La Pâtisserie, Le Bilan, Le Brunch, Le Burger, La Collection) et douze modèles premium (Signature, Riviera, L’Atelier, Escale, Le Sushi, Le Loft, La Racing, La Confiance, Le Street, L’École, La Table, Le Cellier). Prix premium confirmé : **à partir de 9 € par modèle**. La collection couvre la restauration (dix modèles) comme les autres métiers : BTP, automobile, blog, assurance, immobilier, coiffure, comptabilité et formation.

### Contenu pré-rempli

Chaque modèle embarque une écriture qui lui est propre : textes de bannière, accroche, paragraphes, slogans, boutons, libellés d’avis, mentions d’horaires et clin d’œil. **Aucun texte n’est partagé entre deux modèles** : un test vérifie l’unicité des titres de bannière et des compositions.

Les visuels sont des **photos et vidéos libres de droit** (Pexels License, usage commercial autorisé) : quatre photos par modèle (bannière, présentation, galerie) et une vidéo courte, stockées dans `public/cms/<modèle>/`. Le script `npm run assets:fetch` les récupère depuis `public/cms/assets-manifest.json` et les recompresse ; `public/cms/assets-credits.json` conserve la source de chaque ressource.

### Composition propre à chaque modèle

L’ordre des sections est unique pour les vingt-quatre modèles et combine toujours : bannière, présentation, produits, accroche ou bandeau, vidéo, galerie, avis, visite et localisation — dans un ordre qui raconte le modèle. Une vidéo est toujours présente ; la galerie l’est pour les modèles qui mettent en scène un lieu.

L’identité visuelle est propre à chaque modèle : géométrie de la bannière (cercle, arche, filet double, rectangle plein), famille de titre, poids, capitales, filets de section, traitement des images et rythme des espacements. `src/components/cms-site/templates.css` porte cette signature.

### Effets d'interface (React Bits)

Chaque modèle reçoit en plus une **signature d'effets** : titre de bannière, bouton principal, cartes de produits et pastilles d'avantages. Vingt-quatre signatures différentes, aucune répétée (vérifié par test).

- **Titre** : reflet mobile (`shine`) ou dégradé animé (`gradient`).
- **Bouton** : reflet au survol (`glare`) ou étincelles au clic (`spark`).
- **Cartes** : voile lumineux (`sheen`) ou reflet diagonal (`streak`).
- **Pastilles** : voile au survol (`shine`) ou reflet coloré (`gradient`).

Les composants viennent de [React Bits](https://reactbits.dev) (MIT + Commons Clause, usage commercial autorisé), copiés dans `src/components/reactbits/` — jamais installés comme paquet. `npm run reactbits:fetch` les récupère à nouveau.

Trois règles tenues par l'intégration :

1. **Le texte reste dans le HTML.** Les composants sont importés statiquement : un import dynamique les placerait derrière une frontière de suspension et viderait le titre du HTML servi aux robots.
2. **La palette reste au chef.** Les couleurs sont lues dans la configuration du thème (hex réels) et injectées dans les composants : React Bits analyse les couleurs dans un canvas, qui ne résout pas `var(--x)`.
3. **Les animations restent désactivables.** Les effets sont coupés quand l'établissement désactive les animations (`Composition et interactions`), et `prefers-reduced-motion` neutralise le mouvement.

Le seul effet réservé aux modèles premium est `spark` (étincelles au clic) : c'est le plus coûteux en CPU sur mobile.

**L'établissement garde la main.** Le panneau « Composition et interactions » affiche une case « Effets d'interface » et un choix par emplacement (titre, bouton, cartes, pastilles) avec la description de chaque effet. Décochée, le site n'affiche plus aucun effet et retrouve l'apparence sobre d'origine. La case « Animer l'apparition et les boutons » coupe elle aussi les effets, et `prefers-reduced-motion` neutralise le mouvement côté visiteur.

L'effet `spark` (étincelles au clic) est réservé aux modèles premium : le serveur refuse un modèle gratuit qui l'active, même par une requête forgée. C'est vérifié dans `tests/cms-templates.test.ts`.

Les vingt-quatre compositions sont maintenant rendues sur le site public (pas seulement dans les miniatures) via `theme.presentation` et `components/cms-site/templates.css`. Le Bistrot utilise un cadre de brasserie ; Le Jardin inverse texte/image ; Le Comptoir privilégie les grands titres et la commande ; La Pause adopte une composition centrée. Signature propose une grille éditoriale, Riviera des arches et rayures discrètes, L’Atelier une affiche typographique et Escale une composition décalée.

Les gratuits ont un en-tête non fixe et aucun effet premium par défaut. Les premium activent un en-tête sticky, une barre inférieure réservation/commande, des animations légères et un clin d’œil interactif. Les réglages « Composition et interactions » dans Couleurs & polices permettent de les désactiver. La barre s’efface quand le panier est rempli et sur les pages compte/paiement/suivi. Elle respecte les liens propres à l’établissement ; sans commerce, Commander devient Nous contacter. Les animations respectent `prefers-reduced-motion`.

Le champ facultatif conserve l’apparence des sites existants qui n’ont pas choisi un modèle. L’application reste dans le brouillon avec Annuler/Rétablir. L’identité, les coordonnées, le juridique, le catalogue et les pages protégées sont conservés. L’option composition remplace aussi le titre, l’image et le bouton principal de l’accueil, et réordonne ses sections. Douze illustrations SVG originales légères servent de visuels de départ, à remplacer par les photos du restaurant dans l’éditeur.

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
