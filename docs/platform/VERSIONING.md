# Versionnage — STUDIO OS

## Convention

- **SemVer** : `MAJOR.MINOR.PATCH`
  - `MAJOR` : changement cassant (route, schéma DB, API publique)
  - `MINOR` : nouvelle fonctionnalité rétrocompatible (nouveau module, nouveau secteur, nouvelle route neutre)
  - `PATCH` : correction de bug, ajustement de wording, performance

## Version actuelle

- `1.1.0` — amorçage multi-métiers : wording adaptatif, route neutre `/commerce/[id]`, aliases `BusinessHub`/`BusinessAdminShell`, ouverture des modules à tous les secteurs.

## Règles de release

1. Mettre à jour `package.json` et `VERSION` ensemble.
2. Ajouter une entrée dans `CHANGELOG` (ou notes de release) décrivant les migrations et les risques.
3. Tagger le commit : `git tag -a vX.Y.Z -m "..."`.
4. Exécuter avant release : `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`.
5. Déployer d’abord sur un établissement pilote (canary) puis généraliser.

## Migrations et compatibilité

- Les migrations SQL sont idempotentes et versionnées via `schema_versions`.
- Garder les anciennes routes/composants comme alias pendant au moins une version majeure.
- Toute migration cassante doit prévoir un rollback et être testée sur une copie de la base de prod.
