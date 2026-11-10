# Boutique Add-ons — historique du premier parcours Stripe test

> État courant : voir `PAID-FEATURE-ADDONS.md`. Les huit fonctionnalités mensuelles sont désormais indépendantes des forfaits, avec droits historiques conservés pour les établissements existants. Les passages ci-dessous décrivent le premier parcours Factures fournisseurs et son contexte de l’époque.

## Périmètre livré

Premier add-on raccordé : **Factures fournisseurs**, 9 € TTC/mois par établissement. Les offres 69/99 le comprennent toujours. Un propriétaire d'organisation au forfait 39 peut ouvrir Checkout depuis le dashboard si la configuration serveur est prête. Les autres cartes restent non achetables : leur raccordement indépendant n'est pas terminé. Aucun débit en production n'est autorisé.

Une commande persistante précède Checkout. Une contrainte empêche plusieurs commandes ouvertes pour le même add-on/établissement. Le prix vient d'un Price Stripe côté serveur, vérifié : 900 centimes TTC, EUR, mensuel, quantité 1, TVA incluse, test. Stripe Tax est activé ; configurer ses paramètres dans le compte de test. La page de retour ne donne aucun droit.

Le webhook vérifie la signature, refuse les événements réels et relit l'état Stripe actuel sous verrou de la commande pour éviter les doubles activations et les notifications désordonnées. L'échéance est stockée ; sans renouvellement confirmé, l'accès expire. Le chargement du catalogue par un administrateur réconcilie également les commandes en attente/actives. Un clic de résiliation arrête le renouvellement à la fin de la période payée.

L'accès Factures fournisseurs conserve le cadrage d'établissement et la permission finance ; il ne donne pas accès à Banque, aux factures clients ou au Pilotage financier général. La navigation expose uniquement la section Factures fournisseurs supplémentaire. Les données sont conservées après expiration.

## Configuration requise

- `STUDIO_BILLING_STRIPE_SECRET_KEY` : clé Stripe test uniquement.
- `STUDIO_BILLING_STRIPE_WEBHOOK_SECRET` : signature du endpoint `/api/webhooks/addons`.
- `STUDIO_ADDON_INVOICES_PRICE_ID` : Price test mensuel de 9 € TTC avec TVA incluse.
- `STUDIO_BILLING_DATABASE_URL` : connexion dédiée de réconciliation, **pas** le rôle de l'application ordinaire.
- `APP_URL` : origine de l'application.

Migration additive : `043_addon_subscriptions.sql`. Ne pas exécuter sur une base réelle sans la procédure de déploiement habituelle. Aucun environnement hébergé n'a été migré par ce travail.

Le rôle dédié de facturation doit avoir USAGE sur public/app, SELECT et UPDATE sur `public.addon_subscriptions`, une politique RLS dédiée l'autorisant à verrouiller/lire ces lignes, et EXECUTE sur `app.addon_reconcile(text,text,text,text,timestamptz)`. Créer ce rôle par l'opérateur ; ne pas distribuer ses identifiants aux utilisateurs et ne pas réutiliser un rôle de migration privilégié. La fonction de réconciliation est interdite au rôle applicatif normal. La politique et les privilèges de ce compte restent à provisionner sur l'installation cible.

Événements : checkout.session.completed, checkout.session.expired, checkout.session.async_payment_succeeded, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed. Stripe réessaie une notification non traitée. Le traitement n'utilise pas encore une file de tâches dédiée : il est synchrone et sérialisé par commande.

## Limites avant ouverture plus large

- Aucun test contre l'API Stripe réelle : clés non configurées. Les tests locaux couvrent signature/configuration et droits persistants, pas un achat Checkout de bout en bout.
- Vérification navigateur à effectuer ; aucun succès visuel revendiqué.
- Le catalogue ne propose pas encore de démonstrations isolées.
- L'upgrade d'un forfait avec un add-on déjà souscrit exige encore un ajustement explicite de l'abonnement Stripe : ne pas ouvrir commercialement sans automatiser ce chevauchement. Une activation incluse ne doit pas être facturée en double.
- Configuration du régime de TVA financier pour les factures : le parcours indépendant doit être validé avec les réglages existants avant publication.
- Facturation des ressources et crédits Studio non raccordée ; crédits Cuisine IA inchangés.
- Les autres add-ons (site, fidélité, boutique) restent bloqués à l'achat jusqu'à migration de leurs contrôles serveur, publics et SQL.

## Vérifications

Tests de signature test/réelle, secret absent et clé interdite ; test PGlite de migration, expiration, accès indépendant au forfait 39, refus d'accès finance général, rôles métier, autre établissement, doublon et interdiction de réconciliation/UPDATE par le rôle applicatif. Les tests historiques Factures fournisseurs sont relancés. Typage et ESLint sont contrôlés séparément.

