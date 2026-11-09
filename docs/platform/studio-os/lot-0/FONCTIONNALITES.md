# Inventaire fonctionnel de référence

## Lecture

« Présent » signifie code et parcours identifiables, pas validation de production. « Partiel » signale un périmètre incomplet ou un raccordement manquant. Les tests réellement exécutés sont décrits dans VERIFICATIONS.md. Les produits futurs ci-dessous ne sont pas encore activables séparément.

## Fonctionnalités et candidats add-ons

| Fonctionnalité | Existant et maturité | Dépendances à préserver | Sources principales |
| --- | --- | --- | --- |
| Salle visuelle | Présent : tables, zones, formes, déplacement, rotation, états, archivage, quotas | Établissement, accès salle, commandes et réservations liées | `features/floor`, `components/floor-editor.tsx`, `components/floor-map.tsx` sous `src/` |
| Accueil et réservation | Présent ; horaires/services et durée encore spécifiques au restaurant | Disponibilités, tables, client, fuseau et états | `src/features/reservations/service.ts`, `tests/booking.test.ts` |
| Commandes | Présent : prise, acceptation, préparation, service, annulation, règlement déclaré | Catalogue, prix serveur, réservation de stock, droits et idempotence | `src/features/orders/service.ts`, `src/components/operations.tsx` |
| Cuisine et bar | Présent : files de préparation et transitions | Commandes, stations et permissions métier | `src/components/operations.tsx`, `src/lib/permissions.ts` |
| Carte et recettes | Présent, spécialisé : recette obligatoire et station cuisine/bar | Ingrédients, catégories, prix, historique des ventes | `src/features/catalog/service.ts`, `src/components/recipes.tsx` |
| Stocks et inventaires | Présent : lots, pertes, réservations, conversions, inventaires | Recettes, unités, achats, mouvements, contraintes SQL | `src/features/platform/inventory.ts`, `src/lib/actions.ts` |
| Achats et fournisseurs | Présent : catalogue fournisseur, achats multilignes et réception partielle ; pas d'envoi universel de bons | Stocks, unités, fournisseurs | `src/features/platform/inventory.ts`, migration 030 |
| Équipe et pointage | Présent : affectations, planning et événements de présence | Identité et permissions | `src/lib/actions.ts`, `src/features/platform/service.ts` |
| RH avancées | Présent localement : absences, corrections, contrats, préparation de variables ; paie complète absente | Pointages, règles confirmées et accès rémunérations | `src/features/hr`, `docs/platform/HR_PAYROLL.md` |
| Site et médiathèque | Présent : sections, thèmes, versions, publication et restauration | Médias privés/publics, domaines, identité et blocs métier | `src/features/cms`, `src/features/site` |
| Domaines et référencement | Présent : preuve DNS, domaine principal, sitemap, audit et visibilité IA ; provisionnement complet partiel | Site publié, résolution serveur, indexation | `src/proxy.ts`, `src/features/seo` |
| Boutique en ligne | Présent : panier, options, créneaux, compte, suivi et nouvelle commande | Catalogue, stock, commandes, réglages et prix serveur | `src/features/commerce` |
| Paiements marchands | Code local, Stripe simulé dans les tests ; validation réelle non acquise | Boutique, notifications signées, écritures, worker, versements | `src/features/payments`, `docs/platform/ONLINE_PAYMENTS.md` |
| Clients | Présent : fiches, comptes, consentements et historique ; CRM prospects absent | Organisation/établissement, identité et permissions | `src/features/commerce/account.ts`, `src/lib/snapshot.ts` |
| Fidélité et récompenses | Présent : points, portefeuille, codes, récompenses | Clients, consentement, ventes et mouvements de points | `src/features/loyalty`, `src/features/commerce/rewards.ts` |
| Engagement et parrainage client | Présent : badges, paliers, missions, séries et parrainage | Fidélité, compte, règles d'attribution | `src/features/commerce/engagement*.ts` |
| Promotions | Présent : codes et promotions flash | Prix, catalogue, fidélité et dates | `src/features/commerce/engagement.ts` |
| Ventes additionnelles | Partiel : suggestions par famille/catégorie ; pas de moteur personnalisé avec attribution | Catalogue public | `src/components/product-recommendations.tsx` |
| Avis | Présent : dépôt et modération ; campagnes automatiques absentes | Identité client, achat et site | `src/features/commerce/service.ts` |
| Communication | Présent : messages individuels et adaptateurs Resend/Twilio ; envoi réel dépend de la configuration | Consentements, coordonnées, fournisseurs | `src/features/messaging` |
| QR codes | Présent : génération, destinations métier et suivi de scans | Objet cible, permissions et disponibilité de la destination | `src/features/qr`, `src/components/qr` |
| Pilotage financier | Présent : périodes, indicateurs qualifiés, encaissements, trésorerie et créances | Ventes, dépenses, écritures, banque, RH et factures | `src/features/finance/dashboard.ts` |
| Pré-comptabilité | Présent : TVA configurée, écritures, contre-passation et revue ; conformité complète non démontrée | Règlements, événements financiers et paramètres | `src/features/finance` |
| Factures clients | Présent localement : brouillons, émission, avoirs, règlements, PDF/XML et export ; transmission agréée absente | Identité de facturation, écritures, numérotation | `src/features/billing`, `docs/platform/SALES_INVOICES.md` |
| Factures fournisseurs | Présent localement : documents, extraction structurée/IA, validation ; IA simulée en tests | Stockage, finance, crédits IA si extraction | `src/features/invoices` |
| Banque | Présent localement : import et rapprochement ; connexion directe absente | Factures, versements, écritures et relevés | `src/features/bank` |
| Assistant | Présent : voix/texte, aide, propositions, lecture financière et crédits | Modules autorisés, contexte, moteur métier et confirmation | `src/features/assistant` |
| Hors ligne | Présent : appareil, quotas, opérations et conflits ; pas de synchronisation navigateur fermé garantie | Stocks, réservations, idempotence et réconciliation | `src/features/offline` |
| Sécurité et audit | Présent : incidents, journal, corrections encadrées et archives | Identité, autorisation et worker | `src/features/ops-security` |
| Guides et apparence | Présent : tutoriel, aide et préférences utilisateur | Écrans accessibles, marqueurs et progression | `src/features/guide`, `src/components/tutorial`, `src/features/appearance` |
| Abonnements SaaS | Partiel : forfaits et activation manuelle ; boutique d'add-ons et Stripe Billing absents | Organisation, capacité, parrainage commercial | `src/features/platform/pricing.ts`, `entitlements.ts`, migration 020 |
| Connecteurs | Exports et outils de raccordement présents ; API métier tierces non toutes implémentées | Secrets chiffrés, permissions et contrats fournisseurs | `src/features/integrations`, `docs/platform/PROVIDERS.md` |

