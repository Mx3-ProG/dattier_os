# Audit préalable : Financial Automation Engine

Audit du 8 novembre 2026, branche `codex/atacuisine-consolidation`, commit `847f4c2` et modifications locales en cours (réservation, boutique, CMS). Aucun code ni schéma n'a été modifié.

Ce document n'est pas un avis juridique, fiscal ou comptable. Les points réglementaires viennent surtout de sources secondaires et doivent être confirmés sur Légifrance et le BOFiP, puis par un expert-comptable ou un avocat fiscaliste.

## État d'avancement

| Lot | État | Livré |
| --- | --- | --- |
| 0 | Fait | Anomalies A1 à A6 corrigées, données passées reprises par la migration 036 (remises, statut des commandes réglées) |
| 1 | Fait | Migration 036 et retour arrière, `src/features/finance`, route `/api/restaurants/:id/finance`, écran « Opérations à vérifier », `tests/finance.test.ts`, contrôles ajoutés à `verify-postgres.ts` |
| 2 à 7 | À faire | Le lot 3 reste suspendu à la décision caisse (section 9) |

Écarts avec la conception initiale :

- Pas de table `fin_cash_counts` ni `fin_refunds` à ce stade : elles relèvent du lot 3.
- Seuls les règlements créent des événements. Dépenses, factures et mouvements bancaires arriveront avec leurs lots.
- Déclarer le régime « franchise » ne comptabilise pas les ventes passées : le régime a pu changer. Il faut le demander explicitement dans l'écran.
- La comptabilisation étant dans la transaction du règlement, une panne imprévue de cette étape annule aussi le règlement. Un taux manquant ne bloque jamais : il ouvre une opération à vérifier.

**Ces protections ne valent pas conformité.** Le journal chaîné et l'ajout seul vont dans le sens de l'inaltérabilité, mais ne remplacent ni une attestation, ni une certification, ni l'avis d'un expert.

## 1. Conclusions

1. **Le projet n'utilise pas Supabase.** La seule trace est un document de migration « non exécutée » ([SUPABASE_DEPLOYMENT.md](../SUPABASE_DEPLOYMENT.md)). La pile réelle est PostgreSQL 16 (PGlite en démo), Keycloak/OIDC, stockage S3 Garage et un worker dédié. Le RLS repose sur `set_config('app.*')`, pas sur `auth.uid()`. Je recommande de construire sur PostgreSQL : le moteur restera portable.
2. **Il n'existe ni comptabilité, ni TVA, ni facture.** Le « module comptable » se limite à `payment_declarations` et à `expenses`, plus un écran de synthèse. Une recherche sur TVA et facture ne renvoie que le champ de TVA intracommunautaire des mentions légales.
3. **Le socle technique est réutilisable** : boîte d'envoi transactionnelle, worker avec reprises, RLS, chiffrement des connecteurs, journaux en ajout seul, assistant à propositions confirmées.
4. **Le principal risque est réglementaire, pas technique.** L'encaissement universel de la phase 2 fait très probablement de Dattier un système de caisse au sens de l'article 286 du CGI. Le `pay()` actuel soulève déjà la question (voir section 5.1). **Cette décision doit être prise avant de construire la phase 2.**
5. **La facturation électronique change la phase 4.** La réception est annoncée comme obligatoire depuis le 1er septembre 2026. À terme, les factures fournisseurs françaises arriveront structurées : l'OCR devient une solution de repli, pas le cœur du système.
6. **Le périmètre complet représente plusieurs mois de travail** et dépend de contrats tiers. Il doit être livré par lots validés (voir section 8).

## 2. Architecture réelle

