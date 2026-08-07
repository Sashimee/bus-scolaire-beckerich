#!/usr/bin/env bash
#
# Régénère la paire de clés VAPID et la redépose des deux côtés.
#
#   cd worker && ./reparer-vapid.sh
#
# À utiliser quand les notifications ne partent pas parce que la clé publique
# côté GitHub et la clé privée côté Cloudflare ne se correspondent plus — c'est
# arrivé une fois, l'installeur ayant mal découpé la sortie du générateur.
#
# Régénérer invalide les abonnements déjà pris : les appareils concernés doivent
# réactiver les notifications. Sans abonné, l'opération est indolore.

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RACINE"

DEPOT="Sashimee/bus-scolaire-beckerich"

vert() { printf '\033[32m%s\033[0m\n' "$1"; }
alerte() { printf '\033[33m%s\033[0m\n' "$1"; }

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && ! npx wrangler whoami 2>&1 | grep -q 'You are logged in'; then
  alerte "Pas d'authentification Cloudflare. Voir ADMIN.md § 3 : export CLOUDFLARE_API_TOKEN='…'"
  exit 1
fi

VAPID="$(node ../scripts/generer-vapid.mjs --json)"
CLE_PUBLIQUE="$(printf '%s' "$VAPID" | node -e 'let e="";process.stdin.on("data",c=>e+=c).on("end",()=>process.stdout.write(JSON.parse(e).publique))')"
JWK_PRIVE="$(printf '%s' "$VAPID" | node -e 'let e="";process.stdin.on("data",c=>e+=c).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(e).jwk)))')"

if ! printf '%s' "$CLE_PUBLIQUE" | grep -qE '^[A-Za-z0-9_-]{80,90}$'; then
  alerte "La clé publique générée n'a pas la forme attendue. Rien n'a été modifié."
  exit 1
fi
vert "Paire générée (la clé privée n'est pas affichée)."

printf '%s' "$JWK_PRIVE" | npx wrangler secret put VAPID_JWK
vert "Clé privée déposée chez Cloudflare."

gh variable set CLE_VAPID --body "$CLE_PUBLIQUE" --repo "$DEPOT"
vert "Clé publique déclarée sur le dépôt."

# La clé publique n'entre dans le site qu'à la construction : sans ce
# redéploiement, le navigateur continuerait d'utiliser l'ancienne.
gh workflow run deploy.yml --repo "$DEPOT"
vert "Déploiement relancé — le bouton « Activer les notifications » utilisera la nouvelle clé."
echo
alerte "Les appareils déjà abonnés doivent réactiver les notifications."
