# Lot 3 — Identité publique STUDIO OS / STUDIO VOICE

## Livré

Renommage des libellés visibles : accueil, connexion, inscription, poste de travail, administration, guides, parrainage, écrans de démonstration, métadonnées et manifeste. L'assistant affiche STUDIO VOICE, y compris ses noms accessibles, messages vocaux et instructions de présentation. Le producteur des nouveaux PDF de facturation utilise STUDIO OS.

Studio ATS reste l'éditeur. Les nouveaux contenus CMS par défaut portent la nouvelle marque ; aucune publication cliente existante n'est réécrite. L'adresse illustrée des modèles de site utilise example.com pour ne pas présenter un domaine de la nouvelle marque comme acquis.

La configuration métier disponible reste la restauration : l'assistant ne doit pas annoncer des outils d'autres métiers non implémentés. Le positionnement générique ne retire aucune fonction restaurant.

## Compatibilité conservée

Cookies OIDC/session, issuer/audience, variables d'environnement ATACUISINE, rôles SQL, noms de tables, anciennes routes, ancres cuisine-ia, identifiants IndexedDB, clés paniers/consentement/apparence/tutoriel, fichiers de sauvegarde/export historiques, caches du service worker et données existantes sont conservés. Aucun domaine n'est changé. Les noms de fichiers/composants techniques de l'assistant restent compatibles avec leurs imports.

La marque textuelle change ; les pictogrammes existants et les icônes d'installation restent en place. Un nouveau logo graphique universel constitue une évolution distincte. Les contenus historiques, documents déjà téléchargés et noms de paquets/infrastructure ne sont pas réécrits.

## Vérification

Suite métier, typage et ESLint ciblé exécutés ; compilation et contrôle navigateur sur une copie temporaire sans secrets ni données existantes. Les résultats finaux sont consignés à la fin de ce document. La revue React n'introduit ni état ni requête supplémentaire dans les composants renommés.

## État des autres lots

Le lot 2 n'est pas déclaré totalement terminé : les achats indépendants des autres add-ons, la prévention complète des chevauchements d'abonnement et la validation Stripe de bout en bout restent ouverts. Le seul parcours d'achat raccordé est Factures fournisseurs en test, sous condition de configuration. Le renommage n'active aucun paiement.

## Résultats de validation locale

- 239 tests métier réussis, aucun échec.
- TypeScript sans erreur ; ESLint ciblé sans erreur ; `git diff --check` réussi.
- Compilation de production Webpack réussie dans une copie temporaire isolée.
- Contrôle Playwright ciblé réussi : titre STUDIO OS, manifeste, connexion Nadia, cookie de session historique conservé, marque du dashboard, bouton accessible STUDIO VOICE sur ordinateur et à 390 px, absence de débordement horizontal et d'erreur JavaScript dans ce parcours. Captures examinées pour le contrôle visuel mobile.
- Le contrôle navigateur porte sur le renommage et la connexion, pas sur une transaction Stripe ni sur tous les parcours métier. Les dernières corrections grammaticales de libellés (`d’STUDIO OS` → `de STUDIO OS`) ont été réalisées après la copie de compilation ; elles n'affectent pas ces parcours.
- Aucun déploiement ni migration de production exécuté.
