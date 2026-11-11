# Add-ons et installation

La boutique réunit deux circuits commerciaux existants : les fonctionnalités historiques (incluses dans un forfait, ou Factures fournisseurs en abonnement mensuel de test) et les produits du catalogue (gratuits ou à paiement unique). Les idées « À venir » sont descriptives et ne passent jamais par les API de paiement ou d’installation.

`addon_installations` conserve le choix de chaque établissement séparément de `addon_subscriptions` et `addon_licenses`. Une ligne absente signifie « installé » pour préserver les établissements existants après migration. `app.addon_entitled` vérifie le droit commercial ; `app.addon_installed` ajoute le choix d’installation. La désinstallation ne modifie ni les licences, ni les abonnements, ni les données métier. La réinstallation d’un droit encore valide ne crée aucune commande.

Seul le gestionnaire autorisé de l’établissement (`app.addon_store_manager`) peut installer, désinstaller ou acheter. Les fonctions SQL contrôlent le rôle et l’établissement ; la navigation masque aussi les modules désinstallés. Les accès serveur passent par `app.module_enabled` (salle, réservations), les droits commerciaux nommés (site, fidélité, commandes en ligne), `app.has_addon` (factures fournisseurs), et les fonctions de licence d’analyse. L’écran de chargement et le site public vérifient également l’installation.

Pour ajouter un addon fonctionnel, définir sa rubrique dans la navigation, relier son accès serveur à l’état d’installation et préciser son droit commercial. Un addon futur ne doit devenir achetable ou installable qu’une fois sa fonction livrée et son tarif validé.

## Estimation

L’add-on `estimation-studio` ajoute un scénario par établissement. Le super admin renseigne des produits ou services, un prix unitaire, un coût unitaire éventuel, des quantités et d’autres coûts prévus. Il peut importer un produit de la carte : les valeurs sont copiées lors de l’import et doivent ensuite être vérifiées. L’analyse interne affiche ventes, coûts et marge théorique ; si un coût unitaire manque, la marge est explicitement indisponible.

La publication ajoute `/r/{établissement}/estimation` au site public. La fonction SQL `app.estimation_public` ne retourne que les noms, prix et bornes de quantité. Elle exige une configuration publiée, les addons Estimation et Site web installés, et l’établissement actif. La simulation publique n’enregistre aucune demande et n’est pas un devis ferme. La désinstallation masque la page et conserve le scénario.

## Emails automatiques

L’add-on mensuel `email-automation` (9 € TTC, module `email-automation`, écran « Emails » dans Relation client) envoie des emails aux couleurs de chaque établissement, automatiquement ou à la main. Prix Stripe : `STUDIO_ADDON_EMAIL_AUTOMATION_PRICE_ID`. Migration `175_email_automation.sql`, retour arrière dans `down/175`.

Le module est découpé en trois briques indépendantes, branchées ensemble uniquement dans `src/features/email/index.ts`, le seul fichier que les autres modules importent :

| Brique | Dossier | Tables | Rôle |
|---|---|---|---|
| Moteur d’envoi | `engine/` | `email_messages` | File, réservation atomique (`app.email_claim`), livraison hors transaction, solde (`app.email_complete`), nouvelles tentatives. Ne connaît ni les couleurs ni le SMTP : il reçoit un port de rendu et un port de transport. |
| Personnalisation | `branding/` | `email_brands`, `email_templates` | Identité visuelle (couleurs, typographies, logo, en-tête, boutons, signature, pied de page), modèles des déclencheurs et modèles libres, rendu HTML compatible clients mail. Le rendu est pur : l’écran l’utilise pour l’aperçu en direct. |
| Configuration SMTP | `smtp/` | `email_transports` | SMTP de la plateforme (les identifiants de Supabase Auth, variables `EMAIL_SMTP_*`, ou relais Resend) ou serveur de l’établissement. Mot de passe chiffré (AES-256-GCM, `INTEGRATION_ENCRYPTION_KEY`, lié à l’établissement), colonne illisible par le rôle applicatif. Le nom d’hôte est résolu et toute adresse interne refusée ; la connexion se fait sur l’adresse vérifiée. |

**Isolation.** Chaque table porte `restaurant_id` et la RLS exige l’établissement ouvert, l’add-on installé et un canal non public. Deux établissements d’une même organisation ont chacun leur identité, leurs modèles, leur SMTP et leur historique.

**Déclencheurs.** Un module émet un événement par `emitEmailEvent` (réservations : `src/features/reservations/emails.ts`). `app.email_trigger` ne fait rien si l’add-on est inactif ou l’automatisation désactivée (désactivées par défaut), ignore un doublon dans l’heure, plafonne à 1 000 emails par jour et par établissement et ne lève jamais d’erreur : un email ne fait jamais échouer l’opération métier. Il fonctionne aussi depuis le canal public (demande de réservation sur le site).

**Livraison.** Le message est inscrit dans la transaction métier avec un job `email_send`. Il part juste après la réponse HTTP (`after()`), ce qui suffit sans worker (Vercel), et le worker reprend tout message restant. La réservation atomique empêche un double envoi. Le contenu est rendu au moment de l’envoi puis figé dans l’historique.

**Démonstration.** Sans SMTP réel, les envois sont rendus et tracés « simulés ». Seul un test vers une adresse saisie à la main part réellement par le SMTP de l’établissement ; les fiches clients fictives ne reçoivent jamais rien.

**Droits.** Lecture : permission `customers` ou `settings`. Modèles, automatisations, envois : `customers`. Identité visuelle et SMTP : `settings`. Les emails marketing ne partent qu’aux clients qui ont donné leur accord et portent la mention de désinscription.