Résultat de la suite locale : 239 tests réussis. La vérification supplémentaire de la dernière facture Stripe a ensuite été ajoutée et vérifiée au typage/lint ; le cycle Stripe de renouvellement reste à tester sur sandbox.

## Suite — Suivi du renouvellement

Migration additive 045 : `renewal_cancelled` nullable. Les lignes antérieures restent « non encore vérifiées » tant que Stripe n’a pas confirmé leur état. La réconciliation met à jour cet état dans la même transaction que l’accès payé. La fonction `app.addon_renewal(text,text,boolean)` est interdite à PUBLIC et au rôle applicatif ; accorder EXECUTE uniquement au rôle dédié de facturation lors du provisionnement. La politique d’insertion interdit d’injecter cet état depuis l’application ordinaire.

La page affiche la fin de la période payée en heure de Paris, le renouvellement automatique, arrêté ou non encore vérifié. Le bouton de résiliation disparaît quand l’arrêt est confirmé. L’accès reste gouverné par le statut actif et l’échéance, pas par le simple arrêt du renouvellement. Si la fonctionnalité est aussi incluse dans le forfait, la carte signale l’abonnement supplémentaire ; aucune résiliation automatique liée à un upgrade n’est introduite.

Avant résiliation, le serveur relit l’abonnement et vérifie identifiant, métadonnée de commande, mode test, prix, quantité et statut. Il demande uniquement un arrêt à l’échéance. Une résiliation déjà prévue au plus tard à la fin de la période n’est pas repoussée. Une date d’arrêt plus lointaine n’est pas assimilée à un arrêt du prochain renouvellement. Après acceptation, le serveur synchronise la fiche ; en cas d’échec de cette synchronisation, la réponse indique la confirmation Stripe et l’actualisation encore en cours au lieu d’affirmer que la résiliation a échoué.

Référence primaire consultée : [annulation à la fin d’une période et événements Stripe](https://docs.stripe.com/billing/subscriptions/cancel). La validation réelle Checkout/Stripe reste à effectuer : aucun appel au compte Stripe n’a été exécuté pendant ce lot.

Vérification : suite complète de 257 tests réussis, puis huit tests ciblés relancés avec succès après ajout du contrôle des dates de résiliation personnalisées. Couverture SQL de la migration réentrante, du maintien d’accès après arrêt du renouvellement et de son expiration, de l’interdiction de modifier ou falsifier le drapeau côté application. Passerelle Stripe simulée pour les refus de mode/identité/prix/statut, confirmations et échecs réseau. Aucun déploiement ni migration de production.

Résultat navigateur : quatre parcours réussis, dont refus puis acceptation de la confirmation de résiliation, date affichée, disparition du bouton après confirmation, accès conservé, rechargement et maintien via forfait inclus. La résiliation et les abonnements de ce parcours sont simulés par réponses API de test. Typage, ESLint ciblé, compilation et contrôle du diff réussis.

## Suite — Achats uniques

Migration additive 049. Les écrans premium utilisent Checkout en `mode: payment`, avec un montant lu dans `addon_products` côté serveur : aucun Price Stripe n’est à créer et un changement de prix ne demande pas de code. Chaque commande fige son montant ; si le prix change, la page de paiement encore ouverte est fermée avant d’en créer une nouvelle.

Le webhook relit toujours l’état Stripe sous verrou de la commande et contrôle mode, métadonnée, montant et devise. Rejouer une notification n’a donc aucun effet. La page de retour n’accorde aucun droit.

### À configurer

1. Variables : `STUDIO_BILLING_STRIPE_SECRET_KEY` (clé restreinte `rk_test_` recommandée : Checkout Sessions, Disputes et Refunds en écriture ou lecture selon l’usage), `STUDIO_BILLING_STRIPE_WEBHOOK_SECRET`, `STUDIO_BILLING_DATABASE_URL`, `APP_URL`.
2. Connexion de facturation : créer un compte de connexion dédié, puis `GRANT atacuisine_addon_billing TO <compte>;`. Ce rôle n’a accès qu’aux trois fonctions `app.addon_purchase_lock`, `app.addon_purchase_by_intent` et `app.addon_purchase_apply`. Les abonnements existants gardent leurs propres privilèges, décrits plus haut.
3. Endpoint `/api/webhooks/addons` : ajouter aux événements existants `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated` et `charge.dispute.closed`.
4. Stripe Tax : `automatic_tax` est activé, comme pour les abonnements. Sans enregistrement fiscal actif dans le pays du client, Stripe ne collecte aucune taxe. Vérifier l’adresse d’origine et les enregistrements du compte.

### Limites

- Mode test uniquement : `addonStripe()` refuse toute clé réelle et `addonWebhook()` tout événement réel. L’ouverture à de vrais paiements est une décision à prendre, avec levée explicite de cette garde.
- Vérifié avec une passerelle Stripe simulée et PGlite ; aucun paiement n’a été exécuté contre l’API Stripe, ni contre un PostgreSQL réel avec le rôle de facturation.
