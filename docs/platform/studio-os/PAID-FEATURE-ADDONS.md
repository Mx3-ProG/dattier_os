# Add-ons de fonctionnalités à 9 € HT par mois

## Périmètre local

Huit droits mensuels indépendants par établissement : présences/heures/absences, factures fournisseurs, factures clients, paie, conflits hors ligne, connexions, QR codes et comptes clients gamifiés. Chaque droit a son abonnement Stripe test, sa ligne de catalogue et son interrupteur d’installation. Le super admin d’établissement peut installer ou désinstaller un droit acquis ; l’équipe partage l’accès selon ses permissions individuelles. Le cœur des commandes et la connexion au compte ne font pas partie de « Connexions » : ce module désigne les intégrations externes.

Une migration attribue des droits historiques aux établissements existants selon leur ancien forfait. Ils ne paient pas rétroactivement et ne perdent pas immédiatement leur accès. Les nouveaux établissements ne reçoivent pas ces droits ; ils doivent souscrire séparément. Les établissements de démonstration créés par `seed` reçoivent des droits de démonstration.

Les Price Stripe doivent être créés en **mode test**, chacun à 900 centimes EUR, mensuel, taxe exclusive. Les variables `STUDIO_ADDON_<ID>_PRICE_ID`, `STUDIO_BILLING_STRIPE_SECRET_KEY`, `STUDIO_BILLING_STRIPE_WEBHOOK_SECRET` et `STUDIO_BILLING_DATABASE_URL` activent les boutons correspondants. Le serveur refuse une clé réelle, un Price au mauvais montant ou rythme et les événements non signés. Le retour de Checkout ne donne aucun droit ; la réconciliation Stripe vérifie l’abonnement et la période payée. Aucun de ces Price n’est encore configuré dans l’environnement connu.

Les principales routes, actions et politiques SQL vérifient le droit effectif par établissement. Les données restent stockées après désinstallation ou expiration. La résolution des conflits est payante ; la synchronisation hors ligne de base reste disponible. Les factures clients et fournisseurs sont deux droits distincts. L’accès aux chiffres financiers généraux reste soumis au forfait et au rôle existants.

## Validation avant ouverture

Vérifier sur une préproduction isolée : les huit Checkout réels en mode test, webhooks de paiement et renouvellement, échec de paiement, remboursement, résiliation, changement de forfait, activation et désactivation par un super admin, accès direct aux routes et politiques PostgreSQL. La production `atacuisine.vercel.app` ne sert pas d’environnement de test pour ces changements non committés. La valeur de chaque Price et les paramètres Stripe Tax doivent être vérifiés dans le compte Stripe test.
