# Paiements en ligne et versements

État : développé et vérifié avec Stripe **simulé**. Jamais exécuté contre l'API Stripe réelle. Ne pas ouvrir en production sans validation juridique et comptable.

## Circuit

1. Le client paie sur la boutique via Stripe Checkout, sur le compte Stripe de la plateforme.
2. Une notification signée confirme le paiement. La commande part alors en cuisine et l'écriture de vente est préparée.
3. La vente reste retenue pendant le délai configuré, puis devient versable si les contrôles passent.
4. Le 1er et le 16 du mois, ou à la demande du restaurateur, le net est transféré sur son compte connecté. Stripe le vire ensuite sur son IBAN selon le calendrier du compte.

Configuration Connect : Accounts v2, tableau de bord Express, tarification gérée par la plateforme, solde négatif à la charge de la plateforme, charges et transferts séparés. Ce mode est le seul qui permet de retenir puis libérer les fonds. **Dattier est le marchand officiel de la transaction chez Stripe** : les remboursements, litiges et frais Stripe sont débités de son compte.

## Réglages

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | vide | Sans clé, le paiement en ligne reste fermé. Préférer une clé restreinte (`rk_`) |
| `STRIPE_WEBHOOK_SECRET` | vide | Signature des notifications sur `/api/webhooks/stripe` |
| `ATACUISINE_STRIPE_LIVE_APPROVED` | `false` | Une clé réelle est refusée tant que cette valeur n'est pas `true` |
| `ATACUISINE_COMMISSION_BP` | `700` | Commission de la plateforme : 7 % |
| `ATACUISINE_STRIPE_FEE_BP` | `300` | Frais Stripe estimés retenus au restaurant : 3 % |
| `ATACUISINE_PAYOUT_HOLD_DAYS` | `31` | Délai avant versement, figé sur chaque paiement |

Évènements à activer sur le webhook : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.

Le worker doit tourner : il traite ces notifications et effectue les transferts.

## Contrôles anti-fraude

Une vente n'est versable que si tout est réuni : compte connecté actif, délai écoulé, évaluation Radar `normal`, montant payé égal au montant attendu, aucun litige ni remboursement. Sinon elle attend, et l'opérateur tranche :

```sh
npm run payments:review -- list
npm run payments:review -- approve ID_PAIEMENT
```

Un restaurateur ne peut pas lever lui-même ce contrôle : la base le refuse.

## Le délai de 31 jours

C'est **un choix interne, pas une obligation légale**. Le chiffre vient du maximum d'un réglage Stripe, qui ne s'applique d'ailleurs pas à ce mode. Stripe [déconseille les retenues arbitraires](https://docs.stripe.com/connect/account-balances) et demande de verser dès que le bénéficiaire est identifié. Un restaurant attend ainsi jusqu'à environ 46 jours avec le seul versement automatique. Le paramètre permet de le réduire.

## Remboursements et litiges

- **Remboursement total :** vente contre-passée. Si le versement est parti, le net est repris au restaurant. La commission et les frais estimés lui sont rendus : Dattier supporte le coût réel de Stripe.
- **Remboursement partiel :** vente sortie des versements et signalée. Pas de traitement automatique.
- **Litige :** versement bloqué. Gagné, la vente redevient versable. Perdu, elle est traitée comme un remboursement total. Si le solde du restaurant ne suffit pas, la perte reste à la charge de Dattier.
- **Paiement arrivé après annulation pour non-paiement :** remboursé d'office.

## Écritures côté restaurant

| Moment | Débit | Crédit |
| --- | --- | --- |
| Vente | 4671 (TTC) | Ventes HT et TVA collectée |
| Versement | 580 (net) et 6222 (commission et frais) | 4671 (TTC) |
| Reprise | 4671 (TTC) | 580 (net) et 6222 |

Comptes modifiables. Le restaurateur choisit ses taux, par catégorie ou par produit, et déclare sa TVA. Dattier fournit un calcul d'aide, sans garantie de conformité.

## À trancher avant la production

**Avocat**
- Encaissement pour compte de tiers : ce montage et surtout cette retenue de plusieurs semaines sont-ils couverts par le recours à Stripe, sans agrément ni statut d'agent ?
- Base contractuelle de la retenue, de la commission et de la reprise sur versement, dans les conditions avec les restaurateurs et les CGV.

**Expert-comptable**
- Dattier étant le marchand officiel chez Stripe, le restaurateur peut-il rester seul redevable de la TVA de la vente ? C'est l'hypothèse actuelle, à confirmer.
- Commission : TVA à facturer par Dattier au restaurateur. **Aucune facture de commission n'est générée**, et les 6222 sont comptabilisés sans TVA déductible.
- Effet de ce circuit sur le statut de caisse encore ouvert.

**Décision prise**
- Retenue totale de 10 % par vente : 7 % de commission Dattier, plus 3 % pour les frais Stripe estimés.

**À surveiller**
- Tarif réel : 1,5 % + 0,25 € pour une carte européenne, 3,15 % + 0,25 € pour une carte internationale d'après [la grille Stripe](https://stripe.com/fr/pricing), plus des [frais Connect](https://stripe.com/fr/connect/pricing) non confirmés ici. Le rapport de marge Stripe dira le coût réel.

## Limites connues

- Activation du restaurateur par la page hébergée de Stripe, pas par les composants intégrés recommandés, pour éviter une dépendance de plus au départ.
- Client remboursé : le suivi de sa commande n'affiche pas encore « remboursé ».
- Code promo consommé non restitué si le paiement est abandonné.
- Pas d'e-mail : les restaurateurs reçoivent une notification dans le poste. Les e-mails passeront par Resend une fois la clé disponible.

## Essayer en test

Créer un sandbox Stripe, renseigner ses clés dans `.env.local`, démarrer le worker sur une base PostgreSQL, puis faire suivre les notifications :

```sh
stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe
```

Retour arrière de la migration (`down/037_online_payments.sql`) : réservé à la préproduction, et refusé dès qu'un paiement existe.
