# Validation locale — 3 novembre 2026

## Contrôles exécutés

- TypeScript et ESLint : aucun échec ni avertissement.
- 34 tests métier et d’isolation : réussis. Ils couvrent le service salle/cuisine/bar/règlement/stock, les recettes, les réservations, les permissions cumulées, les invitations, les achats et inventaires, les commandes boutique, les quotas et conflits hors ligne, le studio complet et les archives de sécurité.
- Cinq parcours navigateur : réussis sur une démonstration compilée distincte, dont deux profils simultanés, le studio/sécurité à 390, 768 et 1440 pixels, et la PWA réellement hors ligne. Publication et persistance après rechargement vérifiées, sans débordement horizontal sur ces vues.
- Construction Next.js optimisée et image Docker : réussies.
- PostgreSQL réel : migrations, rôle applicatif non propriétaire sans BYPASSRLS, refus d’accès croisés, création d’établissement, quotas et rejeu vérifiés sur une base jetable.
- Installation Docker locale : connexion OIDC réelle à Keycloak avec PKCE, compte fictif vérifié, création d’organisation/restaurant, enregistrement/publication CMS, envoi et lecture S3 Garage, refus anonyme d’un média non publié, détection de sécurité et rendu public vérifiés.
- Sauvegarde puis restauration indépendante : 4 restaurants, 32 commandes et 28 lots dans les deux bases de contrôle (schéma 15 au moment de cette sauvegarde). Cette preuve ne couvre pas une restauration des médias ou de Keycloak.
- PWA compilée : stock préalloué, coupure réseau, redémarrage, commande locale, second redémarrage et deux synchronisations sans doublon vérifiés.
- Worker : schéma 16 appliqué sur une installation existante ; tâches de détection et d’archivage exécutées, sans erreur enregistrée lors du contrôle.
- Audit limité des fichiers et des objets Git accessibles : aucun motif de secret détecté. Les exclusions et la portée sont dans `RELEASE_AUDIT.json` ; ce résultat ne prouve pas les droits sur chaque ancien média.

## Charge exploratoire

Une exécution SQL synthétique a créé 500 organisations/restaurants puis exécuté 2 000 opérations, concurrence 20 : zéro erreur, environ 1,135 seconde au total, p95 de 19,3 ms sur cette machine. Ce test ne simule ni 500 restaurants réels, ni leurs parcours HTTP, ni leurs pics de service. Il ne permet pas d’annoncer une capacité commerciale.

## Reproduire

```sh
npm run typecheck
npm run lint
npm test
npm run build -- --webpack
```

Les tests navigateur réinitialisent la démonstration. Ne les diriger que vers une installation jetable, avec un dossier de données distinct contenant `demo` :

```sh
ATACUISINE_DEMO=true ATACUISINE_DATA_DIR=/private/tmp/atacuisine-qa-demo npm run start -- --port 3102
# Dans un autre terminal :
E2E_URL=http://127.0.0.1:3102 npm run test:e2e
```

Le scénario PWA doit être exécuté contre une version compilée (`npm run build`, puis `npm run start`) : les ressources et le rechargement à chaud du serveur de développement ne sont pas un socle hors ligne stable.

Pour PostgreSQL, créer une base locale vide dédiée, puis définir `MIGRATION_DATABASE_URL` vers cette base et exécuter `npm run db:migrate`, puis `CONFIRM_ISOLATED_DATABASE=true npm run test:postgres`. Ce scénario crée ses propres identités et données fictives. Le script de charge exige aussi une base explicitement isolée ; lire ses contrôles avant exécution.

## Conditions encore ouvertes

SMTP réel, domaines et HTTPS publics, parcours prestataires, restauration coordonnée base/identités/médias, exploitation et alertes en situation réelle, tests HTTP de charge et cohorte pilote restent nécessaires. Les connecteurs non validés restent désactivés. Les captures et contrôles locaux ne remplacent pas ces conditions.
