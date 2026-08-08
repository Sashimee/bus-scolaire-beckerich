#!/usr/bin/env bash
#
# Crée un code d'accès pour un agent communal.
#
# Le code est engendré ici, affiché UNE SEULE FOIS, et seul son empreinte SHA-256 part
# dans le KV du Worker. Personne — pas même le mainteneur — ne peut le retrouver
# ensuite : en cas de perte, on en crée un nouveau et on retire l'ancien.
#
#   ./creer-agent.sh "Marie Weber" "service technique"
#
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage : $0 \"Nom Prénom\" [\"service\"]" >&2
  exit 1
fi

nom="$1"
service="${2:-}"

# Format xxxx-xxxx en base 32 sans caractères ambigus : ni 0/O, ni 1/l/I. Un code se
# dicte au téléphone, et « zéro ou O ? » est exactement la question qu'on veut éviter.
alphabet="23456789abcdefghjkmnpqrstuvwxyz"
tirer() {
  local n="$1" out=""
  for _ in $(seq "$n"); do
    local i=$((RANDOM % ${#alphabet}))
    out+="${alphabet:i:1}"
  done
  printf '%s' "$out"
}

code="$(tirer 4)-$(tirer 4)"

# L'empreinte doit être calculée sur la forme normalisée, celle que le Worker
# recompose à la connexion : minuscules, sans espaces autour.
empreinte="$(printf '%s' "$code" | shasum -a 256 | cut -d' ' -f1)"

valeur="$(printf '{"nom":%s,"service":%s,"cree":%s}' \
  "$(printf '%s' "$nom" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
  "$(printf '%s' "$service" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
  "$(date +%Y-%m-%d | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')")"

npx wrangler kv key put --binding ABONNEMENTS --remote "agent:${empreinte}" "$valeur"

cat <<MESSAGE

  Agent créé : ${nom}${service:+ (${service})}

      Code d'accès :  ${code}

  Transmettez-le de vive voix ou par un canal séparé, jamais par le même courriel
  que le lien. Il ne sera plus jamais affiché.

  Pour retirer cet accès :
      npx wrangler kv key delete --binding ABONNEMENTS --remote "agent:${empreinte}"

MESSAGE
