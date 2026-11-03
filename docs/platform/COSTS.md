# Hypothèses économiques

Le modèle modifiable est dans `COSTS.json` ; `node --import tsx scripts/costs.ts` recalcule les scénarios. Tous les chiffres ci-dessous sont **illustratifs**, hors taxes, et ne sont pas des devis fournisseurs.

Hypothèses : abonnement de 25 €/restaurant/mois, coût variable d’infrastructure de 0,45 €, support de 5 minutes/mois/restaurant valorisé à 30 €/heure. Le coût fixe varie selon le scénario.

| Restaurants | Coût mensuel modélisé | Coût par restaurant | Contribution à 25 €, avant exclusions |
| ----------- | --------------------: | ------------------: | ------------------------------------: |
| 100         |                 545 € |              5,45 € |                               19,55 € |
| 500         |               2 075 € |              4,15 € |                               20,85 € |
| 1 000       |               3 950 € |              3,95 € |                               21,05 € |
| 10 000      |              37 500 € |              3,75 € |                               21,25 € |

Ces contributions ne sont pas des marges nettes. Elles excluent notamment développement, acquisition commerciale, onboarding, certifications, assurance, incidents, fiscalité et services spécialisés. Passer de 5 à 20 minutes de support ajoute 7,50 € par restaurant dans cette hypothèse ; le support peut donc peser davantage que l’hébergement.

Avant de fixer 20–30 € : obtenir les devis, mesurer stockage/transactions/trafic/e-mails, préciser ce que l’assistance couvre, définir des limites d’usage lisibles et tester le coût d’un établissement très actif. La rémunération et les frais de paiement des restaurants doivent rester distincts de l’abonnement logiciel.
