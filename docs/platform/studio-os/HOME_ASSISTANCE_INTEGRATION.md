# Home Assistante → Studio OS

Source : `new_modules/home_assistance.zip` (code `src/modules`, sept migrations, documentation et écrans). Ne jamais importer ses `.env.local`, comptes de démo, caches, dépendances ni sa base indépendante.

## Inventaire sans doublons

| Fonction de Home Assistante | Propriétaire dans Studio OS | Travail nécessaire |
| --- | --- | --- |
| Authentification, MFA, rôles, audit et isolation | Core identité et permissions | Ajouter des droits pour client, proche autorisé et intervenant, avec isolation par établissement ; ne pas importer Supabase Auth. |
| Site, CMS, catalogue et devis | `website`, `services`, `catalog`, `estimation`, `quote-builder` | Ajouter les prestations, tarifs datés et vérification des prestations réglementées. |
| CRM et prospects | Clients et `pipeline-crm` | Relier bénéficiaires et adresses à la fiche client ; préserver les notes et activités existantes. |
| Réservation, calendrier et report | `table-booking`, `appointment-booking` | Étendre les créneaux aux intervenants, trajets, récurrences et affectations ; ne pas utiliser les tables de restaurant pour les domiciles. |
| Intervenants, compétences, zones et absences | `team`, `attendance` | Nouveau domaine métier personnel à domicile, distinct du pointage RH. |
| Bénéficiaires et proches | Nouveau domaine `home-assistance` | Autorisations révocables, droits de lecture propres au bénéficiaire et à chaque proche. Données sensibles hors `trade_records`. |
| Visites, étapes et comptes rendus | Nouveau domaine `home-assistance` | Cycle d'intervention, durée déclarée puis validée, incidents, historique immuable. |
| Prix, paiements, factures, avoirs | `finance`, `payments`, `client-invoices` | Prix figé à la réservation, facturation des minutes validées, rapprochement ; ne pas créer un deuxième registre financier. |
| Fidélité, notifications, automatisations, support | Modules transversaux existants | Brancher les événements d'intervention et les proches autorisés sur les services communs. |
| Tableau de bord, anomalies, recommandations | `pilotage`, `analytics` | Projections dédiées, sans exposer de données sensibles ni copier un moteur d'IA non livré. |
| Espace client et intervenant, export `.ics`, accessibilité, langues | Site et espaces existants | Écrans et permissions spécifiques après les modèles de données et contrats serveur. |

## État de l'implémentation

Le secteur `home_assistance` est proposé à l'inscription et accepté en base. Il installe les outils communs `appointment-booking`, `quote-builder` et l'écran dédié `home-operations`. Les migrations 180 à 184 ajoutent les bénéficiaires, autorisations révocables, intervenants, prestations tarifées, disponibilités et visites ; la boutique référence cet écran. Le cockpit permet de rechercher des créneaux, planifier une visite ou une série, affecter l'intervenant selon les compétences requises, confirmer, reporter ou annuler, enregistrer un rapport et valider la durée. Il peut créer un brouillon individuel ou préparer les brouillons du mois dans `client-invoices` avec le taux de TVA choisi, si cet add-on est installé et la société configurée. Le client lié et le proche autorisé peuvent demander une prestation ; le personnel doit affecter et confirmer la visite. Un espace de lecture cloisonné par RLS leur permet, ainsi qu'à l'intervenant affecté, de retrouver leurs données ; l'intervenant peut soumettre son rapport sans droit général de modification. Une contrainte bloque les chevauchements avec un tampon fixe de 30 minutes.

Les changements de visite et les demandes du portail créent des notifications internes via l'infrastructure commune ; l'envoi de rappels par e-mail ou SMS n'est pas raccordé. Ce parcours ne couvre pas encore le produit complet du ZIP : paiement Stripe d'acompte, émission mensuelle automatique des factures, rappels externes, optimisation de tournées et conformité fiscale espagnole restent à intégrer. Les récurrences hebdomadaires conservent l'heure locale `Europe/Madrid` pendant le changement d'heure ; la recherche de créneaux par date utilise encore une journée UTC et devra recevoir le fuseau de l'agence. L'écran du portail est accessible à `/home-assistance/{identifiant-établissement}`.

## Ordre d'intégration

1. Modèle relationnel et permissions : intervenant, bénéficiaire, adresse, autorisation d'un proche ; séparation des lectures et révocation.
2. Disponibilités, affectations et réservation : transaction anti-chevauchement comprenant trajet et créneaux ; prix figé et validation humaine.
3. Cycle d'intervention : étapes, rapport, incident, durée validée et piste d'audit.
4. Paiement, facture et avoir : adapter les services communs au temps validé ; tester l'idempotence.
5. Brancher les trois espaces, notifications et pilotage ; parcours et tests d'isolation multi-établissements.

Le ZIP indique que la souscription en ligne, les SMS, le push, les passkeys et l'IA ne sont pas livrés. Sa fiscalité et ses règles espagnoles de démonstration ne doivent pas être appliquées automatiquement à Studio OS.
