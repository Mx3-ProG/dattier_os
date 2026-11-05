# Pilote hébergé atacuisine

La page d’accueil présente les forfaits à 39 €, 69 € et 99 € HT par mois. L’organisation demande un forfait à sa création. Son premier établissement est préparé et s’ouvre après activation. Un établissement supplémentaire coûte 39 € HT par mois et reçoit les droits du forfait de l’organisation.

La facturation du pilote est manuelle. Après confirmation du paiement, l’opérateur utilise la connexion de migration pour activer le forfait et les places. Les commandes ci-dessous illustrent une organisation à 69 € avec deux places, puis un retour à une place et au forfait de base.

```sh
npm run db:migrate
npm run billing:configure -- ID_ORGANISATION 69 2
npm run billing:configure -- ID_ORGANISATION 39 1 ID_ETABLISSEMENT_A_ARCHIVER
```

Pour trouver les identifiants et les demandes en attente, consulter `organizations` et `restaurants` avec la connexion de migration. Avant de retirer une place, faire confirmer par l’administrateur le nom de l’établissement à archiver et vérifier son identifiant. Terminer les commandes en cours sur cet établissement. L’archivage coupe l’accès et conserve les données. La commande valide la capacité et effectue l’archivage et le changement de forfait dans la même transaction. Un changement de forfait seul laisse à l’équipe l’accès aux commandes boutique déjà enregistrées.

Les organisations créées avant la migration conservent leurs modules au forfait technique à 99 € et leurs places existantes. Confirmer leur formule commerciale avant toute facturation. Les domaines existants nécessitent une preuve DNS, un routage vers l’hébergement et un certificat HTTPS. La boutique du pilote prend les commandes en ligne pour règlement au comptoir.

À la clôture mensuelle, relever par organisation le montant facturé, le nombre de places, les coûts d’hébergement, de stockage, de notification et le temps de support. Soustraire les coûts variables du montant facturé, puis comparer la somme aux 200 € de charges fixes. Avec une hypothèse de 8 € variables par établissement, sept établissements à 39 € contribuent 217 € avant charges fixes.
