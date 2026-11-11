# Groupes de workers

Les tâches de fond tournent dans trois groupes de processus séparés, pour qu'un transcodage ou un scan ne retarde jamais un paiement, et qu'un client chargé ne ralentisse pas les autres.

Il s'agit de services Docker Compose sur un seul hôte. Il n'y a ni cluster ni routage multi-cluster : `organization_placements.cluster_key` reste inutilisé.

## Groupes

| Service | Groupe | Jobs | Concurrence | CPU / mémoire par défaut | Connexions |
|---|---|---|---|---|---|
| `worker-critical` | `critical` | `stripe_event`, `stripe_payout`, `payout_schedule`, `online_order_timeout` | 4 | 1 / 512 Mo | 6 |
| `worker-maintenance` | `maintenance` | `security_scan`, `security_archive`, `seo_audit`, `email_send`, tout type sans groupe, purge | 2 | 1 / 512 Mo | 4 |
| `worker-media` | `media` | `media_transcode` | 1 | 2 / 2 Go | 3 |

Ces valeurs sont un point de départ, sans mesure de charge en conditions réelles. CPU et mémoire se règlent avec `WORKER_<GROUPE>_CPUS` et `WORKER_<GROUPE>_MEMORY`, la concurrence avec `WORKER_CONCURRENCY`, définie dans `src/features/platform/worker-groups.ts`.

En développement, `npm run worker` lance un seul processus qui traite tout (`WORKER_GROUP=all`).

Pour absorber plus de charge sur un groupe :

```sh
docker compose up -d --scale worker-maintenance=2
```

Vérifiez d'abord le budget de connexions ci-dessous.

## Équité entre clients

`app.claim_jobs` applique deux règles, par groupe :

- **Plafond :** un seul job en cours par restaurant. Un client ne peut pas occuper tous les créneaux, et ses paiements restent traités un par un.
- **Tourniquet :** le prochain job vient du restaurant servi il y a le plus longtemps. Mille jobs d'un client passent après l'unique job d'un autre.

Un verrou court sérialise les réclamations d'un groupe : le plafond reste strict avec plusieurs réplicas.

## Fiabilité

- **Bail :** un job est réservé 2 minutes et son worker renouvelle la réservation toutes les 30 secondes. Si le worker plante, le job est repris à l'expiration, au plus 5 tentatives.
- **Arrêt propre :** à la réception de `SIGTERM`, le worker termine ses jobs et n'en prend plus aucun. `stop_grace_period` lui laisse 3 minutes.
- **Type inconnu :** le groupe `maintenance` prend tout ce qui n'appartient pas à un autre groupe. Un nouveau type sans traitement échoue donc de façon visible au lieu d'attendre indéfiniment.
- **Santé :** chaque worker écrit un signal de vie dans `WORKER_HEALTH_FILE`, lu par le healthcheck de Compose.

## Purge

`app.purge_jobs()` tourne une fois par heure dans le groupe `maintenance`.

| Jobs terminés | Conservation | Raison |
|---|---|---|
| `security_scan`, `seo_audit`, `security_archive` | 7 jours | Ils se recréent sans cesse |
| Tous les autres | 90 jours | Leur clé de déduplication rend un rejeu Stripe sans effet |
| En échec | Sans limite | Ils servent au diagnostic |

Les compteurs de rate limit expirés sont aussi supprimés.

## Budget de connexions

`max_connections` de PostgreSQL vaut 100 par défaut.

| Service | Connexions max |
|---|---|
| `app` (`APP_DB_POOL_SIZE`) | 20 |
| Workers (6 + 4 + 3) | 13 |
| Keycloak (`KC_DB_POOL_MAX_SIZE`) | 20 |
| **Total** | **53** |

Chaque réplica supplémentaire ajoute le pool de son groupe.

## Ajouter un type de job

1. Traitez le type dans `scripts/worker.ts`.
2. Si le job est critique ou lourd, ajoutez-le à son groupe dans `worker-groups.ts`. Sinon, il va dans `maintenance`.
3. Déposez-le avec `enqueue()`. `tests/worker-groups.test.ts` échoue si le worker ne le traite pas.

## Vérifier

`npm run test:isolation` (voir [TENANT_ISOLATION.md](TENANT_ISOLATION.md)) vérifie contre un vrai PostgreSQL :

- 1 000 jobs de A ne retardent pas l'unique job de B ;
- le tourniquet alterne, et des réclamations simultanées ne doublonnent aucun job ;
- un groupe ne prend pas les jobs des autres ;
- un bail valide n'est pas repris, un job abandonné l'est une seule fois ;
- un vrai worker traite ses jobs sans écrire chez un autre client, s'arrête proprement et refuse un rôle privilégié ;
- un worker média tué en plein transcodage voit son job repris une fois.

## Limites

- Ces tests lancent les workers comme processus. Les limites CPU et mémoire de Compose n'ont pas été exercées en charge.
- Le serveur web reçoit encore les vidéos en mémoire (100 Mo au maximum, deux envois simultanés par processus), et l'IA factures, les exports et l'assistant restent synchrones.
- Tous les médias publics passent par l'application, sans CDN.