| Élément | État constaté | Référence |
| --- | --- | --- |
| Application | Next.js 16, React 19, TypeScript, routes `/api/v1`, `/api/restaurants/:id/:module`, `/api/store` | `src/app/api` |
| Base | PostgreSQL 16 en production, PGlite en démo, 34 migrations (la 025 n'existe pas) | `src/lib/database/migrate.ts` |
| Migrations | Transactionnelles et sans retour arrière. Aucune migration réversible n'existe | `database/migrations` |
| Authentification | OIDC/Keycloak (PKCE, nonce), session démo séparée | `src/lib/auth` |
| Rôles | 9 rôles et 16 permissions, cumulables par établissement | `src/lib/permissions.ts` |
| Forfaits | `finance`, `customers`, `website` exigent le forfait 69 € ; la boutique le 99 € | `src/features/platform/pricing.ts` |
| Isolation | 139 politiques RLS, liens contrôlés par `app.guard_links` | `006_isolation.sql` |
| Tâches | `outbox_jobs`, `enqueue()`, `claim_jobs` avec `SKIP LOCKED`, 5 tentatives avec attente croissante | `scripts/worker.ts` |
| Événements | `restaurant_events` : signal sans contenu pour le rafraîchissement, pas des événements métier | `006_isolation.sql:284` |
| Déploiement | Compose sur un hôte. Un projet Vercel « atacuisine » est lié, la documentation le dit non déployé | `compose.yaml`, `VERCEL_DEPLOYMENT.md` |

Point de départ : `npm run typecheck` passe et `npm test` donne 121 réussites sur 121. Ces résultats portent sur l'arbre de travail actuel. Je n'ai pas lancé `test:postgres` ni les tests e2e.

## 3. Modules existants

| Module | Existant | Ce qui manque pour la finance |
| --- | --- | --- |
| Commandes | Transactions, idempotence, réservation de stock FEFO | TVA par ligne, source |
| Paiements | Déclaration unique par commande ou table, `card`, `cash`, `other` | Paiements partiels, remboursements, pourboires : les index uniques de `001_core.sql:18-19` les interdisent |
| Paiement en ligne | Stripe désactivé : la route refuse tout sauf le comptoir | Tout (webhook, frais, versements) |
| Dépenses | Libellé et montant uniquement, date imposée à `now()` | Date, fournisseur, TVA, catégorie, justificatif, correction |
| Achats | Commandes et réceptions avec quantités | **Aucun prix** sur `purchase_orders` ni `purchase_document_lines` |
| Stocks | Lots, mouvements, inventaires | Valorisation : seul `ingredients.cost` existe, sans coût par lot |
| Équipe | `shifts`, `time_entries`, pointage par QR, export CSV | Contrats, taux horaire, absences, congés, corrections, consolidation |
| Assistant | Moteur réflexe et Claude, `propose_*` confirmés par l'utilisateur, crédits | Outils de lecture financière |
| Connecteurs | Secrets chiffrés AES-GCM liés au restaurant et au prestataire, vérification de signature | Types `bank` et `e_invoicing` absents du `CHECK` de `integration_connections` |
| Exports | `/api/restaurants/:id/exports` (ventes, pointages) | **Aucun écran n'appelle cette route** |

Permissions à noter : `MANAGER` a `team` mais pas `finance`, et `WAITER` a `payments`. Le coût de personnel exige donc une permission à part, `payroll`, pour ne pas exposer les salaires aux managers par défaut.

## 4. Anomalies dans le code actuel

Ces défauts faussent déjà les chiffres et seraient hérités par le moteur.

| # | Constat | Effet | Référence |
| --- | --- | --- | --- |
| A1 | Une commande boutique réglée garde `orders.status='active'` | Exclue du coût matière et des meilleures ventes, qui filtrent sur `paid` | `commerce/service.ts:503`, `overview.tsx:40,308` |
| A2 | La remise boutique n'est pas reportée sur la déclaration | L'export affiche `remise_centimes = 0` à tort | `commerce/service.ts:499` |
| A3 | Le CA couvre toutes les dates, le coût matière les 150 dernières commandes | Les deux chiffres affichés côte à côte ne sont pas comparables | `snapshot.ts:52`, `overview.tsx:305` |
| A4 | « CA déclaré » additionne en réalité des encaissements TTC | C'est la confusion que la phase 8 veut éviter | `overview.tsx` |
| A5 | L'écran affiche « données fictives » et nomme son CSV `...-demo.csv`, y compris en production | Message faux avec de vraies données | `overview.tsx:309-330` |
| A6 | Le coût matière ignore le coût des options choisies | Coût sous-estimé | `orders/service.ts:224` |

**Attention sur A1 :** passer simplement la commande à `paid` serait une régression. `changeItem` exige `status='active'`, donc une commande réglée avant préparation ne pourrait plus avancer en cuisine. La correction doit lire l'état de paiement à part.

Autre point : `app.organization_sales` n'a aucun appelant et renvoie deux lignes par établissement. Il ne faut pas la réutiliser pour le consolidé.

## 5. Risques

### 5.1 Conformité fiscale de la caisse (critique)

L'article 286, I-3° bis du CGI vise les assujettis à la TVA qui enregistrent les règlements de leurs clients dans un système de caisse, avec quatre exigences : inaltérabilité, sécurisation, conservation et archivage. Le défaut de justificatif est sanctionné d'une amende de 7 500 € par logiciel (art. 1770 duodecies).

Selon plusieurs sources, la loi de finances 2026 a rétabli en février 2026 l'attestation individuelle de l'éditeur, à côté de la certification NF525 ou LNE. Une source isolée soutient que NF525 aurait disparu : elle contredit les autres et je l'écarte.

Mon analyse, à faire valider :

- **L'étiquette « déclaration » ne protège probablement pas.** Le guide indique que le produit n'est pas une caisse certifiée. Mais mémoriser un règlement en espèces reçu pour une vente ressemble à la fonction visée. L'existant est donc peut-être déjà concerné, indépendamment de ce projet.
- **Aujourd'hui, le critère d'inaltérabilité n'est pas rempli.** `payment_declarations` n'a aucune protection en écriture, et le rôle applicatif y dispose de `UPDATE` et `DELETE` (`012_website_studio.sql:17`).
- **La licence AGPL complique l'attestation.** Une installation auto-hébergée dont le code ou la base sont modifiables ne peut pas être couverte comme la version hébergée. Une attestation éventuelle devrait se limiter à une version et à un mode d'hébergement précis.
- **L'attestation engage l'éditeur.** C'est une décision de gérant, que je ne peux pas prendre à ta place.

### 5.2 Sécurité et données

| Risque | Détail | Réponse prévue |
| --- | --- | --- |
| RLS limité au locataire | `tenant_access` autorise tout membre, et le contexte `app.public=true` passe aussi (`006_isolation.sql:6`) | Politiques financières dédiées, excluant le public et vérifiant le rôle |
| Journaux modifiables | `audit_logs` n'a pas de trigger d'ajout seul, contrairement à `ops_security_events` | Tables financières en ajout seul, chaîne d'empreintes |
| Démo sans vrai RLS | Le rôle par défaut de PGlite contourne le RLS | Tests sous `SET LOCAL ROLE atacuisine_app` et extension de `verify-postgres.ts` |
| Pas de worker en démo | `scripts/worker.ts` exige `WORKER_DATABASE_URL` | Écritures comptables synchrones, worker réservé aux services externes |
| Injection par document | Le texte d'une facture importée pourrait viser l'IA | Extraction sans aucun outil, sortie validée, contrôle humain |
| Envoi à Anthropic | Le contexte contient déjà des noms de clients (`llm.ts:352`) ; factures et paie aggraveraient l'exposition | Minimiser, documenter dans le registre RGPD, exclure les données de paie nominatives |
| Taille des imports | `readBody` limite à 50 Ko | Route de téléversement dédiée vers le stockage privé |

### 5.3 Autres risques

- **Dépendances commerciales** : Bridge, Powens et les plateformes agréées sont sur devis. Rien ne peut être finalisé sans contrat.
- **Faux sentiment de conformité** : un export au format FEC n'est pas une comptabilité. Tout l'affichage doit parler de **pré-comptabilité à valider**.
- **Données historiques sans TVA** : aucune écriture ne peut en être déduite. Elles iront dans « Opérations à vérifier », sans taux supposé.

## 6. Réutilisable ou à créer

**À réutiliser sans reconstruire** : `enqueue()` et le worker, `encryptSecret`/`decryptSecret`, `verifyEnvelope`, `log()`/`mirrorAudit`, le stockage S3 privé (`cms/media.ts`), la chaîne `sha256`/`previous_sha256` des archives de sécurité, le pointage QR, `exportCsv`, Recharts déjà chargé à la demande, `perform()` et les cartes de confirmation de l'assistant.

**À créer** : le grand livre, la configuration de TVA, les événements financiers, les encaissements manuels, les factures fournisseurs, le rapprochement bancaire, la facturation, la couche paie et le centre « Opérations à vérifier ».

## 7. Architecture cible

### Principe central

La phase 1 du cahier des charges demande des traitements asynchrones. Je recommande **de les séparer en deux** :

- **Écritures internes : synchrones.** L'événement et l'écriture comptable sont créés dans la même transaction que le paiement. Il n'y a ainsi jamais de paiement sans trace, et la démo fonctionne sans worker.
- **Effets externes : asynchrones.** La synchronisation bancaire, l'extraction de documents, l'envoi aux plateformes et les exports passent par `outbox_jobs`, qui offre déjà reprises et déduplication.

```
pay() · settle() · encaissement · dépense · facture · import bancaire
                     │  même transaction
                     ▼
        fin_events  (ajout seul, UNIQUE restaurant/type/clé)
                     │
          TVA connue ?──non──► fin_review_items (« Opérations à vérifier »)
                     │ oui
                     ▼
        fin_entries + fin_entry_lines (équilibrées, UNIQUE par événement)
                     │
                     ▼
        Tableau de bord · Assistant · Exports      outbox_jobs ──► services externes
```

### Règles de données

- **Doublons impossibles par construction.** `UNIQUE(restaurant_id, source_event_id, kind)` garantit qu'un paiement ne produit jamais deux écritures, même rejoué.
- **Équilibre garanti en base.** Un trigger différé refuse toute écriture dont le débit diffère du crédit.
- **Aucune modification.** On corrige par contre-passation. Les tables sont en ajout seul, avec chaîne d'empreintes.
- **Montants en centimes, taux en points de base**, comme le reste du schéma.
- **TVA figée sur la ligne vendue.** Elle est configurée par l'établissement, par produit et par mode de consommation. Sans donnée : `NULL`, puis une demande de vérification.
- **Plan comptable modifiable.** Les valeurs PCG par défaut sont proposées, l'expert-comptable les ajuste.

### Tables prévues (à partir de la migration 036)

| Domaine | Tables |
| --- | --- |
| Socle | `fin_settings`, `fin_tax_rates`, `fin_accounts`, `fin_events`, `fin_entries`, `fin_entry_lines`, `fin_review_items` |
| Ventes | Colonnes de TVA sur `menu_items` et `order_items`, `fin_cash_receipts`, `fin_refunds`, `fin_cash_counts` |
| Fournisseurs | `fin_documents`, `fin_supplier_invoices` ; prix ajoutés aux lignes d'achat |
| Banque | `fin_bank_accounts`, `fin_bank_transactions`, `fin_matches`, `fin_payouts` |
| Facturation | `fin_invoices`, `fin_invoice_lines`, `fin_invoice_sequences` |
| RH | `hr_contracts`, `hr_absences`, `hr_time_corrections`, `hr_payroll_periods`, `hr_payroll_variables` |

Le cahier des charges demande des migrations réversibles. Le dépôt n'en a pas : j'ajouterais `database/migrations/down/`, avec un test montée-descente-montée. Une fois de vraies écritures en base, une descente détruirait des données comptables : elle doit donc rester un outil de préproduction.

### Décisions par phase

| Phase | Recommandation | Validation requise |
| --- | --- | --- |
| 2. Encaissement | Écran tactile, trois champs, TVA reprise de la catégorie | Décision caisse (5.1) |
| 3. Banque | **Import CSV, OFX et CAMT.053 d'abord**, gratuit et sans contrat. Bridge ou Powens ensuite, derrière une interface commune. Rapprochement proposé par défaut, jamais de vente créée pour justifier un mouvement. Versements du prestataire séparés des paiements | Devis, statut réglementaire de l'établissement agréé |
| 4. Factures | Ordre : **1) XML Factur-X intégré au PDF, données certaines ; 2) extraction par Claude**, via le SDK déjà présent et les crédits IA ; 3) contrôles déterministes HT + TVA = TTC, doublons par numéro et par empreinte. Rien n'est comptabilisé sans validation au début | Coût IA, licence d'une bibliothèque PDF |
| 5. Facturation | Numérotation sans trou verrouillée par ligne, avoirs, PDF, puis Factur-X. La transmission officielle passe par une plateforme agréée | Choix de la plateforme |
| 6. RH | Consolidation à partir du pointage, règles HCR **paramétrables**, export CSV vers le gestionnaire de paie. Pas de bulletin ni de DSN. Le connecteur PayFit attend la confirmation qu'une écriture de variables est possible | Gestionnaire de paie réel des clients |
| 7. Assistant | Outils `read_*` en lecture seule, chacun vérifiant la permission et l'établissement, chaque réponse marquée confirmé, estimé, prévu ou manquant. Pas de SQL libre | Aucune |
| 8. Tableau de bord | Route dédiée avec période, hors du `snapshot` interrogé toutes les 3 à 5 s, quatre notions séparées : CA, encaissements, trésorerie, résultat | Aucune |

