# Pilote hébergé atacuisine

La page d’accueil présente un abonnement unique, Studio, à 39 € HT par mois : exploitation, site personnalisable, référencement, finances et rapports, boutique en ligne avec panier, créneaux et règlement au comptoir. Le reste (fidélité, domaine personnalisé, factures, présences, paie, QR codes, connexions, conflits hors ligne) est vendu en add-ons mensuels. L’organisation demande l’abonnement à sa création. Son premier établissement est préparé et s’ouvre après activation. Un établissement supplémentaire coûte 39 € HT par mois et reçoit les droits de l’abonnement de l’organisation.

À la création de l’organisation, un seul essai gratuit de trois jours est accordé par propriétaire. L’accès fonctionne immédiatement et expire selon l’heure enregistrée en base, sans tâche planifiée. Aucun paiement ni prélèvement automatique n’est déclenché à l’expiration. L’essai ne peut pas être recommencé avec une deuxième organisation du même propriétaire. Le propriétaire peut arrêter l’essai depuis son espace ; l’accès ferme immédiatement.

La facturation du pilote reste manuelle. Après confirmation du premier paiement, l’opérateur utilise la connexion de migration pour activer l’abonnement et les places. Le propriétaire peut résilier depuis son espace ; l’accès est alors fermé et `cancelled_at` est enregistré. L’opérateur doit consulter les résiliations et cesser toute facturation manuelle correspondante. Les commandes ci-dessous illustrent une organisation avec deux places, puis un retour à une place.

```sh
npm run db:migrate
npm run billing:configure -- ID_ORGANISATION 39 2
npm run billing:configure -- ID_ORGANISATION 39 1 ID_ETABLISSEMENT_A_ARCHIVER
```

Pour trouver les identifiants et les demandes en attente, consulter `organizations` et `restaurants` avec la connexion de migration. Avant de retirer une place, faire confirmer par l’administrateur le nom de l’établissement à archiver et vérifier son identifiant. Terminer les commandes en cours sur cet établissement. L’archivage coupe l’accès et conserve les données. La commande valide la capacité et effectue l’archivage et le changement de forfait dans la même transaction. Un changement de forfait seul laisse à l’équipe l’accès aux commandes boutique déjà enregistrées.

Depuis la migration 075, les anciens forfaits à 69 € et 99 € sont ramenés à l’abonnement à 39 € et les places existantes sont conservées. Les établissements qui avaient déjà un domaine vérifié le gardent sans add-on (`addon_legacy_grants`). Les domaines existants nécessitent une preuve DNS, un routage vers l’hébergement et un certificat HTTPS. La boutique du pilote prend les commandes en ligne pour règlement au comptoir.

À la clôture mensuelle, relever par organisation le montant facturé, le nombre de places, les coûts d’hébergement, de stockage, de notification et le temps de support. Soustraire les coûts variables du montant facturé, puis comparer la somme aux 200 € de charges fixes. Avec une hypothèse de 8 € variables par établissement, sept établissements à 39 € contribuent 217 € avant charges fixes.
