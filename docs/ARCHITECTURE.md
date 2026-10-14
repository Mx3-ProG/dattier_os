# Architecture

Next.js App Router, React, TypeScript strict, Tailwind 4 et CSS de design, composants accessibles Radix (modales) et primitives de boutons suivant la composition shadcn, Lucide, Recharts chargé à la demande. Pas de bibliothèque d’animation lourde : les interfaces métier privilégient la lisibilité.

## Flux

Navigateur → Route Handler `/api/v1/*` → validation Zod → session opaque → appartenance à l’établissement → permission métier → service transactionnel → PostgreSQL → réponse et prochain polling des autres clients.

- `src/features/orders/service.ts` : commandes, lots, transitions, règlements, événements.
- `src/lib/actions.ts` : actions complémentaires et réservation publique.
- `src/lib/snapshot.ts` : lecture filtrée par permission, projection des disponibilités.
- `src/lib/database` : adaptateur PGlite et seed reproductible.
- `src/lib/auth` et `permissions.ts` : sessions et RBAC.
- `src/components` : vues métier, formulaires, site public.

PGlite exécute PostgreSQL embarqué côté Node et persiste sur disque. Ce n’est ni du localStorage ni un tableau JSON : clés étrangères, contraintes, agrégations, transactions et verrous SQL sont effectifs. Il sert d’alternative sans Docker dans cet environnement. Une instance PGlite unique et sa file transactionnelle sérialisent les écritures concurrentes. Plusieurs clients consultent le même serveur ; plusieurs processus ne doivent pas ouvrir le même dossier.

Les tickets sont des projections de `order_items`, regroupées par commande et station : une table supplémentaire de tickets n’apporte pas de donnée indépendante dans cette V0. Une ligne de plusieurs portions progresse ensemble.

## Atomicité

Création = session de table éventuelle + commande + lignes + affectations FEFO de lots non expirés + mouvements + audit + notification dans une transaction. Tout revient en arrière si un ingrédient manque. La clé d’idempotence est unique en base. Préparer déduit le physique et le réservé ensemble. Annuler avant libère ; après conserve le stock déduit et marque les réservations consommées comme perdues. Clôturer regroupe toutes les commandes actives d’une session et refuse toute ligne non servie/non annulée.

## Synchronisation

Le tableau de bord interroge une projection cohérente toutes les 3 s ; le site public toutes les 5 s. Ce délai est explicite dans l’interface. Les données persistent lors d’un changement de rôle ou d’un rechargement. Pour Supabase Realtime : remplacer le déclencheur de rafraîchissement par une souscription, tout en conservant une relecture serveur autorisée après chaque événement.

## Sécurité locale

Origine POST contrôlée, entrées Zod bornées, requêtes paramétrées, cookies HttpOnly et SameSite strict, jetons hachés, coûts masqués aux rôles non financiers. Les routes publiques ne retournent ni coordonnées privées, ni stocks détaillés, ni coûts. La démo exige `DATTIER_DEMO=true` et refuse Vercel. RLS activée partout sans politique publique par défaut ; connexion locale privilégiée, RBAC dans les services. Ce n’est pas encore une validation RLS sous un utilisateur Supabase.

Avant toute exposition réseau réelle : authentification de production, autorisations SQL par opération, limitation de débit persistante, limites de corps effectives au proxy, monitoring, sauvegardes, politiques de conservation et tests de pénétration ciblés. Le serveur de démo reste lié à 127.0.0.1.
