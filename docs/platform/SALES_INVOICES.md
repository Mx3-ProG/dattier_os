# Factures clients

Module « Factures clients » (permission finance). Migration `041_sales_invoices.sql`, code dans `src/features/billing/`.

## Ce qui est livré

- **Identité de facturation** : raison sociale, forme, adresse, SIREN, TVA, capital, RCS, délai de paiement, pénalités. Elle est figée dans chaque facture à son émission.
- **Brouillon** : émis ou abandonné, sans numéro ni écriture tant qu'il n'est pas émis. Une ligne sans taux de TVA bloque l'émission en régime normal : aucun taux n'est déduit.
- **Émission** : numéro continu par type et par année (`F-2026-000001`, `AV-2026-000001`), attribué dans la transaction, à la date du jour. Le document devient immuable, un déclencheur de base l'impose.
- **Facture depuis une vente encaissée** : documente la vente sans seconde écriture, la vente étant déjà comptabilisée. Elle est marquée acquittée.
- **Avoirs** : total ou partiel, par ligne et quantité. Ils ne dépassent jamais ce qui reste à créditer (`applied`). Le trop-perçu éventuel est indiqué, aucun remboursement n'est exécuté.
- **Règlements** : partiels possibles, manuels ou depuis le rapprochement bancaire. Annuler un rapprochement contre-passe l'écriture.
- **Écritures** : 411 au débit, 707 et 44571 au crédit à l'émission ; banque ou caisse contre 411 au règlement. Grand livre en ajout seul.
- **Documents** : PDF et XML CII téléchargeables après émission uniquement. Export des écritures au format FEC par période, avec le numéro de facture en `PieceRef`.
- **Assistant et tableau de bord** : créances à encaisser et factures en retard, en lecture seule.

## Ce que ces documents ne sont pas

- **Le PDF n'est pas une facture électronique.** Il sert au client qui n'est pas concerné par la réforme, ou à l'archivage interne.
- **Le XML n'a pas été validé** par un outil officiel (schéma Factur-X, Schematron, plateforme agréée). Il n'est ni embarqué dans le PDF ni transmis. Son profil annoncé (`basicwl`) reste à confirmer.
- **Aucune transmission** vers une plateforme agréée : aucune n'est choisie, et aucun e-reporting n'est fait.
- **L'export FEC n'est pas un FEC officiel** tant qu'il n'a pas été contrôlé par l'expert-comptable (par exemple avec Test Compta Demat). Il couvre seulement les écritures de Dattier, sans comptes auxiliaires ni reprise de l'exercice. Une pièce de vente au comptoir garde son identifiant interne.

## À confirmer par un professionnel

Les mentions ont été établies à partir de sources secondaires, pas d'un texte officiel :

- mentions complètes selon la forme juridique et le client ;
- **conditions d'escompte** : aucune ligne dédiée, à ajouter si besoin dans le texte des pénalités ;
- **nouvelles mentions de la réforme**, dont la catégorie d'opération et l'option de TVA sur les débits : non couvertes ;
- règles de numérotation et date d'émission antérieure ;
- taux et exonérations : la franchise affiche sa mention, l'export hors de France n'est pas traité ;
- le prix unitaire hors TVA est déduit du prix TTC saisi et arrondi au centime. Les totaux par taux font foi ;
- durée et mode de conservation des documents émis : les PDF sont régénérés à la demande depuis les données figées, pas archivés.

## Hypothèses de réglage

La facture passe le compte de vente générique par taux. La répartition par famille de produits n'est pas faite ici.

## Retour arrière

`down/041_sales_invoices.sql` refuse de s'exécuter si une facture existe, pour ne jamais perdre une numérotation émise. `042_finance_alignment.sql` aligne les bases de développement, sans effet sur une installation neuve.
