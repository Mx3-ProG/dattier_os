# Contrat de conservation des parcours

Les scénarios suivants constituent les invariants du passage à STUDIO OS. Les noms de fichiers désignent une couverture existante, pas une preuve de succès de cette exécution ; voir VERIFICATIONS.md.

| Parcours | Invariants à conserver | Tests existants |
| --- | --- | --- |
| Salle → commande → cuisine/bar → service → règlement | Prix serveur, transitions, droits, stock réservé/consommé, historique et idempotence | `integration.test.ts`, `domain.test.ts`, `e2e/journey.spec.ts` |
| Plan de salle → réservation publique → accueil | Tables indisponibles exclues, capacité, chevauchements, archivage avec historique, heures été/hiver | `floor.test.ts`, `booking.test.ts`, `reservation-page.test.ts` |
| Catalogue → recette → disponibilité | Unités, quantités, disponibilité, produits archivés et commandes historiques | `extensions.test.ts`, `domain.test.ts` |
| Achat → réception partielle → inventaire | Quantité reçue, restant, unités et périmètre établissement | `platform-modules.test.ts`, `extensions.test.ts` |
| Boutique → créneau → commande → suivi | Prix recalculés, jeton de suivi borné, stocks, double soumission | `platform.test.ts`, `extensions.test.ts`, `e2e/extensions.spec.ts` |
| Paiement marchand → notification → versement | Signature, montant, déduplication, remboursements et blocages | `payments.test.ts` (prestataire simulé) |
| Vente → pré-comptabilité → Pilotage | Pas de double écriture, TVA explicite, contre-passation, qualité des chiffres | `finance.test.ts`, `finance-dashboard.test.ts` |
| Facture client → émission → avoir/règlement | Numérotation, immutabilité, paiement partiel et absence de double comptabilisation | `billing.test.ts` |
| Facture fournisseur → extraction → validation | Document conservé, humain validateur, doublons, débit IA | `invoices.test.ts` (extraction simulée) |
| Relevé → rapprochement → annulation | Import dédupliqué, correspondance recalculée, écritures compensatoires | `bank.test.ts` |
| Planning → pointage → correction → clôture | Auteur, motif, calcul déterministe, salaires masqués, clôture protégée | `hr.test.ts` |
| Client → fidélité → récompense/parrainage | Consentements, solde, attribution et utilisation sans doublon | `customer-engagement.test.ts`, `extensions.test.ts` |
| Message client | Permissions, destinataire, consentement commercial, état fournisseur | `customer-messages.test.ts` |
| CMS → brouillon → publication → restauration | Brouillon privé, version, conflit, médias publiés, URL et thème | `studio-security.test.ts`, `cms-templates.test.ts`, `e2e/studio-creation.spec.ts` |
| Domaine → site → référencement | Propriété, domaine principal, canonical, absence de fuite entre sites | `seo.test.ts` |
| Organisation → invitation → équipe | Identité vérifiée, invitation unique, cumul des rôles, suspension | `platform.test.ts` |
| Forfait → changement → capacité | Droits actuels, prix/parrainage, archive explicite et commandes à terminer | `platform.test.ts`, `referrals.test.ts` |
| Appareil hors ligne → reconnexion | Quotas, rejeu sans doublon, conflits conservés, absence de fuite de cache | `platform.test.ts`, `service-worker.test.ts`, `e2e/journey.spec.ts` |
| Assistant → proposition → confirmation | Aucune action inventée/exécutée sans contrôle, permissions revérifiées, coûts | `assistant.test.ts`, `finance-dashboard.test.ts` |
| QR → destination | Objet, établissement, rôle et visibilité de la cible | `qr.test.ts` |
| Sécurité → incident → correction → archive | Permissions, approbation, trace, reprise worker et intégrité | `studio-security.test.ts` |
| Apparence et guide | Préférence personnelle, progression, navigation et accessibilité | `appearance.test.ts`, `e2e/*appearance.spec.ts` |

Tous les chemins de tests sont relatifs à `tests/`.

## Invariants des futurs add-ons

À ajouter aux tests lors de l'implémentation du registre, pas à simuler comme disponibles aujourd'hui :

1. L'administrateur active Salle pour l'établissement autorisé ; les membres habilités y accèdent, les autres restent refusés côté serveur.
2. Cacher Salle dans ses préférences ne retire pas le module aux collègues et ne modifie pas la facturation.
3. La réservation visuelle exige une configuration de tables valide ; l'activation annonce et prépare ses dépendances.
4. Désactiver un module ne supprime pas ses données et ne laisse pas de page, bloc CMS, QR, guide ou outil IA utilisable sans droit.
5. Les opérations déjà engagées ont une politique explicite de clôture, consultation et export.
6. Une démonstration de boutique n'accède pas aux données réelles et ne déclenche aucune facturation ou notification réelle.
7. Un upgrade incluant une option existante ne facture pas deux fois la même capacité.
8. Deux entreprises sur la même infrastructure ne partagent pas leurs données, abonnements ou personnalisations.
9. Une panne d'un fournisseur facultatif laisse fonctionner les autres capacités selon leur contrat.

## Méthode avant chaque lot

Comparer l'état de travail à REFERENCE.json et expliquer les écarts pertinents. Relancer les tests du périmètre touché, puis les tests transversaux si droits, identité, transactions ou données changent. Vérifier les parcours publics/équipe et les refus, pas seulement les menus. Lire la documentation Next.js installée avant de modifier ses API. Ne pas exécuter de test destructif sur une base utilisée par le client.

## Protection des données

Aucune suppression ou réinitialisation de la démonstration habituelle pendant ce lot. Les tests navigateur réinitialisent leurs données : les diriger uniquement vers la copie temporaire et son répertoire `demo-data`. PostgreSQL réel nécessite une base dédiée explicitement isolée. La restauration base/identités/médias reste un exercice distinct à réaliser avant une migration de production.
