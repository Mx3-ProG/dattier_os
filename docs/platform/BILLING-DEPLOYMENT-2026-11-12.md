# Facturation Studio — 12 novembre 2026

Production : https://www.studio-os.digital
Déploiement GitHub final : dpl_7MAS6ZjktvWtqaiQuvG4QEXPyVLV (READY, PROMOTED sur www.studio-os.digital).
Premier déploiement CLI : dpl_5ynHhevdgZgkSGMmArvfeKNj2MWh
Base de publication : 59332db0c78be5582841a0e9639aa5109272d2a4
Commit isolé : fca23e8 (copie de travail /tmp/studio-billing-release).
Patch reproductible : STUDIO-BILLING-RELEASE-2026-11-12.patch.

Les quatre variables demandées sont enregistrées dans Vercel en production, avec STUDIO_STRIPE_PORTAL_CONFIGURATION. Aucune valeur secrète n’est conservée dans ce document.

Compte Stripe OS : acct_1UYPwHApai8VVkXi. Produit Exploitation, tarif price_1UYQZwApai8VVkXi2FIKCDGM, 39 EUR/mois. Webhook we_1UazpPApai8VVkXiLWRi5dzh, portail bpc_1UazpPApai8VVkXiHGgHYVDH.

Rôle de connexion atacuisine_billing_web créé avec l’autorisation explicite de l’utilisateur, membre de atacuisine_addon_billing, sans BYPASSRLS. Vérifié : peut appeler plan_reconcile_details, ne peut pas lire profiles. Migrations 112 et 171 appliquées. Le numéro 150 est déjà occupé par une migration distincte dans la branche de production ; la nouvelle migration de facturation utilise 171.

Fonctions publiées : checkout carte obligatoire et sept jours gratuits, historique des factures/achats, prochaine échéance, résiliation en fin de période, ajout de places via confirmation Stripe, rappel des essais gratuits expirés au maximum une fois toutes les dix heures.

Validation : compilation de production réussie ; trois tests de règles/intégration sur la version publiée ; checkout Stripe LIVE ouvert sans saisie de carte, affiche sept jours gratuits puis 39 EUR/mois à compter du 19 novembre ; notification non signée rejetée (400), contrôle signé sans abonnement reçu (200) ; page /checkout/39 en HTTP 200. Aucun paiement réel ni abonnement client créé pendant ces vérifications. Le débit après sept jours et l’historique d’un véritable paiement ne sont donc pas confirmés par un encaissement réel.

Les douze add-ons existent au catalogue Stripe. Leur achat live n’a pas été validé dans cette livraison ; la version précédemment publiée utilise encore un circuit d’add-ons distinct limité au mode test. Ne pas confondre disponibilité du catalogue et activation commerciale de chaque add-on.

La publication utilise une copie de la version déjà en ligne pour préserver les travaux locaux concurrents et le bandeau Black Friday. Le commit fca23e8 est enregistré sur main après l’autorisation explicite de l’utilisateur. Ne pas remplacer le workspace local par cette copie : il contient des changements d’architecture et des fonctionnalités indépendantes.
