# État d’implémentation

## Présent dans le code

- AGPL, notices, contribution, signalement de sécurité et accès aux sources.
- Adaptateurs PGlite/PostgreSQL, pool, contexte transactionnel, organisations et affectations cumulées.
- RLS, rôle applicatif non propriétaire, contraintes entre établissements et journal d’activité.
- OIDC/Keycloak avec PKCE/nonce, comptes clients séparés par organisation et invitations à usage unique.
- Boutique, variantes tarifaires, créneaux, suivi, paiement au comptoir déclaré, historique, nouvelle commande et avis modérés.
- Studio complet par établissement repris du ZIP : sections ajoutables, pages, Ma story, identité, couleurs/polices, SEO, aperçu ordinateur/tablette/mobile, brouillons, publication/version/restauration et verrous. Médiathèque image/vidéo avec stockage S3 privé et contrôle des références publiées.
- Centre de sécurité complet : journal filtrable, incidents, connexions récentes, propositions de correction, approbation, maintenance par worker, archives quotidiennes et vérification des empreintes. Mode observation initial.
- Ingrédients, conversions, recettes des suppléments, inventaires et achats multilignes avec réceptions partielles ; transferts internes au restaurant par service.
- Appareils hors ligne, quotas de lots, file IndexedDB, synchronisation dédupliquée et conflits conservés.
- Boîte d’envoi persistante, worker, exports de ventes/pointages, chiffrement des secrets de connecteurs et vérification d’enveloppes signées.
- Forfaits par organisation, contrôle du nombre d’établissements et gestion manuelle du pilote.
- Composition auto-hébergeable, migrations séparées et outils de sauvegarde/import/charge.

## Partiel ou à raccorder

- Les nouvelles routes sont documentées et validées par Zod ; un contrat OpenAPI versionné stable reste à publier avant des clients tiers.
- Les domaines existants se connectent par preuve DNS ; aucune création automatique de zone DNS ou de certificat n’est exécutée.

- Les conflits hors ligne sont conservés et affichés ; un responsable peut demander une reprise ou rejeter une opération avec justification. Les cas nécessitant une décision physique de stock restent à traiter manuellement. La réconciliation d’un appareil libère les quotas inutilisés et ferme l’appareil ; elle nécessite un inventaire des opérations locales.
- Le navigateur ne garantit ni conservation après effacement ni synchronisation lorsqu’il est fermé. Aucun échange automatique entre appareils pendant la coupure.
- Les transferts entre établissements, le routage multi-clusters et les migrations d’organisation entre clusters ne sont pas implémentés.
- Paiements en ligne, remboursements PSP, caisse, comptabilité, paie et livraison restent indisponibles tant que les accès et parcours prestataires n’ont pas été implémentés/validés. L’activation des forfaits et la facturation sont manuelles pendant le pilote.
- Les informations légales et la gestion complète des droits RGPD restent à établir avant des données réelles.
- Les tests locaux ne valent pas audit de sécurité indépendant, validation réglementaire, haute disponibilité ni pilote de 100–500 restaurants réels.

La documentation historique sous `docs/` décrit la V0 locale. Les fichiers sous `docs/platform/` décrivent la nouvelle extension et ses limites ; ils ne doivent pas être interprétés comme une déclaration de mise en production.

## Accès à la démonstration locale

Avec `DATTIER_DEMO=true`, choisir Nadia dans `/demo`, puis ouvrir :

- `/restaurant/bernay/site` : studio complet du site.
- `/r/bernay` : site publié, `/r/bernay/histoire` : Ma story.
- `/restaurant/bernay/security` : sécurité opérationnelle.
- `/restaurant/bernay` : équipes, boutique, clients, stocks et réconciliation.
- `/offline` : poste local avec quotas attribués en ligne.

La vitrine historique Dattier reste disponible à la racine de la démonstration. Les données de cette vitrine ne sont pas automatiquement recopiées dans le CMS. L’installation PostgreSQL ne reçoit aucune donnée fictive.