## Droits actuels à préserver

Les niveaux restent cumulatifs et sont portés par l'organisation, avec capacité d'établissements. Le contrôle est plus fin que l'affichage des trois offres ; ce tableau ne remplace pas les permissions et politiques SQL.

| Niveau | Comportement de référence |
| --- | --- |
| 0 / organisation inactive / établissement archivé | Pas d'accès opérationnel normal ; ne pas débloquer par une préférence d'interface |
| 39 | Exploitation : salle, commandes internes, catalogue, stocks, achats, équipe selon rôles ; pas de déblocage général finance/CRM/site |
| 69 | Site, domaines, fidélité/clients, promotions, finance, factures et capacités de préparation de paie selon permissions |
| 99 | Création de commandes boutique et configuration commerciale correspondante ; paiement en ligne soumis aussi à sa disponibilité technique |

Exceptions à conserver : la lecture/gestion d'anciennes commandes boutique n'est pas identique au droit d'en créer de nouvelles. Un downgrade ne doit pas empêcher de terminer les engagements existants. Les quotas de tables sont distincts de la capacité d'établissements. Le parrainage commercial peut affecter prix et droits : ne pas le confondre avec le parrainage des clients du restaurant.

Sources d'autorité : `src/features/platform/entitlements.ts`, `src/lib/actions.ts`, `src/lib/snapshot.ts`, `src/features/platform/admin.ts`, `src/lib/permissions.ts`, migrations 020 et suivantes. Les autorisations doivent rester cohérentes dans services, routes, projections, IA et SQL.

## Profils et partage

- Propriétaire : capacités métier larges dans son périmètre, sous réserve de la formule.
- Manager : exploitation/équipe/clients selon droits ; pas d'accès général aux rémunérations.
- Salle : commandes, règlements déclarés, réservations et salle.
- Cuisine/bar : préparation et droits spécifiques, pas d'accès financier général.
- Stocks/achats : ressources et approvisionnement selon affectations.
- Comptabilité : finance et préparation de paie, selon formule et périmètre.
- Support plateforme : accès encadré par une autorisation temporaire ; ne pas généraliser un droit inter-entreprises.

La source exacte des attributions est `src/lib/permissions.ts`, complétée par `scope`, les services et la base. Un salarié peut cumuler des rôles. Le futur abonnement d'équipe ne doit pas transformer tous les membres en administrateurs.

## Capacités futures non disponibles

Boutique d'add-ons et démos isolées ; activation/désactivation universelle ; socles métier personnalisables ; rendez-vous par prestation et collaborateur ; devis/chantiers/interventions ; profils PIN partagés ; scénarios automatiques génériques ; tests A/B ; échanges inter-entreprises ; quotas commerciaux génériques et déploiement progressif par registre. Aucun de ces éléments ne doit être présenté comme livré par le lot zéro.
