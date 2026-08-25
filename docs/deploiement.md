# Déployer le serveur sur la VPS (Dokploy)

Ce document décrit **la mécanique Dokploy** : comment l'image arrive sur la VPS, quel
fichier Dokploy monte, et comment le domaine route vers le conteneur. Il complète
[ADMIN.md](../ADMIN.md), qui décrit ce qui se prépare *en dehors* de Dokploy — les clés
VAPID, l'application OAuth, la liste des variables du service et la reprise de l'ancien
état clé-valeur. Les deux se lisent ensemble ; celui-ci ne répète pas la table des
variables.

> **Le lot 22 puis le lot 23.** Le lot 22 a fait *répondre* le serveur sur
> `app.schoulbus.lu/api`, le site restant sur GitHub Pages. Le **lot 23** est la bascule
> d'origine : le site lui-même vit désormais sous la RACINE d'`app.schoulbus.lu`, à la
> même origine que l'API, servi par un conteneur `bus-site` (Caddy). Le CORS n'a plus
> d'objet et la CSP se resserre. Le déploiement GitHub Pages reste vivant en parallèle,
> comme filet de repli, jusqu'à ce que le DNS bascule et que le nouveau site soit
> vérifié.

## La chaîne, en une phrase

Un push sur `main` → la CI teste (l'application ET le serveur, ce dernier contre un vrai
PostgreSQL) → si c'est vert, elle **construit deux images et les pousse sur GHCR** →
Dokploy les tire et les fait tourner derrière Traefik. Ce qui sert les parents est donc,
à l'octet près, ce que les tests ont validé — jamais une seconde construction faite sur
une machine où personne ne regarde.

- Travaux de construction dans [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) :
  `image-serveur` (dépend des tests `serveur`) et `image-site` (dépend des tests
  `controle`). Une image ne part jamais sans que ses tests soient passés.
- Images publiées : `ghcr.io/sashimee/bus-api` (le serveur) et `ghcr.io/sashimee/bus-site`
  (le site), chacune étiquetée `latest` et `sha-<commit>`.
- Fichier monté par Dokploy : [`compose.deploiement.yaml`](../compose.deploiement.yaml)
  — qui **tire** les images (`image:`) et ne les construit pas (`build:`), à la
  différence du `compose.yaml` local, réservé au développement et aux tests.

### Le routage : une origine, deux conteneurs

Traefik répartit `app.schoulbus.lu` par priorité, sans ambiguïté :

- `Host(app.schoulbus.lu) && PathPrefix(/api)` → `bus-api` (priorité 100) ;
- `Host(app.schoulbus.lu)` → `bus-site` (priorité 1), tout ce que `/api` ne capte pas.

Le site (`bus-site`) est **purement statique** : il ne touche ni la base ni aucun
secret, et ne tient que sur le réseau de Traefik. L'origine et le chemin de base y sont
figés au moment du build (Vite les inline dans le JavaScript) — c'est pourquoi
`Dockerfile.site` reçoit `BASE_PATH=/` et `VITE_URL_API=https://app.schoulbus.lu/api` en
`ARG`, et non en variables d'exécution : les poser dans le compose n'aurait aucun effet.

## Mise en place, une fois

1. **DNS.** Un enregistrement `A` (et `AAAA` s'il y a de l'IPv6) `app.schoulbus.lu` vers
   l'adresse de la VPS. Traefik obtient le certificat TLS tout seul au premier accès
   (`certresolver=letsencrypt` dans le compose) — il faut donc que le DNS résolve
   *avant* le premier déploiement, sinon l'émission du certificat échoue.

