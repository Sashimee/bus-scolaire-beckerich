#!/usr/bin/env bash
#
# Installation guidée du Worker Cloudflare : OAuth GitHub et notifications push.
#
#   cd worker && ./installer.sh
#
# Le script s'arrête à chaque étape qui demande une décision ou un identifiant.
# Rien n'est écrit dans le dépôt : l'identifiant de compte et les secrets restent
# dans ton environnement et chez Cloudflare.

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RACINE"

vert() { printf '\033[32m%s\033[0m\n' "$1"; }
gras() { printf '\033[1m%s\033[0m\n' "$1"; }
alerte() { printf '\033[33m%s\033[0m\n' "$1"; }

gras "── 1. Identifiant de compte Cloudflare ─────────────────────────────"
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  read -rp "Account ID : " CLOUDFLARE_ACCOUNT_ID
  export CLOUDFLARE_ACCOUNT_ID
fi
read -rp "Sous-domaine workers.dev [alex-baskewitsch] : " SOUS_DOMAINE
SOUS_DOMAINE="${SOUS_DOMAINE:-alex-baskewitsch}"
URL_WORKER="https://bus-beckerich.${SOUS_DOMAINE}.workers.dev"
vert "Le Worker sera joignable sur : $URL_WORKER"

# Cette URL est compilée dans le JavaScript servi à tous les parents : elle sera
# donc publique et indexable. Un sous-domaine qui contient un nom de personne
# réintroduit exactement ce qu'on a retiré du dépôt.
if printf '%s' "$SOUS_DOMAINE" | grep -qiE 'baskewitsch|alex'; then
  alerte "Attention : ce sous-domaine contient ton nom, et cette URL apparaîtra"
  alerte "en clair dans le code public du site."
  alerte "Tu peux le changer dans Cloudflare (Workers & Pages → Subdomain) pour"
  alerte "quelque chose de neutre, par exemple « bus-beckerich »."
  read -rp "Continuer quand même ? [o/N] " REPONSE
  case "$REPONSE" in [oO]*) ;; *) echo "Interrompu."; exit 0 ;; esac
fi
echo

gras "── 2. Dépendances et connexion ─────────────────────────────────────"
[ -d node_modules ] || npm install
if ! npx wrangler whoami >/dev/null 2>&1; then
  alerte "Connexion à Cloudflare nécessaire — une page va s'ouvrir."
  npx wrangler login
fi
npx wrangler whoami | tail -3
echo

gras "── 3. Espace de stockage des abonnements ───────────────────────────"
if grep -q 'à-remplacer-après-création' wrangler.toml; then
  SORTIE="$(npx wrangler kv namespace create ABONNEMENTS 2>&1)"
  echo "$SORTIE"
  ID_KV="$(printf '%s' "$SORTIE" | grep -oE '[0-9a-f]{32}' | head -1)"
  if [ -z "$ID_KV" ]; then
    alerte "Identifiant KV introuvable dans la réponse. Reporte-le à la main dans wrangler.toml puis relance."
    exit 1
  fi
  # BSD sed (macOS) exige un suffixe après -i.
  sed -i '' "s/à-remplacer-après-création/$ID_KV/" wrangler.toml
  vert "Espace KV créé et déclaré : $ID_KV"
else
  vert "Espace KV déjà déclaré dans wrangler.toml."
fi
echo

gras "── 4. Clés VAPID ───────────────────────────────────────────────────"
# Les clés ne transitent pas par l'affichage : la privée part directement dans le
# secret Cloudflare, la publique dans une variable de dépôt GitHub.
VAPID="$(node ../scripts/generer-vapid.mjs)"
CLE_PUBLIQUE="$(printf '%s' "$VAPID" | grep -A1 'VITE_CLE_VAPID' | tail -1 | tr -d ' ')"
JWK_PRIVE="$(printf '%s' "$VAPID" | grep '^{' | head -1)"
if [ -z "$CLE_PUBLIQUE" ] || [ -z "$JWK_PRIVE" ]; then
  alerte "Génération des clés incomplète. Lance « node ../scripts/generer-vapid.mjs » à la main."
  exit 1
fi
vert "Paire de clés générée (la clé privée n'est pas affichée)."
echo

gras "── 5. Application OAuth GitHub ─────────────────────────────────────"
echo "Crée une OAuth App sur https://github.com/settings/developers avec :"
echo "  Homepage URL             : https://sashimee.github.io/bus-scolaire-beckerich/"
echo "  Authorization callback   : ${URL_WORKER}/auth/callback"
echo
read -rp "Client ID : " GH_CLIENT_ID
read -rsp "Client secret (masqué) : " GH_CLIENT_SECRET; echo
echo

gras "── 6. Dépôt des secrets ────────────────────────────────────────────"
SECRET_NOTIF="$(openssl rand -hex 32)"
printf '%s' "$GH_CLIENT_ID"     | npx wrangler secret put GITHUB_CLIENT_ID
printf '%s' "$GH_CLIENT_SECRET" | npx wrangler secret put GITHUB_CLIENT_SECRET
printf '%s' "$JWK_PRIVE"        | npx wrangler secret put VAPID_JWK
printf '%s' "$SECRET_NOTIF"     | npx wrangler secret put SECRET_NOTIFICATION
vert "Quatre secrets déposés."
echo

gras "── 7. Déploiement ──────────────────────────────────────────────────"
npx wrangler deploy
echo

gras "── 8. Déclaration côté GitHub ──────────────────────────────────────"
gh variable set URL_WORKER --body "$URL_WORKER" --repo Sashimee/bus-scolaire-beckerich
gh variable set CLE_VAPID  --body "$CLE_PUBLIQUE" --repo Sashimee/bus-scolaire-beckerich
printf '%s' "$SECRET_NOTIF" | gh secret set SECRET_NOTIFICATION --repo Sashimee/bus-scolaire-beckerich
vert "Variables et secret enregistrés sur le dépôt."
echo

gras "── 9. Vérification ─────────────────────────────────────────────────"
SANTE="$(curl -s --max-time 20 "${URL_WORKER}/sante" || true)"
echo "$SANTE"
if printf '%s' "$SANTE" | grep -q '"oauth":true' && printf '%s' "$SANTE" | grep -q '"push":true'; then
  vert "Worker opérationnel."
else
  alerte "Le Worker répond mal : un secret manque probablement. Voir ADMIN.md § 3c."
  exit 1
fi
echo

gras "── 10. Reconstruction du site ──────────────────────────────────────"
gh workflow run deploy.yml --repo Sashimee/bus-scolaire-beckerich
vert "Déploiement relancé : le bouton « Activer les notifications » apparaîtra dans les réglages."
echo
alerte "Dernière étape, à faire à la main : active les notifications sur un téléphone,"
alerte "publie une perturbation de test, vérifie qu'elle arrive, puis retire-la."
