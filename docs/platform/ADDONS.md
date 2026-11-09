# Add-ons et installation

La boutique réunit deux circuits commerciaux existants : les fonctionnalités historiques (incluses dans un forfait, ou Factures fournisseurs en abonnement mensuel de test) et les produits du catalogue (gratuits ou à paiement unique). Les idées « À venir » sont descriptives et ne passent jamais par les API de paiement ou d’installation.

`addon_installations` conserve le choix de chaque établissement séparément de `addon_subscriptions` et `addon_licenses`. Une ligne absente signifie « installé » pour préserver les établissements existants après migration. `app.addon_entitled` vérifie le droit commercial ; `app.addon_installed` ajoute le choix d’installation. La désinstallation ne modifie ni les licences, ni les abonnements, ni les données métier. La réinstallation d’un droit encore valide ne crée aucune commande.

Seul le gestionnaire autorisé de l’établissement (`app.addon_store_manager`) peut installer, désinstaller ou acheter. Les fonctions SQL contrôlent le rôle et l’établissement ; la navigation masque aussi les modules désinstallés. Les accès serveur passent par `app.module_enabled` (salle, réservations), les droits commerciaux nommés (site, fidélité, commandes en ligne), `app.has_addon` (factures fournisseurs), et les fonctions de licence d’analyse. L’écran de chargement et le site public vérifient également l’installation.

Pour ajouter un addon fonctionnel, définir sa rubrique dans la navigation, relier son accès serveur à l’état d’installation et préciser son droit commercial. Un addon futur ne doit devenir achetable ou installable qu’une fois sa fonction livrée et son tarif validé.

## Estimation

L’add-on gratuit `estimation-studio` ajoute un scénario par établissement. Le super admin renseigne des produits ou services, un prix unitaire, un coût unitaire éventuel, des quantités et d’autres coûts prévus. Il peut importer un produit de la carte : les valeurs sont copiées lors de l’import et doivent ensuite être vérifiées. L’analyse interne affiche ventes, coûts et marge théorique ; si un coût unitaire manque, la marge est explicitement indisponible.

La publication ajoute `/r/{établissement}/estimation` au site public. La fonction SQL `app.estimation_public` ne retourne que les noms, prix et bornes de quantité. Elle exige une configuration publiée, les addons Estimation et Site web installés, et l’établissement actif. La simulation publique n’enregistre aucune demande et n’est pas un devis ferme. La désinstallation masque la page et conserve le scénario.