2. **L'image doit être lisible par la VPS.** Deux cas :
   - **Paquet GHCR public** — rien à faire, Dokploy tire sans authentification.
   - **Paquet privé** (le défaut d'un paquet neuf) — ajouter dans Dokploy un identifiant
     de registre : `ghcr.io`, un compte GitHub, et un jeton personnel avec le seul droit
     `read:packages`. Sans cela, le déploiement échoue sur un `denied` opaque.

3. **La base de données.** Le compose déclare un service `bus-postgres` avec un volume
   `postgres` persistant, **jamais exposé hors du réseau interne** (aucun `ports:`).
   Poser `POSTGRES_PASSWORD` (voir plus bas). Le schéma s'applique tout seul : le serveur
   joue ses migrations au démarrage, avant d'écouter.

4. **Créer l'application Compose dans Dokploy.** Type *Docker Compose*, source = ce
   dépôt, fichier `compose.deploiement.yaml`. Renseigner les variables d'environnement
   dans l'interface Dokploy — c'est là qu'elles vivent, **pas dans un `.env` du dépôt** :
   aucun secret n'entre dans le dépôt. La liste complète et le rôle de chacune sont dans
   [ADMIN.md § « Les variables du service `bus-api` »](../ADMIN.md). Le compose refuse de
   monter si une variable requise manque (`${… :?}`) — c'est voulu : mieux vaut un refus
   net qu'un serveur à demi configuré qui répond des erreurs illisibles.

   | Variable propre au déploiement | Valeur |
   | --- | --- |
   | `POSTGRES_PASSWORD` | un mot de passe fort, connu de Dokploy seul |
   | `IMAGE_SERVEUR` | facultatif ; épingle un condensat précis (`ghcr.io/sashimee/bus-api@sha256:…`) au lieu de `:latest`, pour qu'un redéploiement rejoue exactement la même image |

5. **Déployer, puis contrôler.**

   ```bash
   curl https://app.schoulbus.lu/api/sante
   ```

   `"base"`, `"push"` et `"comptes"` au vert (il n'y a plus de champ `"depot"` ni
   `"commune"` depuis le lot 25). Le détail de ce que chaque champ prouve est dans ADMIN.md.

6. **Reprendre les abonnés de l'ancien serveur.** L'étape la plus facile à oublier, et
   la plus lourde de conséquences : sans elle, tous les parents sont désabonnés en
   silence. La procédure (`exporter-kv.mjs` → `importer-kv.mjs`) reprend les abonnements
   et les états de rappel ; les anciens **codes d'agents ne sont plus repris** (les
   espaces à code personnel ont été retirés — recréer chaque agent en compte à capacités,
   voir ADMIN.md). Son seul vrai contrôle est qu'un **envoi d'essai atteigne un abonné
   repris**. Voir [ADMIN.md § « Reprendre l'état de l'ancien serveur »](../ADMIN.md).
   La base de production n'ayant pas de port exposé, l'import se lance depuis un conteneur
   *sur le réseau interne* (un terminal Dokploy sur le service, ou un conteneur jetable
   attaché au réseau `interne`), avec `DATABASE_URL` pointant sur `bus-postgres:5432`.

## Ce qui reste à éprouver sur le vrai serveur

Le paquet, l'image et le compose sont vérifiés en local (`docker build`, la pile montée,
`/api/sante` au vert, la sonde de l'image qui passe). Restent trois choses qu'aucun banc
local ne peut prouver, et qui se lèvent au premier déploiement réel :

- **R39 — la reprise clé-valeur → PostgreSQL.** N'a tourné que contre une base vide.
  Après l'import, vérifier qu'un **envoi d'essai atteint un abonné repris** (les codes
  d'agents, eux, ne sont plus repris — voir ci-dessus).
- **R40 — l'adresse du client derrière Traefik.** Le serveur lit `X-Forwarded-For` en
  partant de la fin, sur `NB_PROXYS_FIABLES` rangs (défaut 1). À vérifier par **deux
  connexions échouées depuis deux réseaux différents** (domicile et 4G) : la seconde ne
  doit pas hériter du compteur de la première. Si elle en hérite, la limitation de débit
  est devenue un seul seau global — cinq tentatives pour la planète — et il faut revoir
  `NB_PROXYS_FIABLES`.
- **R41 — la concurrence d'envoi sous charge.** Les notifications partent en boucle à
  vingt envois simultanés. Regarder le journal du conteneur au premier envoi réel de
  plus de cinquante abonnés : ce qui compte n'est pas la durée mais le nombre d'échecs.
  Un service de push qui répond `429` dit que la concurrence est trop haute.

