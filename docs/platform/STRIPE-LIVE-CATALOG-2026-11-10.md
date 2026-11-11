# Catalogue Stripe réel — avancement du 10 novembre 2026

Compte vérifié dans le tableau de bord : **OS (Atacuisine_OS)**,
`acct_1UYPwHApai8VVkXi`. Les opérations ci-dessous concernent uniquement
le catalogue ; aucun abonnement client ni prélèvement n'a été créé.

## Offre existante

Le produit `prod_VZZaLSq8yVya1u` (« Exploitation ») contient déjà un prix
mensuel de 39 EUR, par défaut, et un autre prix ponctuel de 39 EUR.
Le traitement fiscal du prix existant reste à contrôler avant raccordement.

## Add-ons

Prix récurrents mensuels en EUR, taxes incluses explicitement sélectionnées.

| Add-on | TTC/mois | État observé |
| --- | ---: | --- |
| Factures fournisseurs | 9 EUR | Créé et confirmé dans le catalogue |
| Présences, heures et absences | 9 EUR | Créé et confirmé dans le catalogue |
| Factures clients | 9 EUR | Créé et confirmé dans le catalogue |
| Paie | 9 EUR | Créé et confirmé dans le catalogue |
| Conflits hors ligne | 9 EUR | Créé et confirmé dans le catalogue |
| Connexions | 9 EUR | Créé et confirmé dans le catalogue |
| QR codes | 9 EUR | Créé et confirmé dans le catalogue |
| Comptes clients gamifiés | 9 EUR | Créé et confirmé dans le catalogue |
| Domaine personnalisé | 9 EUR | Créé et confirmé dans le catalogue |
| Scanner de prospects | 69 EUR | Créé et confirmé dans le catalogue |
| Pipeline CRM | 69 EUR | Créé et confirmé dans le catalogue |
| Customer Health | 89 EUR | Créé et confirmé dans le catalogue |
| Click & Collect Premium | 9 EUR | **À créer** (ajouté le 11 novembre 2026, `STUDIO_ADDON_CLICK_COLLECT_PREMIUM_PRICE_ID`) |

Les montants proviennent de `src/features/addons/billing-config.ts`.
Avant de poursuivre, relire le catalogue pour éviter les doublons.

## Raccordement restant

- Relever les identifiants Price et contrôler leurs attributs avant de configurer
  les variables `STUDIO_ADDON_<ID>_PRICE_ID`.
- L'intégration actuelle refuse les clés et événements réels dans
  `billing-config.ts`, ainsi que les prix, sessions, abonnements et factures réels
  dans `service.ts`. Le catalogue réel ne rend donc pas le paiement opérationnel.
- Préparer puis vérifier le parcours abonnement principal, les notifications
  Stripe, l'attribution des droits et leur retrait selon le paiement.
- Raccorder la base et l'hébergement de production une fois leurs paramètres fournis.
- Aucun changement effectué sur le compte marchand AttaQuisine distinct.

## Confirmation finale

Les douze add-ons sont présents et vérifiés dans le catalogue réel :
13 produits au total, avec l’offre Exploitation préexistante.

| Add-on ajouté lors de la reprise | Produit Stripe |
| --- | --- |
| Domaine personnalisé | `prod_VbOuVXyXVNolxB` |
| Scanner de prospects | `prod_VbOuTzNgCsP0oP` |
| Pipeline CRM | `prod_VbOup0EWq14Ony` |
| Customer Health | `prod_VbOuO04FhFvcMc` |

Le produit Comptes clients gamifiés a également été confirmé :
`prod_VbOnBT0Awt6o2x`, 9 EUR par mois.
