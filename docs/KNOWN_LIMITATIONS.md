# État exact de la V0

Le parcours de service central est implémenté. Les fonctions ci-dessous restent partielles ou absentes ; cette liste prévaut sur toute interprétation du mot « complet ».

## Compléments partiels

- Multi-établissements : sélection et isolation ; pas de vue financière consolidée/comparative. L’ajout crée un établissement vide, dont l’équipement initial nécessite encore une intervention technique.
- Utilisateurs : profils fictifs et affectations ; pas d’interface complète de création, invitation, suspension ou gestion multi-rôle. Plusieurs rôles par établissement sont pris en compte (union des permissions, rôle principal déterministe) mais aucune interface ne permet encore de les attribuer.
- Salle : grille de tables fixe, capacités et états ; pas d’éditeur de positions, de zones ni de transfert/fusion de tables. Les réservations confirmées sont signalées, pas de timeline spatiale.
- Commandes : ajouts successifs et annulation de lignes ; pas de variantes, suppléments, modification de quantité en place, division de ligne ni règlement partiel. Remplacer une ligne en l’annulant puis en ajoutant une nouvelle commande dans la session.
- QR : interface `/qr?table=bernay-t8` pour une session ouverte et acceptation obligatoire par le personnel ; génération/impression des images QR non implémentée. Ne pas exposer ce canal sans anti-abus de production.
- Stocks : lots, pertes, corrections par lot ; pas de campagne d’inventaire avec brouillon multi-lignes, transferts d’emplacement, retours ou gestion des conversions depuis tous les formulaires.
- Approvisionnements : commandes mono-ingrédient et réceptions partielles ; pas de cycle brouillon/envoyé/confirmé complet, envoi de bons, facture ou pièce jointe.
- Équipe : liste fictive, ajout/suppression de créneaux, pointages ; pas de congés, absences, édition de profil, paie ni correction manuelle de pointage.
- Carte : création de produits avec recette, modification, archivage/restauration et suppression sans historique disponibles. Restent à développer : création d’ingrédients et de catégories, photos, allergènes validés, variantes, suppléments, menus composés et plages de vente.
- Finance : déclarations, dépenses, ventes par jour, export CSV ; pas de fiscalité validée, marges HT, filtres avancés ni comptabilité. Aucun logiciel de caisse certifié.
- Fidélité : consentement, mouvements manuels et codes nominatifs utilisables au règlement sont disponibles, avec échange de points et fiche privée partageable. Pas d’acquisition automatique de points après achat ni d’espace client authentifié. Le lien privé est un accès par possession du lien, pas une preuve d’identité ; vérifier le titulaire lors du règlement. Aucun envoi automatique.
- Notifications et historique : page de notifications rangée par rubrique sur 7 jours, historique opérationnel filtrable par rubrique, période et auteur (voir `NOTIFICATIONS.md`). Pas d’export de l’historique ni de purge automatique des anciennes notifications (elles sortent seulement de l’affichage). Centre filtré par permissions effectives, priorités, lu unitaire/global, préférences par type, alertes calculées (stock faible, rupture, péremption, retard, indisponibilité, dépense inhabituelle) et notification individuelle de planning (voir `NOTIFICATIONS.md`). Pas d’alerte sonore, de push, SMS ni e-mail ; temps réel par polling. Seuils (20 min, 2 jours, ×3) non configurables depuis l’interface. Notifications « responsabilité / permission modifiée » à brancher quand la gestion des affectations aura une interface.

## Site et production

- Accueil, carte, demandes de réservation/commande et contact sont connectés. Compte client, galerie, avis et pages légales présentent honnêtement ce qui reste à fournir ; aucun témoignage, visuel de plat réel ou engagement juridique n’est inventé.
- Illustrations décoratives CSS, pas de photographie officielle. Adresse et téléphone viennent du prompt et n’ont pas été vérifiés auprès du restaurant.
- Metadata et favicon sont présents. Le sitemap contient une origine locale ; robots et metadata interdisent l’indexation. SEO par page et données structurées Restaurant validées restent à préparer pour publication.
- PostgreSQL embarqué persistant monoprocessus. Pas de connexion Supabase distante, Auth, Storage ni Realtime actifs. L’adaptateur local est expressément bloqué sur Vercel.
- RLS est activée mais aucune politique applicative Supabase n’est encore déployée/testée ; le serveur local utilise une connexion privilégiée et des autorisations applicatives.
- Pas d’authentification réelle de production, limitation de débit distribuée, stratégie de sauvegarde automatisée, observabilité ni audit de sécurité indépendant. La démo ne doit contenir aucune donnée réelle.
- Tests responsive automatisés à 390 px et desktop ; pas de certification exhaustive d’accessibilité ni tests de tous les navigateurs/appareils.

## Extensions externes

Push : ajouter une souscription Push API avec consentement explicite, clés VAPID serveur, stockage des abonnements par utilisateur et appareil, service worker, worker d’envoi avec retries et suppression des abonnements expirés. Tester les restrictions PWA iOS et HTTPS. Aucun push n’est actuellement envoyé.

E-mails : ajouter un fournisseur transactionnel après autorisation, identités de domaine validées, boîte d’envoi persistante avec clé d’idempotence, modèles vérifiés et journal des échecs. Le succès d’une réservation actuelle signifie uniquement son enregistrement local.

## Audit des dépendances du 14 octobre 2026

`npm audit --omit=dev` : aucune vulnérabilité signalée. L’audit complet signale cinq entrées de sévérité élevée dans la chaîne de développement `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` (épuisement de pile sur motifs profondément imbriqués). La dernière version de braces disponible au contrôle est 3.0.3, également signalée. Le correctif automatique proposé rétrograderait la configuration Next.js de façon majeure ; il n’a pas été appliqué. Ces paquets servent au lint local, pas au runtime de l’application. Réévaluer lors de la mise à jour de l’outillage ; ne pas passer de motifs provenant de tiers au lint.