## Second déploiement — la branche `dev` (lot 29)

`dev.schoulbus.lu` est une pile **entièrement séparée** sur la même VPS, derrière le même
Traefik : sa propre base, ses propres secrets, ses propres images. Rien n'est partagé avec
la production, pas même la paire VAPID.

### Un fichier, deux piles

`compose.deploiement.yaml` sert les deux. Trois variables les distinguent, et **leurs
défauts sont ceux de la production** — sans elles, le fichier produit exactement les
étiquettes d'avant le lot 29 :

| Variable | Production | `dev` |
| --- | --- | --- |
| `SUFFIXE` | *(vide)* | `-dev` |
| `DOMAINE` | `app.schoulbus.lu` | `dev.schoulbus.lu` |
| `PROJET` | `bus-beckerich` | `bus-beckerich-dev` |

`SUFFIXE` est le piège de l'affaire : il suffixe le **nom des routeurs et services
Traefik**, qui sont globaux à l'instance. Deux piles qui déclarent toutes deux
`traefik.http.routers.bus-api` se marchent dessus, et la seconde est ignorée **sans le
dire** — on cherche alors la panne dans le certificat, où elle n'est pas.

### Les images

La CI construit et pousse `ghcr.io/sashimee/bus-{api,site}:dev` sur un push de la branche.
L'étiquette `latest` est **réservée à la branche par défaut** : un push sur `dev` ne peut
pas mettre son image en production. Voir `.github/workflows/deploy.yml`, travail
« Identité de la pile visée » — c'est là que l'origine du site est choisie, et elle est
**inlinée par Vite dans le bundle** : une image de dev bâtie sur les valeurs de production
appellerait la base de production, et rien ne le laisserait voir.

### Mise en place

1. **DNS.** `dev.schoulbus.lu` → l'adresse de la VPS, en `A` (et `AAAA` s'il y a de
   l'IPv6). **Doit résoudre avant le premier déploiement**, sinon Let's Encrypt échoue.
2. **Une paire VAPID neuve** : `node scripts/generer-vapid.mjs`. La moitié privée va dans
   `VAPID_JWK` côté Dokploy, la moitié **publique** dans la variable de dépôt
   `CLE_VAPID_DEV` — d'où elle entre dans l'image. Si les deux ne concordent pas,
   l'abonnement est accepté et rien n'arrive (réserve R49).
3. **Un second service Compose dans Dokploy**, projet Schoulbus, nommé `bus-app-dev`,
   fichier `compose.deploiement.yaml`, avec les variables ci-dessous.

| Variable | Valeur pour `dev` |
| --- | --- |
| `SUFFIXE` | `-dev` |
| `DOMAINE` | `dev.schoulbus.lu` |
| `PROJET` | `bus-beckerich-dev` |
| `IMAGE_SERVEUR` | `ghcr.io/sashimee/bus-api:dev` |
| `IMAGE_SITE` | `ghcr.io/sashimee/bus-site:dev` |
| `POSTGRES_PASSWORD` | **neuf**, distinct de la production |
| `SECRET_SESSION` | **neuf** |
| `VAPID_JWK`, `CONTACT_VAPID` | la paire neuve de l'étape 2 |
| `ORIGINES_AUTORISEES` | `https://dev.schoulbus.lu` |
| `URL_API_PUBLIQUE` | `https://dev.schoulbus.lu/api` |
| `URL_SITE` | `https://dev.schoulbus.lu` |
| `NB_PROXYS_FIABLES` | `1` |
| `SMTP_*` | **vides.** La création de compte est alors refusée avec un motif clair plutôt qu'échouée en silence. À poser le jour où l'on veut y éprouver un envoi réel. |

4. **Avant le premier `up`, vérifier les volumes** (réserve R50) : `docker volume ls`. Une
   collision de volume mettrait les données de production dans dev, et cela ne se verrait
   pas tout de suite.
