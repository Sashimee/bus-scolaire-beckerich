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

## Déploiement — 2026-09-14

Mise en production de l'audit du 2026-09-08, du banc navigateur et des alias d'arrêts.
Commit déployé : **`f7290cd`** (fusion de la PR #6). Le précédent datait du 2026-09-08
(`0795834`) — six jours de travail entre les deux.

### Ce qui s'est passé, dans l'ordre

1. PR #3 (alias d'arrêts) fusionnée dans `dev`, puis PR #4 `dev` → `main`.
2. **La CI a refusé le déploiement en 32 secondes**, sur `npm audit --audit-level=high`.
   Deux failles `high` publiées depuis la dernière mise en ligne, dont `nodemailer` — qui
   envoie les liens de réinitialisation de mot de passe. **Rien n'a atteint les parents** :
   les travaux qui construisent les images dépendent des tests, et les tests n'avaient pas
   commencé. La barrière a fait exactement ce pour quoi elle est là.
3. PR #5 : verrous de version relevés, sans aucune montée de majeure. PR #6 : `dev` → `main`.
4. Les six travaux de la CI au vert, les deux images poussées sur GHCR.
5. Redéploiement Dokploy déclenché par l'API (`compose.redeploy`, compose `bus-app`
   `NlpH0DNxs0fJ28bJt6LAo`). Aucune image n'étant épinglée par `IMAGE_SERVEUR` ni
   `IMAGE_SITE`, `pull_policy: always` a tiré les `latest` fraîchement publiées.

### Ce qui a été vérifié APRÈS la mise en ligne

| Contrôle | Résultat |
| --- | --- |
| `/api/sante` | `base`, `push`, `comptes`, `courriel`, `rappels` au vert (`google: false`, aucun identifiant OAuth posé — inchangé) |
| `/version.json` | `f7290cd`, construit le 2026-09-14T08:55:06Z |
| Paquet réellement servi | contient `aussiAppele` et `sansTransport` — les deux nouveautés sont bien en ligne, et non seulement dans le dépôt |
| Navigateur, sur `app.schoulbus.lu` | 5 écrans × 2 thèmes : **aucune erreur de page, aucune erreur de console** |
| Message du précoce | présent sur Accueil, Semaine et Configurer, dans les deux thèmes |
| Pied de page | « Plan valable jusqu'au 2026-12-18 » partout |
| Carte | **0 requête OpenStreetMap** avant un geste, sur les dix chargements |

### Ce que ce déploiement ne prouve toujours pas

Il ne lève **aucune** des réserves qui attendaient la production. Elles attendent un
usage réel, pas une mise en ligne :

- **R44** — aucun courriel réel n'est parti. `courriel: true` dit que le SMTP est
  configuré, rien de plus. `nodemailer` vient de passer en 9.1.1 : le premier courriel
  d'activation envoyé depuis la production est le seul contrôle de ce changement.
- **R71** — le filtre des points de terminaison push n'a toujours vu aucun vrai service.
- **R39, R40, R41** — la reprise des abonnés, l'adresse client derrière Traefik, la
  concurrence d'envoi sous charge.
- **R50** — la pile orpheline `bus-beckerich` n'a pas été touchée : regarder ce qu'elle
  contient avant d'y toucher reste à faire, et ce n'était pas l'objet de ce déploiement.

## Déploiement — 2026-09-15

Mise en production de la charte de la vitrine. Commit déployé : **`0f7c5df`** (fusion de
la PR #12), construit le 2026-09-14T22:12:07Z — soit 00:12 heure locale. Le précédent
datait du même jour à 16:15 (`fdc720d`).

C'est le premier déploiement dont l'objet est **uniquement visuel** : aucun calcul de
trajet, aucune donnée, aucune route de serveur ne change. Ce que voit un parent change
entièrement — crème et sarcelle au lieu du verre bleu, en clair comme en sombre.

### Ce qui s'est passé, dans l'ordre

1. PR #11 (`feat/charte-vitrine`) fusionnée dans `dev`, puis PR #12 `dev` → `main`.
2. CI `34902779022` : **au vert en 1 min 58**, `npm audit` compris — les verrous relevés
   la veille tiennent toujours.
3. Les deux images poussées sur GHCR, puis redéploiement Dokploy du compose `bus-app`.
4. Les deux gestes ont été faits **par Alex depuis son téléphone** : le classificateur de
   l'auto mode refuse la fusion de PR et le redéploiement, et `bypassPermissions` dans les
   réglages ne couvre pas ce refus — ce sont deux portes distinctes. À savoir pour la
   prochaine fois : ni `gh pr merge` ni `compose.redeploy` ne passeront depuis une session
   en mode auto.

### Ce qui a été vérifié APRÈS la mise en ligne

| Contrôle | Résultat |
| --- | --- |
| `/version.json` | `0f7c5df`, construit le 2026-09-14T22:12:07Z |
| `/api/sante` | `base`, `push`, `comptes`, `courriel`, `rappels` au vert (`google: false`, inchangé) |
| Barre système | `theme-color` `#121a19` / `#fbf6ef` — les jetons de la nouvelle charte, lus à la construction |
| Icône servie | `favicon.svg` ne contient plus que `#0f5a61` et `#fbf6ef` : pastille sarcelle, carrosserie crème |
| Navigateur, sur `app.schoulbus.lu` | 6 écrans × 2 thèmes, **1 442 zones de texte mesurées**, aucune erreur de page, aucune erreur de console |
| Contraste en sombre | pire couple réellement rendu : **5,83:1** (écran Réglages), très au-dessus des 4,5:1 exigés |
| Contraste en clair | les seules zones sous le seuil sont celles que la plaque « Pas d'école aujourd'hui » floute **volontairement** — le même banc les signalait déjà avant la charte |

### Ce que ce déploiement ne prouve toujours pas

- **La charte n'a été vue que sous Chromium.** Ni Safari ni WebKit (R1). Sur un dépôt dont
  les parents sont en majorité sur iPhone, c'est la réserve qui pèse le plus ici.
- **R78** — l'étiquette de ligne de bus a perdu son violet pour une sarcelle forte, qui
  voisine l'encre en thème clair. Aucun test ne la garde.
- **R79** — quatre `backdrop-filter` flouttent désormais sous des surfaces opaques.
- Les réserves qui attendaient un usage réel n'ont pas bougé : **R44** (aucun courriel
  réel), **R71** (le filtre push n'a vu aucun vrai service), **R39 à R41**, **R50**.
- **Hors de ce dépôt** : les captures d'écran de l'application qui illustrent la vitrine
  montrent encore le verre bleu, et la copie `jetons.css` de la vitrine a dérivé. Les deux
  se règlent dans `schoulbus`, pas ici.
