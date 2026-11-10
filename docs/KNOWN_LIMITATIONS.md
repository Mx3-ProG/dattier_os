# État exact de la V0

Le parcours de service central est implémenté. Les fonctions ci-dessous restent partielles ou absentes ; cette liste prévaut sur toute interprétation du mot « complet ».

## Compléments partiels

- Multi-établissements : sélection et isolation ; pas de vue financière consolidée/comparative. L’ajout crée un établissement vide, dont l’équipement initial nécessite encore une intervention technique.
- Utilisateurs : profils fictifs et affectations ; pas d’interface complète de création, invitation, suspension ou gestion multi-rôle. Le schéma autorise plusieurs rôles d’affectation mais la V0 exploite un rôle effectif par profil/établissement.
- Salle : éditeur de plan (ajout, modification, glisser-déposer, zones, formes, archivage, suppression sans historique) partagé avec la réservation publique. Pas de transfert/fusion de tables ni d’assemblage automatique pour les grands groupes (demande sans table, organisée par l’équipe). Pas de timeline spatiale des réservations.
- Réservation en ligne : horaires de service, durée (2 h), jour de fermeture et délai minimal sont des valeurs de démonstration regroupées dans `booking` (`src/features/reservations/service.ts`), pas encore éditables depuis l’interface. Les demandes sans table ne réduisent pas la disponibilité affichée tant que l’équipe ne les a pas affectées.
- Commandes : ajouts successifs et annulation de lignes ; pas de variantes, suppléments, modification de quantité en place, division de ligne ni règlement partiel. Remplacer une ligne en l’annulant puis en ajoutant une nouvelle commande dans la session.
- QR : interface `/qr?table=bernay-t8` pour une session ouverte et acceptation obligatoire par le personnel ; génération/impression des images QR non implémentée. Ne pas exposer ce canal sans anti-abus de production.
- Stocks : lots, pertes, corrections par lot ; pas de campagne d’inventaire avec brouillon multi-lignes, transferts d’emplacement, retours ou gestion des conversions depuis tous les formulaires.
- Approvisionnements : commandes mono-ingrédient et réceptions partielles ; pas de cycle brouillon/envoyé/confirmé complet, envoi de bons, facture ou pièce jointe.
- Équipe : liste fictive, créneaux, pointages, corrections tracées, absences et variables de paie (`docs/platform/HR_PAYROLL.md`) ; pas d’édition de profil, de solde de congés, de bulletin ni de déclaration sociale.
- Carte : création de produits avec recette, modification, archivage/restauration et suppression sans historique disponibles. Restent à développer : création d’ingrédients et de catégories, photos, allergènes validés, variantes, suppléments, menus composés et plages de vente.
- Finance : déclarations, dépenses, tableau de bord par période, export CSV, pré-comptabilité des règlements (TVA configurée par l’établissement, écritures, opérations à vérifier). Pas de fiscalité validée, marges HT, filtres avancés, écriture des dépenses, remboursements au comptoir ni export comptable. Paiements en ligne : voir `docs/platform/ONLINE_PAYMENTS.md`. Factures fournisseurs : voir `docs/platform/SUPPLIER_INVOICES.md`. Banque : voir `docs/platform/BANK_RECONCILIATION.md`. RH et paie : voir `docs/platform/HR_PAYROLL.md`. Ni comptabilité officielle, ni logiciel de caisse certifié : les protections du journal ne valent pas conformité à l’article 286 du CGI.
- Factures clients : voir `docs/platform/SALES_INVOICES.md`. Le PDF n’est pas une facture électronique, le XML n’est pas validé, l’export FEC reste à contrôler par l’expert-comptable et aucune plateforme agréée n’est branchée.
- Fidélité : consentement, mouvements manuels et codes nominatifs utilisables au règlement sont disponibles, avec échange de points et fiche privée partageable. Pas d’acquisition automatique de points après achat ni d’espace client authentifié. Le lien privé est un accès par possession du lien, pas une preuve d’identité ; vérifier le titulaire lors du règlement. Aucun envoi automatique.
- Notifications : historique et lu/non lu ; pas d’alerte sonore, de destinataire serveur individuel, de notifications push, SMS ou e-mail.

## Site et production

- Accueil, carte, demandes de réservation/commande et contact sont connectés. Compte client, galerie, avis et pages légales présentent honnêtement ce qui reste à fournir ; aucun témoignage, visuel de plat réel ou engagement juridique n’est inventé.
- Illustrations décoratives CSS, pas de photographie officielle. Adresse et téléphone viennent du prompt et n’ont pas été vérifiés auprès du restaurant.
- Metadata et favicon sont présents. Le sitemap contient une origine locale ; robots et metadata interdisent l’indexation. SEO par page et données structurées Restaurant validées restent à préparer pour publication.
- En démonstration, PostgreSQL est embarqué et monoprocessus, et sa connexion privilégiée contourne la RLS. La production utilise un PostgreSQL séparé : voir [isolation des tenants](platform/TENANT_ISOLATION.md).
- Les politiques RLS sont déployées et vérifiées par `npm run test:isolation` sur un PostgreSQL local. Elles n’ont pas été vérifiées sur une base hébergée.
- Authentification OIDC et limitation de débit en base présentes. Stratégie de sauvegarde automatisée, observabilité et audit de sécurité indépendant restent à établir.
- Tests responsive automatisés à 390 px et desktop ; pas de certification exhaustive d’accessibilité ni tests de tous les navigateurs/appareils.

## Extensions externes

Push : ajouter une souscription Push API avec consentement explicite, clés VAPID serveur, stockage des abonnements par utilisateur et appareil, service worker, worker d’envoi avec retries et suppression des abonnements expirés. Tester les restrictions PWA iOS et HTTPS. Aucun push n’est actuellement envoyé.

E-mails : ajouter un fournisseur transactionnel après autorisation, identités de domaine validées, boîte d’envoi persistante avec clé d’idempotence, modèles vérifiés et journal des échecs. Le succès d’une réservation actuelle signifie uniquement son enregistrement local.

## Audit des dépendances du 14 octobre 2026

`npm audit --omit=dev` : aucune vulnérabilité signalée. L’audit complet signale cinq entrées de sévérité élevée dans la chaîne de développement `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` (épuisement de pile sur motifs profondément imbriqués). La dernière version de braces disponible au contrôle est 3.0.3, également signalée. Le correctif automatique proposé rétrograderait la configuration Next.js de façon majeure ; il n’a pas été appliqué. Ces paquets servent au lint local, pas au runtime de l’application. Réévaluer lors de la mise à jour de l’outillage ; ne pas passer de motifs provenant de tiers au lint.