**Questions de l'assistant :** plusieurs sont impossibles tant que les données n'existent pas. « Quels fournisseurs coûtent le plus cher ? » exige des prix d'achat, le coût de personnel exige des taux horaires, le bénéfice exige la TVA. L'assistant doit alors dire ce qui manque au lieu d'estimer en silence.

**Moteurs de paie :** je ne recommande pas d'intégrer ERPNext, Odoo ou Dolibarr pour la paie. Ce serait un second système lourd à exploiter, dont je n'ai pas vérifié la conformité paie française. Un export vers le gestionnaire déjà utilisé par le restaurant couvre le besoin réel.

## 8. Plan par lots

Chaque lot est livrable seul, testé et soumis à validation.

| Lot | Contenu | Dépend de | Ordre de grandeur |
| --- | --- | --- | --- |
| **0** | Correction des anomalies A1 à A6, tests de non-régression | Rien | Quelques jours |
| **1** | Socle : TVA, plan comptable, événements, écritures, permissions, RLS, « Opérations à vérifier », branchement sur `pay()` et `settle()` | Lot 0 | 2 à 3 semaines |
| **2** | Tableau de bord par période et outils de lecture de l'assistant | Lot 1 | 1 à 2 semaines |
| **3** | Encaissement universel, comptage de caisse, remboursements | Lot 1, décision caisse | 2 semaines, plus la conformité |
| **4** | Factures fournisseurs, justificatifs, prix d'achat | Lot 1 | 3 à 4 semaines |
| **5** | Import bancaire et rapprochement, puis connecteur | Lots 1 et 4 ; contrat pour le connecteur | 3 semaines, plus le connecteur |
| **6** | Facturation, avoirs, Factur-X, export pour l'expert-comptable | Lot 1, plateforme agréée | 3 à 4 semaines |
| **7** | Couche RH et variables de paie | Rien de bloquant | 2 à 3 semaines |

