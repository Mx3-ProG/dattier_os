#!/usr/bin/env bash
# Opens online payment on www.studio-os.digital: Studio subscription (card
# required from the trial), every monthly add-on, one-off purchases and credits.
# Asks for one value only: the Stripe live secret key of the STUDIO OS account.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF=kaedxrnfrccwsekmbbbv
SITE=https://www.studio-os.digital
POOLER=aws-1-eu-west-1.pooler.supabase.com
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

add() {
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null 2>&1
  echo "  ✔ $1"
}

echo "▶ 1/6 Clé Stripe du compte STUDIO OS (Développeurs → Clés API → Clé secrète, sk_live_…)"
read -r -s -p "  Clé secrète : " KEY; echo
[[ "$KEY" =~ ^(sk|rk)_(live|test)_ ]] || { echo "✘ Ce n'est pas une clé secrète Stripe."; exit 1; }
ACCOUNT=$(curl -s -u "$KEY:" https://api.stripe.com/v1/account | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id') or 'ERR', '·', (d.get('settings',{}).get('dashboard',{}) or {}).get('display_name') or d.get('business_profile',{}).get('name') or '')")
[[ "$ACCOUNT" != ERR* ]] || { echo "✘ Clé refusée par Stripe."; exit 1; }
echo "  ✔ Compte $ACCOUNT"

echo "▶ 2/6 Catalogue : tarifs trouvés pour l'abonnement et les add-ons"
curl -s -G -u "$KEY:" https://api.stripe.com/v1/prices -d active=true -d type=recurring -d currency=eur -d limit=100 -d "expand[]=data.product" \
 | python3 -c "
import sys,json
want={'Exploitation':3900,'Factures fournisseurs':900,'Présences, heures et absences':900,'Factures clients':900,'Paie':900,'Conflits hors ligne':900,'Connexions':900,'QR codes':900,'Comptes clients gamifiés':900,'Domaine personnalisé':900,'Scanner de prospects':6900,'Pipeline CRM':6900,'Customer Health':8900}
found={}
for p in json.load(sys.stdin).get('data',[]):
  pr=p.get('product') or {}
  n=(pr.get('name') or '').strip()
  if n in want and p.get('unit_amount')==want[n] and (p.get('recurring') or {}).get('interval')=='month' and pr.get('active',True): found[n]=p['id']
for n in want: print('  ✔' if n in found else '  ✘ introuvable :', n, '·', want[n]//100, '€/mois')
"

echo "▶ 3/6 Notifications Stripe → $SITE/api/webhooks/billing"
EVENTS=(checkout.session.completed checkout.session.expired checkout.session.async_payment_succeeded checkout.session.async_payment_failed customer.subscription.created customer.subscription.updated customer.subscription.deleted customer.subscription.paused customer.subscription.resumed invoice.paid invoice.payment_failed charge.refunded charge.dispute.created charge.dispute.updated charge.dispute.closed)
ARGS=(-d "url=$SITE/api/webhooks/billing" -d "description=STUDIO OS facturation")
for e in "${EVENTS[@]}"; do ARGS+=(-d "enabled_events[]=$e"); done
WHSEC=$(curl -s -u "$KEY:" https://api.stripe.com/v1/webhook_endpoints "${ARGS[@]}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secret',''))")
[[ "$WHSEC" == whsec_* ]] || { echo "✘ Création du webhook refusée (utilisez la clé secrète complète, pas une clé restreinte)."; exit 1; }
echo "  ✔ webhook créé"

echo "▶ 4/6 Portail client Stripe (carte, factures, résiliation en fin de période)"
PORTAL=$(curl -s -u "$KEY:" https://api.stripe.com/v1/billing_portal/configurations \
  -d "business_profile[headline]=STUDIO OS — gérer mon abonnement" \
  -d "default_return_url=$SITE/platform" \
  -d "features[payment_method_update][enabled]=true" \
  -d "features[invoice_history][enabled]=true" \
  -d "features[customer_update][enabled]=true" \
  -d "features[customer_update][allowed_updates][]=email" \
  -d "features[customer_update][allowed_updates][]=address" \
  -d "features[subscription_cancel][enabled]=true" \
  -d "features[subscription_cancel][mode]=at_period_end" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
[[ "$PORTAL" == bpc_* ]] && echo "  ✔ portail configuré" || echo "  ⚠ portail non créé : enregistrez-le dans Stripe (Paramètres → Billing → Portail client)."

echo "▶ 5/6 Compte base de données de la facturation + variables Vercel"
P="$(openssl rand -hex 24)"
( cd "$WORK" && supabase init --yes >/dev/null 2>&1 || true
  supabase link --project-ref "$REF" </dev/null >/dev/null
  supabase db query --linked -f "$ROOT/database/migrations/112_trial_card_required.sql" >/dev/null
  supabase db query --linked "DO \$\$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='atacuisine_billing_web') THEN ALTER ROLE atacuisine_billing_web LOGIN PASSWORD '$P'; ELSE CREATE ROLE atacuisine_billing_web LOGIN NOBYPASSRLS PASSWORD '$P'; END IF; END \$\$; GRANT atacuisine_addon_billing TO atacuisine_billing_web;" >/dev/null )
echo "  ✔ migration 112 et rôle de facturation prêts"
OK=""; for i in 1 2 3 4 5 6; do
  PGCONNECT_TIMEOUT=8 psql "postgresql://atacuisine_billing_web.$REF:$P@$POOLER:6543/postgres?sslmode=require" -tAc "select 1" >/dev/null 2>&1 && OK=1 && break; sleep 8
done
[[ -n "$OK" ]] || { echo "✘ Connexion du rôle de facturation impossible."; exit 1; }
cd "$ROOT"
add STUDIO_BILLING_STRIPE_SECRET_KEY "$KEY"
add STUDIO_BILLING_STRIPE_WEBHOOK_SECRET "$WHSEC"
add STUDIO_BILLING_DATABASE_URL "postgresql://atacuisine_billing_web.$REF:$P@$POOLER:6543/postgres?sslmode=require&uselibpqcompat=true"
[[ "$PORTAL" == bpc_* ]] && add STUDIO_STRIPE_PORTAL_CONFIGURATION "$PORTAL"

echo "▶ 6/6 Déploiement en production"
vercel deploy --prod --yes
echo
echo "Paiement en ligne ouvert. Test : créez un établissement sur $SITE/platform"
