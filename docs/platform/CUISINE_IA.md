# Cuisine IA

Cuisine IA est l’assistant intégré au poste de travail (`/dashboard`), à l’administration (`/restaurant/…`) et au centre d’apprentissage. Le restaurateur lui parle à l’écrit ou à la voix. L’assistant répond à partir du service en cours et du guide. Il prépare les actions (commande, règlement, service, tables, réservations), et l’utilisateur les confirme d’un clic ou d’un « oui ».

## Architecture

| Couche | Fichier | Rôle |
| --- | --- | --- |
| Moteur réflexe | `src/features/assistant/reflex.ts` | Règles en français. Couvre les commandes dictées, les règlements, les stocks, les ventes, les réservations, la navigation et le mode d’emploi. Instantané, coût fournisseur nul. |
| IA générative | `src/features/assistant/llm.ts` | Claude via `@anthropic-ai/sdk`. Ses outils `propose_*` ne font que fabriquer des cartes d’action. Le prompt système et le guide sont mis en cache. |
| Gestion | `src/features/assistant/manage.ts`, `operations.ts`, `parse.ts` | Achats et fournisseurs, réassort, réceptions, pertes, carte et recettes, clients et fidélité, dépenses, planning, pointage, promos flash, messages clients. Lit les quantités, prix, dates et horaires dits à voix haute. |
| Actions | `src/features/assistant/proposals.ts` | Valident les actions contre la carte, les tables, les commandes et les droits. Elles produisent les corps exacts de `POST /api/v1/action`. |
| Crédits | `database/migrations/026_ai_credits.sql` | Portefeuille par organisation et journal. Le débit est atomique et chaque mouvement enregistre son coût fournisseur réel. |
| API | `src/app/api/restaurants/[restaurant]/assistant/route.ts` | `GET` renvoie le solde, les packs et l’historique. `POST {kind:"ask"}` envoie une question, `POST {kind:"pack"}` une demande de recharge. |
| Interface | `src/components/assistant/cuisine-ia.tsx` | Panneau de conversation, cartes d’action, suggestions, mode vocal (Web Speech) et recharge. |

Pour la sécurité, l’assistant ne voit que le snapshot de l’utilisateur, donc uniquement ses droits. Il n’exécute rien seul. Chaque action confirmée repasse par `perform`, qui revérifie les permissions, les stocks et les transitions.

## Gestion de bout en bout

Exemple : « Aide-moi à gérer les stocks et à acheter des fraises ».

1. **Plusieurs demandes dans une phrase.** Cuisine IA propose le réassort de tout ce qui est sous le seuil, chacun chez son fournisseur habituel. Pour les fraises, elle demande la quantité.
2. **Recherche du fournisseur**, dans cet ordre :
   - le catalogue fournisseur (table `supplier_ingredients`, migration 030) ;
   - à défaut, l’historique des commandes ;
   - à défaut, la spécialité du fournisseur (« primeur », « maraîcher »…) ;
   - s’il en reste plusieurs ou aucun, elle demande lequel choisir.
3. **Ce qui manque est créé dans la même carte**, et chaque étape s’appuie sur la précédente :
   - l’ingrédient d’abord, puis le fournisseur, puis la commande ;
   - une valeur `"$N"` dans une action désigne l’identifiant créé par l’étape N ;
   - après une erreur, seules les étapes non faites sont rejouées.
4. **Ce que seul l’utilisateur sait est demandé** : quantité, prix, recette, contact, horaires.
   - La phrase en attente (`followUp`) est complétée par la réponse suivante : « Commande 5 kg de farine chez » + « Minoterie Dupuis ».
   - Une nouvelle demande complète reste prioritaire sur la question en attente.
5. **Chaque commande fournisseur enrichit le catalogue** : la prochaine fois, Cuisine IA sait qui vend quoi.

En mode vocal :
- l’écoute est continue et attend un vrai silence avant d’envoyer, avec un délai plus long après « et », « de » ou « chez » ;
- « oui » confirme toutes les cartes de la dernière réponse, « la première » une seule, « non » les annule.