Ces durées sont des estimations approximatives, pas des engagements.

## 9. Décisions attendues

1. **Statut caisse.** Options : a) Dattier devient une caisse avec attestation ou certification ; b) Dattier reste un outil de gestion et importe les totaux d'une caisse certifiée partenaire ; c) on suspend la saisie d'encaissements. **Ma recommandation : consulter d'abord un expert sur la position actuelle, et viser (b) à court terme**, car c'est le moins exposé et le plus rapide. L'option (a) reste possible ensuite pour la seule version hébergée.
2. **Hébergement cible.** Je recommande de rester sur PostgreSQL. Un déploiement Vercel n'a pas de processus worker permanent et devrait être adapté.
3. **Niveau comptable.** Je recommande la pré-comptabilité avec export vers l'expert-comptable, pas un logiciel comptable complet.
4. **Dépenses payantes.** Pas de contrat Bridge, Powens ou plateforme agréée sans ton accord. Les lots 0 à 2 n'en exigent aucun.

## 10. Limites de cet audit

- Lu en détail : schéma, services financiers, commandes, assistant, authentification, worker. Inspecté par recherche ciblée seulement : composants d'interface, CMS, SEO et `offline`.
- Je n'ai pas consulté de base de production, ni exécuté `test:postgres`, ni les tests e2e.
- Je n'ai pas pu confirmer l'écriture de variables de paie par l'API PayFit, ni l'API de Silae, ni les tarifs des agrégateurs.
- Les sources sur l'obligation de réception divergent sur le périmètre exact et les seuils. Les sources sur le contingent HCR divergent aussi : il ne sera pas codé en dur. Les durées de conservation (10 ans) n'ont pas été confirmées par mes recherches.

