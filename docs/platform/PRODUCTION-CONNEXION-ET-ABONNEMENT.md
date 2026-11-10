# Mise en service : connexion, inscription et abonnement (10 novembre 2026)

## Cause de « Service de connexion indisponible »

Le projet Vercel `studio-os` (www.studio-os.digital) n'a **aucune variable
d'environnement**. Sans `OIDC_ISSUER`, `/auth/login` échouait en 503. Il manque
aussi `SESSION_SECRET`, `DATABASE_URL` et toute configuration Stripe.

## Ce que fait le code maintenant

- Sans `OIDC_ISSUER` et avec Supabase configuré, `/connexion` affiche un
  formulaire e-mail + mot de passe (connexion, inscription, mot de passe oublié,
  renvoi de l'e-mail de confirmation). Le navigateur parle à Supabase Auth ;
  le serveur revérifie le jeton auprès de Supabase, exige un e-mail confirmé,
  puis ouvre la session signée habituelle (`/auth/session`).
- Les liens reçus par e-mail arrivent sur `/connexion/confirmation`, qui connecte
  directement la personne (ou lui fait choisir un nouveau mot de passe).
- Tous les anciens liens `/auth/login` redirigent vers `/connexion`.
- Abonnement : bouton « S'abonner · 39 € TTC / mois » dans l'espace du
  propriétaire → Stripe Checkout (mode abonnement). L'accès est activé au retour
  et par le webhook signé `/api/webhooks/billing`, en relisant toujours
  l'abonnement sur Stripe. « Gérer mon abonnement » ouvre le portail client
  Stripe. Une résiliation d'abonnement payé s'arrête à la fin de la période payée.
- Si l'essai a encore plus de 49 h, Stripe démarre le prélèvement à la fin de l'essai.
- Migration `110_plan_subscriptions.sql` (à appliquer sur Supabase).

## Étapes à réaliser (secrets : par le propriétaire)

### 1. Supabase — base

Dans l'éditeur SQL du projet `kaedxrnfrccwsekmbbbv`, appliquer
`database/migrations/110_plan_subscriptions.sql`, puis créer deux rôles de connexion
(remplacer les mots de passe par des valeurs longues aléatoires) :

```sql
CREATE ROLE atacuisine_web LOGIN PASSWORD 'MOT_DE_PASSE_APP' IN ROLE atacuisine_app;
CREATE ROLE atacuisine_billing_web LOGIN PASSWORD 'MOT_DE_PASSE_FACTURATION' IN ROLE atacuisine_addon_billing;
```

Chaînes de connexion (pooler, mode transaction, région du projet) :

```
postgresql://atacuisine_web.kaedxrnfrccwsekmbbbv:MOT_DE_PASSE_APP@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true
postgresql://atacuisine_billing_web.kaedxrnfrccwsekmbbbv:MOT_DE_PASSE_FACTURATION@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true
```

### 2. Supabase — Authentication

- Sign In / Providers : Email activé, « Confirm email » activé.
- URL Configuration : Site URL `https://www.studio-os.digital` ;
  Redirect URLs : `https://www.studio-os.digital/connexion/confirmation`.
- **SMTP personnalisé obligatoire** (ex. Resend) : l'expéditeur par défaut de
  Supabase n'envoie qu'aux membres de l'équipe Supabase, donc les nouveaux
  clients ne recevraient jamais l'e-mail de confirmation.

### 3. Stripe (compte SaaS acct_1UYPwHApai8VVkXi, mode live)

- Prix : le prix mensuel 39 € du produit `prod_VZZaLSq8yVya1u` → `STUDIO_PLAN_PRICE_ID`.
- Webhook : `https://www.studio-os.digital/api/webhooks/billing`, événements
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `customer.subscription.paused`, `customer.subscription.resumed`,
  `invoice.paid`, `invoice.payment_failed` → `STUDIO_PLAN_STRIPE_WEBHOOK_SECRET`.
- Portail client (Settings → Billing → Customer portal) : enregistrer une
  configuration (résiliation en fin de période, moyens de paiement, factures).
- Clé secrète restreinte recommandée (Checkout Sessions, Customers, Subscriptions,
  Prices en lecture, Billing portal) → `STUDIO_PLAN_STRIPE_SECRET_KEY`.

### 4. Vercel — variables de Production du projet `studio-os`

| Variable | Valeur |
| --- | --- |
| `APP_URL` | `https://www.studio-os.digital` |
| `SESSION_SECRET` | 48+ caractères aléatoires (`openssl rand -base64 48`) |
| `DATABASE_URL` | chaîne `atacuisine_web` ci-dessus |
| `SUPABASE_URL` | `https://kaedxrnfrccwsekmbbbv.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | clé publiable du projet (Settings → API Keys) |
| `STUDIO_PLAN_STRIPE_SECRET_KEY` | clé live Stripe |
| `STUDIO_PLAN_STRIPE_WEBHOOK_SECRET` | `whsec_…` du webhook |
| `STUDIO_PLAN_PRICE_ID` | `price_…` 39 €/mois |
| `STUDIO_BILLING_DATABASE_URL` | chaîne `atacuisine_billing_web` ci-dessus |

Puis redéployer la production.

## Vérification avant ouverture

Inscription avec une vraie adresse → e-mail reçu → lien → espace ouvert ;
déconnexion/reconnexion ; mot de passe oublié ; création de l'espace (essai) ;
abonnement par carte → « Abonnement mensuel actif » ; portail → résiliation →
« Renouvellement arrêté » ; rembourser le paiement de test réel depuis Stripe.

## Non traité ici

Premier mois offert du parrainage et places d'établissements supplémentaires :
non facturés automatiquement (toujours gérés par l'opérateur). Add-ons : toujours
limités au mode test.