5. **Contrôler, puis amorcer un compte :**

   ```bash
   curl https://dev.schoulbus.lu/api/sante        # base/push/comptes au vert, compteurs à zéro
   sudo docker exec <conteneur bus-api de dev> \
     node creer-utilisateur.mjs "…@…" "Nom" \
     "comptes,perturbations,arrets,horaires,traductions,credits"
   ```

> **Cette machine est l'hôte de production.** Toute commande `docker compose` lancée à la
> main doit porter le `-p` de la pile visée. Sans lui, `name:` du fichier décide — et il
> vaut `bus-beckerich`, qui est aussi le nom de la pile de développement locale
> (`compose.yaml`, port 5433). Trois piles, un seul nom par défaut : le `-p` n'est pas
> facultatif.

## Relancer un déploiement

Un push sur `main` reconstruit tout. Pour ne redéployer que le serveur sans changer
l'image — après un simple changement de variable — le bouton de redéploiement de Dokploy
suffit. Pour forcer une nouvelle image sans nouveau commit : `Actions → Déploiement →
Run workflow`, puis redéployer côté Dokploy pour qu'il tire le `latest` fraîchement
poussé.

## Déploiement réel — 2026-08-24

Premier déploiement en production, sur le vrai Dokploy (`dok.seil.pro`, projet
**Schoulbus**, service Compose `bus-app`). **En service** sur `https://app.schoulbus.lu` :
site à la racine, API sous `/api`, PostgreSQL interne, Traefik + certificat automatique.
`/api/sante` répond `base/push/comptes/courriel/rappels` au vert.

Choix de ce premier jet, à connaître :

- **Images construites sur la VPS**, pas tirées de GHCR (la CI n'avait pas encore publié).
  Un redéploiement qui retire les images locales échouerait tant que GHCR n'est pas
  peuplé : pousser sur `main` pour que la CI publie, ou reconstruire sur place.
- **Départ à neuf** : aucune reprise des données de l'ancien Worker Cloudflare (réserve
  R39 non levée, assumé). Pas d'abonnés ni de codes d'agents repris ; l'ancien Worker
  tourne toujours, intact.
- **Connexion GitHub et Google Agenda éteintes** (`oauth:false`, `google:false`) : aucun
  identifiant OAuth posé. `/admin` en dépend et part au lot 25 (7b) de toute façon.
- **SMTP** vers le conteneur `mailrelay`, expéditeur `noreply@schoulbus.lu`.

### À faire pour rendre l'espace agents utilisable

Le premier administrateur s'amorce par la CLI, qui n'est pas dans l'image (seul le paquet
l'est) — on l'y copie le temps de l'exécuter, contre la base déjà branchée dans le
conteneur :

```bash
C=compose-hack-neural-pixel-ai3w3f-bus-api-1
sudo docker cp serveur/creer-utilisateur.mjs "$C:/app/creer-utilisateur.mjs"
sudo docker exec "$C" node creer-utilisateur.mjs "alex.baskewitsch@gmail.com" "Alex" \
  "comptes,perturbations,arrets,horaires,traductions,credits"
sudo docker exec "$C" rm -f /app/creer-utilisateur.mjs
```

Le mot de passe s'affiche une seule fois. Se connecter ensuite sur
`https://app.schoulbus.lu/connexion`.

### Réserves encore ouvertes après ce déploiement

- **R44 — le relai courriel n'a reçu aucun envoi réel.** `courriel:true` dit seulement
  que le SMTP est configuré. À éprouver : créer un compte depuis `/comptes` et vérifier
  que le courriel d'activation arrive (et que `noreply@schoulbus.lu` est bien un
  expéditeur autorisé du relai).
- **R40 — l'adresse client derrière Traefik.** `NB_PROXYS_FIABLES=1` (Traefik seul).
  À éprouver : deux connexions échouées depuis deux réseaux différents ; la seconde ne
  doit pas hériter du compteur de la première.
- **R43 (reste)** — installer la PWA depuis `app.schoulbus.lu` sur un vrai appareil.
