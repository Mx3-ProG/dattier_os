# Banque et rapprochement

Import de relevés et rapprochement, sans contrat ni service tiers. **Aucune vente ni facture n'est jamais créée pour justifier un mouvement.**

## Import

Formats : CSV de banque française, OFX et CAMT.053, 10 Mo et 5 000 mouvements au maximum. Le fichier est archivé tel quel dans le stockage privé.

- **Ce qui est ambigu est refusé :** une date ou un montant illisible rejette le relevé entier. Le format de date américain n'est pas supposé. Seul l'euro est accepté.
- **Doublons :** un fichier rejoué est reconnu, et un relevé qui chevauche le précédent n'ajoute que les nouveaux mouvements. La clé vient de l'identifiant de la banque, sinon de la date, du montant, du libellé et du rang dans le fichier.
- **Limite des doublons :** sans identifiant de banque, un libellé modifié entre deux exports crée un nouveau mouvement. Deux mouvements très proches sont signalés comme doublons possibles.
- **Solde :** un écart entre le solde annoncé par le relevé et le solde calculé est signalé. L'IBAN complet n'est pas conservé, seulement ses quatre derniers caractères.

Un mouvement importé ne se modifie ni ne se supprime : seul son traitement évolue.

## Correspondances proposées

| Mouvement | Recherche | Écriture à la confirmation |
| --- | --- | --- |
| Débit | Facture validée de même montant, de 5 jours avant à 120 jours après sa date | Règlement de la facture : 401 / 512 |
| Débit | Facture déjà marquée réglée par virement ou carte | Aucune : le mouvement la confirme |
| Crédit | Versement des ventes en ligne de même montant, dans les 14 jours | 512 / 580 |
| Crédit | Ventes par carte d'un à trois jours consécutifs, de 1 à 7 jours avant le mouvement, commission de 6 % au plus | 512 et 627 / 5115 |
| Crédit | Libellé de dépôt d'espèces | 512 / 530 |
| Autre | Rien | Reste à vérifier, ou écarté avec un motif |

**Les trois notions restent distinctes :** un paiement par carte est une vente déclarée, une remise groupée est un mouvement bancaire, et la commission est isolée en 627. Une commission n'est admise que si le libellé évoque une remise de cartes.

Le serveur recalcule chaque correspondance avant de l'accepter : le navigateur ne peut pas désigner une opération arbitraire. Une facture, un versement ou une journée de cartes ne se rapproche qu'une fois, ce que la base garantit. Un rapprochement s'annule par contre-passation.

**Automatique :** désactivé par défaut. Une fois activé, il ne traite que le cas unique et sans ambiguïté : montant exact d'une facture, fournisseur nommé dans le libellé, ou versement nommé. Tout le reste attend une décision.

## Trésorerie

Dernier solde connu de chaque compte plus les mouvements suivants, hors espèces en caisse. Si un compte n'a ni solde de départ ni solde dans ses relevés, la trésorerie reste « non disponible » : elle n'est pas calculée à partir de zéro.

## Pas encore couvert

- **Connexion automatique à la banque :** Bridge et Powens sont sur devis. Il faudra un contrat et une validation de l'établissement agréé. L'import par fichier reste nécessaire en attendant.
- **Colonnes CSV non reconnues :** le fichier est refusé, il n'existe pas encore d'écran pour désigner les colonnes.
- **Dépenses :** un mouvement ne se relie pas encore à une dépense saisie. Il reste à vérifier ou est écarté avec un motif.
- **Paiement d'une facture en plusieurs fois, ou plusieurs factures en un virement :** non proposé.
- **Vente non comptabilisée :** une remise de cartes peut être rapprochée alors que ses ventes attendent encore leur TVA. Le compte 5115 reste alors temporairement déséquilibré.
- **Commission de carte :** enregistrée sans TVA déductible.
- **Plusieurs banques :** tous les comptes utilisent le 512. À ventiler avec l'expert-comptable si besoin.

Vérifié avec des relevés générés selon les formats, pas encore avec des exports réels de banques françaises, dont les colonnes varient. Retour arrière (`down/039_bank_reconciliation.sql`) : réservé à la préproduction, refusé dès qu'un relevé existe.