## Configuration

```sh
ANTHROPIC_API_KEY=sk-ant-...        # sans clé : moteur réflexe seul
ATACUISINE_AI_MODEL=claude-opus-5-5 # ou claude-sonnet-5-5 / claude-haiku-5-5
ATACUISINE_AI_MARKUP=8              # marge appliquée au coût réel (3 à 30)
```

## Modèle économique : 1 € de coût, 5 à 10 € de revenu

1. **Le crédit vaut 2 c€ au catalogue.** Le prix de chaque réponse dépend de son coût réel, jamais d’un forfait :
   - une réponse du moteur réflexe coûte **1 crédit**, pour un coût fournisseur de 0 € ;
   - une réponse de l’IA générative coûte `ceil(coût réel × 8 / 0,02 €)` crédits, avec un minimum de 2 et un maximum de 60 ;
   - le solde, l’aide et la navigation sont gratuits, pour que le compteur ne freine pas l’usage.
2. **Packs prépayés**, facturés manuellement comme les forfaits :

   | Pack | Crédits | Prix HT | Prix du crédit | Revenu par euro de coût IA |
   | --- | --- | --- | --- | --- |
   | Service | 1 000 | 19 € | 1,90 c€ | 7,6 € |
   | Brigade | 3 000 | 49 € | 1,63 c€ | 6,5 € |
   | Chef | 10 000 | 129 € | 1,29 c€ | 5,2 € |

   Par construction, chaque euro dépensé chez Anthropic rapporte de 5,2 € à 8 € HT. Les réponses réflexes n’ont pas de coût, donc la marge moyenne réelle est plus haute. Avec 60 % de réflexes et environ 10 crédits par analyse avancée, les réflexes ajoutent environ 15 % de revenu sans coût : 1 € de coût rapporte alors environ 6 à 9 €.
3. **Ordres de grandeur.** Une question à Claude Opus 5.5 revient à environ 2 à 4 c€. Le guide (environ 7 000 tokens) est mis en cache, et l’effort de raisonnement est réglé sur « low ». Cela fait 8 à 16 crédits facturés. Avec `claude-haiku-5-5`, le coût est environ 40 fois plus bas : chaque question atteint le minimum de 2 crédits, avec une marge de plus de 40×. Le choix du modèle est un arbitrage entre qualité et marge. L’opérateur le règle avec `ATACUISINE_AI_MODEL`.
4. **Les 300 crédits de bienvenue** coûtent au pire 0,75 € par organisation (300 × 2 c€ / 8). Ils couvrent environ 300 réflexes ou 25 analyses avancées, de quoi créer l’habitude dès le premier service.
5. **Leviers de conversion déjà en place :**
   - le solde est affiché en permanence, et une alerte de recharge apparaît sous 50 crédits ;
   - un message « insuffisant » propose directement la recharge ;
   - le pack Brigade est mis en avant ;
   - seuls les administrateurs rechargent, ce qui donne une décision d’achat claire.
6. **Prochaines étapes conseillées :**
   - inclure 100 à 300 crédits par mois dans les forfaits à 69 € et 99 € pour pousser vers le forfait supérieur ;
   - proposer une recharge automatique par Stripe à 20 % de solde ;
   - offrir des crédits bonus au parrainage ;
   - faire payer les fonctions premium (analyse de marge, fiche technique, post pour les réseaux) à prix fixe en crédits.

## Opérations

```sh
npm run ai:credits -- list                       # demandes en attente + coût et consommation du mois
npm run ai:credits -- pay ID_DEMANDE             # après paiement : crédite le pack
npm run ai:credits -- bonus ID_ORGANISATION 500  # geste commercial
```

`list` affiche le coût fournisseur du mois (`cost_micro_eur`) et les crédits consommés. La marge se contrôle donc chaque mois, comme le reste de la facturation (voir `BILLING.md`).