## Sources

- Caisse : [UMIH Formation](https://www.umihformation.fr/blog/article/52-Logiciel-de-caisse-en-CHR-NF525-ou-LNE-fin-de-l-auto-attestation-et-obligations-2026-France), [Kohen Avocats](https://kohenavocats.fr/2026/05/05/logiciel-caisse-certifie-2026-autocertification-amende-controle-fiscal/), [Comptanoo](https://www.comptanoo.com/logiciel-de-caisse-certifie-nf525-ce-que-dit-la-loi-en-2026/), [Crisalid](https://www.crisalid.com/blog/articles-16/logiciel-de-caisse-certifie-ce-que-la-loi-impose-vraiment-en-2026-351)
- Facturation électronique : [Compta-Online](https://www.compta-online.com/facturation-electronique-ao5562), [Ma facture électronique](https://ma-facture-electronique.org/reforme-2026/echeance-septembre-2027/), [Socic](https://www.socic.fr/ressources-comptabilite/articles/facturation-electronique-obligatoire-2026-2027-calendrier-plateformes-agreees-e-reporting-et-checklist-tpe-pme)
- Banque : [documentation Bridge](https://docs.bridgeapi.io/docs), [conditions Bridge](https://connect.bridgeapi.io/pdf/cgs_FR.pdf), [Powens](https://www.powens.com/products/financial-data-aggregation)
- Paie : [PayFit, clé d'API](https://support.payfit.com/en/articles/158409-setting-up-a-payfit-api), [PayFit, intégrations](https://payfit.com/fr/partenaires-et-integrations), [Code du travail numérique, HCR](https://code.travail.gouv.fr/contribution/1979-heures-supplementaires)
- TVA : [Dougs](https://www.dougs.fr/blog/tva-restauration/), [Legalstart](https://www.legalstart.fr/fiches-pratiques/fiscalite-des-entreprises/tva-restauration/)
- FEC : [L-Expert-Comptable](https://www.l-expert-comptable.com/a/6359-fichier-des-ecritures-comptables-fec-notre-guide.html), [BOFiP](https://bofip.impots.gouv.fr/export/pdf/17097)
