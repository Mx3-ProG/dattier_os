# Services spécialisés : sélection préalable

Aucun compte prestataire n’est créé ni activé. Les candidats ci-dessous constituent une direction de raccordement, avec accès et conditions à vérifier avant développement final et ouverture commerciale. Les modules indisponibles sont affichés comme tels dans l’administration.

| Domaine           | Direction                                                          | Accès et validation nécessaires                                                                                                                               | Coûts                                                        |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Paiement marchand | Stripe Connect, charges et transferts séparés (`ONLINE_PAYMENTS.md`) | Code livré et testé avec Stripe simulé. Restent : sandbox réel, avis juridique et comptable, contrat                                                        | Grille commerciale de la plateforme et du marchand à obtenir |
| Caisse            | Sélection d’un partenaire de caisse adaptée au marché français     | Couverture des encaissements, fonctionnement dégradé, matériel, API et exigences applicables à confirmer ; aucune caisse n’est déclarée certifiée par Studio OS | Devis et éventuel matériel séparés                           |
| Comptabilité      | Pennylane                                                          | Choisir jeton d’entreprise ou OAuth partenaire ; sandbox et accord approprié ; rapprochement comptable validé par l’exploitant                                | Abonnement et accès éventuels à confirmer                    |
| Facturation électronique | Plateforme agréée, à choisir | Factures, avoirs, PDF et XML livrés sans transmission (`SALES_INVOICES.md`). Restent : choix de la plateforme, validation du XML, e-reporting |
| Paie              | PayFit                                                             | Accès partenaire, périmètre des variables et procédure de validation avant transmission                                                                       | Abonnement et intégration à confirmer                        |
| Livraison         | Uber Eats Marketplace en premier, autres canaux ensuite            | Approbation partenaire, droits d’accès, menu, disponibilité, annulations et doublons                                                                          | Conditions partenaires et commissions séparées               |

Références officielles consultées : [Stripe Connect](https://docs.stripe.com/connect/direct-charges), [Pennylane](https://pennylane.readme.io/docs/getting-started), [PayFit](https://developers.payfit.io/docs/quickstart-guid), [Uber Eats](https://developer.uber.com/docs/eats/guides/getting-started).

Facturation électronique : aucune plateforme agréée n’est raccordée. Dattier lit les fichiers Factur-X, CII et UBL déposés, sans remplacer la réception officielle.

Le code fournit le chiffrement des secrets lié au restaurant et au prestataire, la vérification d’enveloppes signées, les tâches persistantes et des exports CSV de ventes/pointages. Il ne prétend pas implémenter leurs API métier tant qu’aucun contrat d’accès ni parcours de bout en bout n’a été validé.

L’abonnement logiciel et les fonds des restaurateurs doivent utiliser des circuits distincts. Aucun frais, compte connecté ou abonnement n’est déduit d’une simple configuration locale. Ne jamais placer un secret marchand dans le navigateur ou dans un paramètre d’URL.
