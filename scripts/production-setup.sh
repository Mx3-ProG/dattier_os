#!/usr/bin/env bash
# Mise en service de la connexion/inscription sur www.studio-os.digital.
# Configure les variables de Production Vercel puis déploie le code actuel.
# Les valeurs secrètes sont tapées ici, jamais affichées ni enregistrées ailleurs.
set -euo pipefail
cd "$(dirname "$0")/.."

add() { # nom valeur
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
  echo "  ✔ $1"
}

echo "1/3 Variables publiques"
add APP_URL "https://www.studio-os.digital"
add SUPABASE_URL "https://kaedxrnfrccwsekmbbbv.supabase.co"
add SESSION_SECRET "$(openssl rand -base64 48 | tr -d '\n')"

echo
echo "2/3 Valeurs Supabase (Dashboard du projet Studio-OS-Monolithe)"
read -r -p "Clé publiable (Settings → API Keys, commence par sb_publishable_ ou eyJ) : " KEY
[[ -n "$KEY" ]] || { echo "Clé manquante."; exit 1; }
add SUPABASE_PUBLISHABLE_KEY "$KEY"
echo "Chaîne de connexion du rôle atacuisine_web (voir SQL dans docs/platform/PRODUCTION-CONNEXION-ET-ABONNEMENT.md)"
echo "Forme : postgresql://atacuisine_web.kaedxrnfrccwsekmbbbv:MDP@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true"
read -r -s -p "DATABASE_URL : " DB; echo
[[ "$DB" == postgresql://* ]] || { echo "Chaîne invalide."; exit 1; }
[[ "$DB" != *"//postgres."* && "$DB" != *"//postgres:"* ]] || { echo "N'utilisez pas le rôle postgres : l'application le refuse."; exit 1; }
add DATABASE_URL "$DB"

echo
echo "3/3 Déploiement en production du code actuel"
read -r -p "Déployer maintenant sur www.studio-os.digital ? [o/N] " GO
if [[ "$GO" == [oOyY] ]]; then
  vercel deploy --prod
  echo
  echo "Test : https://www.studio-os.digital/connexion?mode=register"
else
  echo "Déploiement non lancé. Plus tard : vercel deploy --prod"
fi
