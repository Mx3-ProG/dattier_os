# Initialisation Supabase réalisée le 10 novembre 2026

Projet : **Studio-OS-Monolithe**, organisation Wayne-web,
référence `kaedxrnfrccwsekmbbbv`, branche main (production).

Exécution effectuée dans l’éditeur SQL de Safari à la demande du propriétaire.
Avant installation : zéro table dans public, aucun historique de migration,
zéro utilisateur dans auth.users.

## Résultat vérifié sur la base distante

- 79 migrations enregistrées, dernière version 102.
- 155 tables dans public ; aucune sans RLS.
- Zéro profil et zéro établissement : aucun seed de démonstration exécuté.
- Aucun privilège de table accordé à anon ou authenticated dans public.
- Rôle atacuisine_app sans connexion, sans superutilisateur et sans BYPASSRLS.

Installation : [requête SQL](https://supabase.com/dashboard/project/kaedxrnfrccwsekmbbbv/sql/5714a7fc-e366-458b-919f-9e888cd118f3).
Vérification : [requête de contrôle](https://supabase.com/dashboard/project/kaedxrnfrccwsekmbbbv/sql/d7c68725-a637-4086-a87a-b78bb545be99).

## Méthode

001_core.sql puis les fichiers du manifeste src/lib/database/migrate.ts,
dans leur ordre déclaré, jusqu’à 102_demo_crm_contacts_repair.sql.
Le même script a d’abord été testé sur une base locale PGlite vierge.
Transaction unique, verrou de migration et garde refusant une base public non vide.
Le schéma conserve l’organisation technique legacy créée par les migrations.

En fin de transaction : révocation des accès directs anon/authenticated aux tables
et séquences public, révocation de l’exécution des fonctions public/app pour
PUBLIC/anon/authenticated, et activation de RLS sur toutes les tables public.
Les autorisations des rôles serveur spécifiques aux migrations sont conservées.
Ce modèle correspond à l’accès PostgreSQL côté serveur existant ; il ne fournit
pas un accès navigateur Supabase Auth aux tables.

Script local : /tmp/studio-os-supabase-initial.sql.
SHA-256 : b292e9602b8ca19da7bf23a50bd29590ae14463e60a517ff0a7f1f769f353072.
Ne pas rejouer ce script d’initialisation sur une base maintenant remplie.
Les prochaines migrations doivent utiliser schema_versions pour ne traiter que
les versions absentes.

## Ce qui reste pour une souscription réellement opérationnelle

- Configurer les connexions PostgreSQL serveur avec des rôles non propriétaires.
  Ne pas utiliser postgres comme DATABASE_URL : l’application le refuse.
- Configurer et vérifier l’identité de production : le code actuel utilise OIDC,
  pas automatiquement Supabase Auth. La migration seule ne crée pas ce raccordement.
- Implémenter et vérifier le paiement récurrent du forfait principal et son
  activation par événements Stripe signés : le checkout actuel décrit une
  activation manuelle après les trois jours d’essai.
- Adapter et vérifier l’intégration des add-ons pour le mode réel, actuellement
  refusé par billing-config.ts et service.ts ; raccorder les identifiants Price.
- Vérifier inscription, paiement, accès, renouvellement, échec de paiement et
  résiliation sur un environnement isolé avant ouverture commerciale.

Aucun secret de connexion créé ou modifié, aucun réglage Vercel modifié et aucun
déploiement applicatif effectué pendant cette initialisation.
