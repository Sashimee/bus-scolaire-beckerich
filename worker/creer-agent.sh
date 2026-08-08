#!/usr/bin/env bash
#
# Crée un code d'accès, pour l'espace commune ou pour l'espace traduction.
#
# Le code est engendré ici, affiché UNE SEULE FOIS, et seul son empreinte SHA-256 part
# dans le KV du Worker. Personne — pas même le mainteneur — ne peut le retrouver
# ensuite : en cas de perte, on en crée un nouveau et on retire l'ancien.
#
#   ./creer-agent.sh "Marie Weber" "service technique"
#   ./creer-agent.sh "Jean Muller" "bénévole" traductions
#
# Le rôle choisit le préfixe KV, et c'est ce qui sépare vraiment les deux espaces : un
# code de traduction n'existe pas sous « agent: », donc la connexion à l'espace commune
# ne peut pas le trouver, et réciproquement.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage : $0 \"Nom Prénom\" [\"service\"] [commune|traductions]" >&2
  exit 1
fi

nom="$1"
service="${2:-}"
role="${3:-commune}"

case "$role" in
  commune) prefixe="agent" ;;
  traductions) prefixe="traducteur" ;;
  *) echo "Rôle inconnu : $role (attendu : commune ou traductions)" >&2; exit 1 ;;
esac

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

npx wrangler kv key put --binding ABONNEMENTS --remote "${prefixe}:${empreinte}" "$valeur"

cat <<MESSAGE

  Accès créé : ${nom}${service:+ (${service})} — espace ${role}

      Code d'accès :  ${code}

  Transmettez-le de vive voix ou par un canal séparé, jamais par le même courriel
  que le lien. Il ne sera plus jamais affiché.

  Pour retirer cet accès :
      npx wrangler kv key delete --binding ABONNEMENTS --remote "${prefixe}:${empreinte}"

MESSAGE
