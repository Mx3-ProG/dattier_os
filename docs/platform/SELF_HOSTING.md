# Auto-hébergement

## Installation de référence

Prérequis : Docker Compose récent, domaines sous votre contrôle et accès SMTP pour la vérification des comptes. L’installation fournie démarre PostgreSQL 16, l’application, un worker, Keycloak et Garage compatible S3. Elle conserve les données sur des volumes. Aucun service payant n’est créé par ces fichiers.

```sh
npm ci
npm run setup:env
# Éditer .env.production : domaines, URL des sources exactes et paramètres d’identité.
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production up --build -d
```

Le générateur n’écrase jamais un fichier existant et crée des secrets locaux avec des permissions 0600. Ne publiez pas ce fichier. Les mots de passe générés sont compatibles avec les URL PostgreSQL ; si vous les remplacez, encodez les caractères réservés.

La migration s’exécute avant l’application et le worker, sans seed fictif. Le script d’initialisation PostgreSQL sépare les comptes migration/application/worker/identité. Une modification des variables d’un volume existant ne change pas ses mots de passe : utilisez une procédure de rotation adaptée. Le worker est réparti en trois services (`worker-critical`, `worker-maintenance`, `worker-media`) avec leurs limites de ressources, voir [WORKER_GROUPS.md](WORKER_GROUPS.md). `scripts/migrate.ts` n’accorde plus de droits globaux : ils viennent des migrations.

Le conteneur applicatif n’a pas les identifiants du migrateur ni ceux de la base d’identité. Les services PostgreSQL et stockage n’ont pas de port publié ; application et identité écoutent sur le loopback de l’hôte.

## HTTPS, identité et domaines

Placez un reverse proxy HTTPS devant l’application et Keycloak. `APP_URL` et `IDENTITY_URL` doivent correspondre aux URL externes. Le realm importe un client public avec PKCE et une URL de retour exacte `${APP_URL}/auth/callback`. Le compte doit avoir son e-mail vérifié. Configurez le transport SMTP dans Keycloak avant d’ouvrir les inscriptions ; sa récupération de compte assure aussi la réinitialisation des mots de passe.

Le transport d’identité n’est pas testé avec un fournisseur de messagerie réel. Pour un test local exclusivement, `OIDC_ALLOW_HTTP=true` permet un émetteur HTTP ; ne l’activez pas sur Internet.

Un domaine de restaurant est revendiqué dans Mon site puis vérifié par DNS TXT. La vérification applicative ne crée ni DNS de routage ni certificat. Le proxy résout uniquement les domaines vérifiés. Les connexions client sont ramenées vers le domaine central pour conserver une identité fiable sans cookie partagé entre domaines indépendants.

## Content Security Policy

Chaque page reçoit une CSP avec un nonce propre à la requête. `CSP_MODE` choisit son effet :

- `report-only`, par défaut : rien n'est bloqué, les violations sont seulement signalées.
- `enforce` : les violations sont bloquées.

Les violations arrivent dans les journaux de l'application, sur des lignes `[csp]`, sans requête ni fragment d'URL :

```sh
docker compose --env-file .env.production logs app | grep '\[csp\]'
```

Observez ces lignes une à deux semaines, corrigez ce qui relève de l'application, puis passez à `CSP_MODE=enforce` et redémarrez le service `app`. Pour revenir en arrière, remettez `report-only`. Des extensions de navigateur peuvent aussi produire des lignes : elles n'indiquent pas un défaut de l'application.

## Stockage

Le déploiement utilise Garage et ses clés/bucket initiaux. Son endpoint est interne et les médias publics passent par une route qui vérifie l’établissement et la publication. Un service S3 externe peut remplacer Garage par configuration.

La composition est **mono-nœud**, sans redondance. Pour un pilote public important, utilisez une topologie de stockage redondante ou un stockage géré, des sauvegardes externes et un test de restauration. [Documentation Garage](https://garagehq.deuxfleurs.fr/documentation/quick-start/) ; [configuration](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/).

## Sauvegardes et mise à jour

`scripts/backup.sh` produit un dump PostgreSQL, un manifeste et son empreinte dans une destination fournie par l’opérateur. Le chiffrement de la destination et sa copie externe sont à configurer. Sauvegardez séparément la base Keycloak et les objets S3 ; un dump de la base métier ne contient pas les médias ni les identités.

Avant mise à jour : sauvegarde, restauration de contrôle sur une autre base, migration sur copie puis vérification des droits et parcours. Conserver l’ancienne image pour le retour applicatif. Les migrations additives ne sont pas annulées automatiquement ; un retour de données exige une restauration cohérente base/médias/identité.

## Conditions d’ouverture

- Identité et e-mails réellement validés ; HTTPS et domaines correctement routés.
- Rôle applicatif non propriétaire, tests d’accès croisés et dépendances examinées.
- Sauvegardes externes restaurées en test, alertes, responsabilités d’intervention.
- Conditions et informations du restaurateur renseignées ; règles des prestataires validées.
- Mesure des parcours HTTP, de la concurrence et des coûts avec une première vague contrôlée.

Le dépôt et ses tests locaux ne prouvent pas à eux seuls ces conditions.
