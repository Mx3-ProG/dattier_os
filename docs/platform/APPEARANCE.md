# Apparence personnelle du dashboard

Le bouton « Personnaliser mon espace », sous le logo, ouvre un aperçu annulable.
Six palettes, une couleur libre, quatre polices, trois tailles de texte et les modes Jour/Nuit sont disponibles pour tous les
comptes actifs. Enregistrer applique la préférence au profil, dans tous ses
établissements. Fermer, Échap et Annuler abandonnent les changements non sauvegardés.
Le rétablissement de l’apparence d’origine doit également être enregistré.
Le bouton soleil/lune à côté du réglage permet de changer de mode directement,
avec sauvegarde immédiate et retour d’erreur si la connexion échoue.

## Persistance et sécurité

La migration `034_appearance_mode.sql` ajoute le mode avec la valeur `light` pour
les préférences existantes. La migration `033_profile_appearance.sql` ajoute une ligne par profil et une
politique RLS limitée à `app.user_id()`. Elle est enregistrée dans le migrateur
existant. Appliquer les migrations avec le processus de déploiement habituel
avant de publier le code ; aucune migration distante n’est exécutée par cette
fonctionnalité.

- `GET /api/me/appearance` renvoie `{ userId, appearance: { color, font, mode, textSize, categoryColors } }`.
- `PUT /api/me/appearance` accepte strictement `{ color, font, mode, textSize, categoryColors }`, une couleur
  hexadécimale à six chiffres, `default`, `inter`, `nunito` ou `poppins`, et
  `light` ou `dark`. Un ancien client qui omet `mode` utilise `light`.
- Le PUT vérifie l’origine, la session active et la limite de requêtes. Le header
  `X-Appearance-Account` doit correspondre à l’utilisateur connecté : c’est une
  protection contre un changement de session dans un autre onglet, pas un moyen
  de choisir le profil à modifier.
- Les réponses sont privées et non mises en cache. La base reste la source de
  vérité. Le cache navigateur `atacuisine-appearance:v1:<profile-id>` est utilisé
  seulement lorsque l’identité est connue. Aucun cache global du dernier compte.
- Sans réseau, le dernier thème connu reste utilisable. Une sauvegarde échouée
  garde les choix dans le panneau ; l’utilisateur réessaie après reconnexion.
  Aucun envoi différé automatique. La page de secours mutualisée du service worker
  est chargée sans cookies : elle ne conserve jamais l’identité ni le thème d’un
  précédent utilisateur. Hors ligne, un thème personnel est restauré uniquement
  si l’identité du compte est déjà connue.

## Limites visuelles

Le fournisseur de thème est placé dans le layout racine, au-dessus des limites
de chargement. L’identité et les préférences sont lues côté serveur pour que le
premier HTML soit déjà personnalisé. Le thème reste actif pendant la navigation
et couvre aussi guide, pointage, parrainage et mode hors ligne. Les fenêtres
ouvertes hors de la hiérarchie visuelle reçoivent les mêmes variables. Les aperçus du site restent isolés dans
leurs iframes. Les couleurs métier gardent leur signification ; les impressions
réinitialisent les variables personnelles. Les QR codes conservent leur papier blanc et leurs tracés originaux pour rester
scannables. Les textes et les surfaces utilisent des variantes adaptées à chaque
mode ; les boutons principaux gardent la couleur choisie et un libellé blanc. Les polices sont locales, sans téléchargement externe.

## Vérification

`tests/appearance.test.ts` couvre contrastes, validation, migration, persistance
et isolation avec le rôle applicatif SQL. `tests/e2e/appearance.spec.ts` couvre
les parcours et protections HTTP, le chargement initial, les boutons, le passage
jour/nuit, les pages annexes et la persistance sur une autre session de navigateur,
sur une instance de démonstration isolée.

## Lisibilité et repères d’activité

La migration `035_appearance_accessibility.sql` ajoute `text_size` et
`category_colors` au même profil. Tailles : `standard`, `large`, `extraLarge`
(100 %, 115 %, 130 %), avec un minimum de 14 px pour les textes de gestion.
Les sept familles sont pilotage, opérations, gestion, équipe, finances,
relation client et configuration/sécurité. Chaque couleur est validée comme
hexadécimale à six chiffres. Les champs omis utilisent les valeurs par défaut.
Les variantes de badges sont ajustées pour un contraste de texte suffisant.

Le journal affiche des libellés compréhensibles, des badges et des filtres par
famille ; les messages d’audit stockés restent intacts. Les mêmes repères
apparaissent dans la navigation, les commandes et la cuisine. Les couleurs
sémantiques des erreurs, avertissements et statuts restent indépendantes.
La couleur n’est jamais le seul indicateur : les familles portent un libellé.

## Sites publics

Chaque site CMS expose deux commandes Jour/Nuit accessibles sur mobile.
Sans choix explicite, il suit le réglage du système. Le cookie fonctionnel
`atacuisine_public_mode` mémorise le choix du visiteur pendant un an sur le
domaine courant ; il ne contient aucune identité et ne modifie aucun profil.
Le serveur lit ce choix pour le rendu initial. Les formulaires et les fenêtres
partagent le mode du site. L’identité de l’établissement reste utilisée en mode
jour ; le mode nuit adapte les surfaces et contrastes sans inverser les images.

`tests/e2e/accessibility-appearance.spec.ts` vérifie les tailles, familles,
filtres, annulation, sauvegarde et isolation des comptes, ainsi que les modes
publics, leur persistance, les formulaires et la navigation mobile.

Les surfaces du tutoriel (accueil, centre d’apprentissage, bulles, fin de visite)
reçoivent explicitement le thème courant du compte. Les repères, boutons et
progressions utilisent ses variantes lisibles, y compris dans les modes Jour/Nuit.
`tests/e2e/tutorial-appearance.spec.ts` couvre ces quatre surfaces, un parcours
complet, le clavier, les grands textes et le mobile dans les deux modes.
