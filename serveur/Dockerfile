# Image du serveur.
#
# ATTENTION AU CONTEXTE DE BUILD : c'est la RACINE du dépôt, pas `serveur/`.
# Le serveur importe `src/lib/validation.ts`, `src/lib/traductions.ts`,
# `src/lib/calendrier.ts` et `src/lib/donnees.ts` — des modules partagés avec
# l'application, délibérément pas réécrits, parce qu'une seconde implémentation des
# règles de validation aurait divergé au premier ajustement. Ils sont hors de
# `serveur/`, donc hors de portée d'un contexte réduit à ce dossier.
#
#   docker build -f serveur/Dockerfile -t bus-api .

# — Construction ————————————————————————————————————————————————————
FROM node:22-alpine AS construction
WORKDIR /chantier

# Les dépendances d'abord, pour que le cache de couches survive à une modification
# du code — ce qui est le cas courant.
COPY serveur/package.json serveur/package-lock.json* ./serveur/
RUN cd serveur && npm ci

# Puis les sources : celles du serveur, et les modules partagés qu'il importe.
COPY serveur/ ./serveur/
COPY src/ ./src/
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./

RUN cd serveur && npm run build

# — Exécution ————————————————————————————————————————————————————————
FROM node:22-alpine AS execution
WORKDIR /app
ENV NODE_ENV=production

# `postgres` est laissé hors du paquet (voir `construire.mjs`) : il faut donc ses
# fichiers dans l'image d'exécution, mais rien d'autre.
COPY serveur/package.json serveur/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=construction /chantier/serveur/dist ./dist

# Les outils d'exploitation qui tournent CONTRE LA BASE, pour qu'ils soient à portée d'un
# `docker exec` sur le conteneur — sans quoi amorcer le premier compte ou reprendre les
# abonnés exigerait de copier le script à la main (ce qui fut le cas au premier
# déploiement). Ils sont autonomes : leurs seules dépendances (`postgres`, `@node-rs/argon2`)
# sont déjà dans `node_modules`. `exporter-kv.mjs` n'y est PAS : il appelle `wrangler` et
# se lance depuis un poste connecté à Cloudflare, pas depuis l'image.
COPY serveur/creer-utilisateur.mjs serveur/importer-kv.mjs ./

# Utilisateur non root. L'image `node` en fournit un, inutile d'en créer un autre.
USER node

EXPOSE 3000

# La sonde interroge le vrai contrat du serveur. `/sante` répond même quand la base
# manque — c'est voulu : un conteneur qui redémarre en boucle ne dit pas ce qui lui
# manque, alors qu'une réponse `"base": false` le dit.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT??3000)+(process.env.BASE_API??'/api')+'/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/serveur.js"]
