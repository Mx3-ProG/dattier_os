# Validation locale — 14 octobre 2026

## Vérifications exécutées

- TypeScript strict : réussi.
- ESLint : réussi, zéro erreur ni avertissement dans le code.
- Tests Node : 15 réussis. Conversion/unités, RBAC, parcours complet transactionnel, idempotence, annulations avant/après consommation, concurrence sur le dernier stock, masquage financier et isolation, réception partielle/inventaire/péremption, conflit de réservation, addition regroupée, QR sans session refusé et fermeture/réouverture de base persistante.
- Playwright Chromium : 3 parcours réussis. Profil Sarah → Karim → Youssef → Sarah → Amine → Nadia, rechargement, règlement, réservation publique depuis un second onglet, refus HTTP, largeur 390 px ; second parcours avec deux contextes authentifiés distincts et apparition de commande sans rechargement.
- Build Next.js de production : réussi.
- Audit des dépendances runtime : zéro vulnérabilité signalée. Voir KNOWN_LIMITATIONS pour les alertes de l’outillage de lint.

## Preuves visuelles

- `dashboard-desktop.png` : dashboard propriétaire.
- `salle-mobile.png` : salle et commandes à 390 px.
- `site-mobile.png` : site public à 390 px.

Les captures sont des états de démonstration issus des tests, pas des données du restaurant réel. Les tests E2E opèrent et réinitialisent la base de démo.

## Portée

Le build a été compilé localement, pas déployé. Les tests de persistance ferment et rouvrent une base de test sur disque ; les tests UI rechargent la page. Les tests ne certifient ni Supabase Auth/RLS/Realtime distants, ni Vercel, ni accessibilité exhaustive, ni fiscalité, ni notifications externes. Ces intégrations ne sont pas implémentées.

## Évolution carte et fidélité

Migration 002 testée sur un schéma existant, avec conservation d’un enregistrement préalable et deuxième exécution sans effet. Tests du cycle produit et de la suppression protégée, des droits du manager, de la prise de commande cuisine/bar sous leur identité, du débit de points atomique, du code nominatif, de sa validité, de son usage unique, de l’annulation avec restitution idempotente et d’une remise couvrant toute l’addition.

Le nouveau parcours Chromium crée un produit avec recette via Lina, l’archive et le restaure, supprime un autre produit inutilisé, crée un client et ses points, lui attribue un code, ouvre sa fiche privée, prend une commande depuis Karim et applique le code au règlement via Lina. Youssef prend ensuite une commande de boissons depuis le plan de salle. Les trois tests ont été exécutés sur `127.0.0.1:3100` avec `.data/acceptance-demo`, sans réinitialiser la base de démonstration ouverte sur le port 3000.
