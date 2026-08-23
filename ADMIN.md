# Publier une urgence, et activer les notifications

Deux sujets distincts :

- **publier une perturbation** (bus annulé, retard, arrêt déplacé) — fonctionne
  **dès maintenant**, sans rien installer ;
- **envoyer une notification qui fait vibrer le téléphone** — demande une mise en
  place unique, décrite en bas de page.

---

## 1. Publier une perturbation

### Le plus simple, sans rien configurer

1. Ouvrir **[le fichier des urgences sur GitHub](https://github.com/Sashimee/bus-scolaire-beckerich/edit/main/public/urgences.json)**.
2. Ajouter une entrée dans `perturbations` :

```json
{
  "id": "2026-09-17-abc12",
  "du": "2026-09-17",
  "au": "2026-09-17",
  "type": "annulation",
  "ligne": "aller-2",
  "message": { "fr": "Route barrée à Hovelange, le bus ne passera pas." },
  "publieLe": "2026-09-17T06:40:00.000Z",
  "publiePar": "Commune de Beckerich",
  "gravite": "alerte"
}
```

3. Valider le commit. Le site se met à jour en une à deux minutes.

La perturbation **disparaît d'elle-même** au lendemain de la date `au`. Il n'y a rien
à nettoyer.

### Avec le formulaire

La page **`/admin`** du site propose le même résultat sans écrire de JSON : on choisit
la ligne, la date, le type, on rédige le message, on voit l'aperçu exact que verront
les parents, et on publie.

> **La page `/admin` n'est pas un verrou.** Elle est publique et son code est lisible
> par tous. Ce qui protège réellement la publication, c'est le droit d'écriture sur le
> dépôt GitHub : la page vérifie `permissions.push` avant d'afficher le formulaire, et
> GitHub refuse l'écriture à quiconque n'a pas ce droit.

Pour l'utiliser, il faut se connecter, de l'une des deux façons :

- **« Se connecter avec GitHub »** — nécessite le serveur (§ 3). Le jeton obtenu est
  éphémère et disparaît à la fermeture de l'onglet. C'est la voie recommandée.
- **Coller un jeton d'accès** — solution de secours. Créer un
  [jeton fin](https://github.com/settings/personal-access-tokens/new) limité au seul
  dépôt `bus-scolaire-beckerich`, avec la permission **Contents : Read and write**.
  Il n'est gardé que le temps de l'onglet.

### Champs disponibles

| Champ | Rôle |
| --- | --- |
| `type` | `annulation`, `retard`, `arret-deplace` ou `message` |
| `ligne` | Identifiant de ligne (`aller-1`, `retour-2`…). Omis = toutes les lignes |
| `service` | Course précise (`aller-1-matin`…). Omis = toutes les courses |
| `arret` | Arrêt concerné (`hovelange-kneppchen`…). Omis = tous les arrêts |
| `minutes` | Pour un retard |
| `arretRemplacement` | Pour un arrêt déplacé |
| `gravite` | `info`, `attention` ou `alerte` |

Plus la portée est précise, moins on alarme de parents inutilement. Une perturbation
sans `ligne` ni `arret` s'affiche chez **tout le monde**.

### Donner accès à un agent communal

**C'est la voie normale depuis l'espace commune.** L'agent n'a besoin d'aucun compte
GitHub, ne voit aucun JSON, et ne détient aucun jeton : il se connecte avec un code
personnel sur `/commune`, et c'est le serveur qui publie en son nom.

Prérequis, une seule fois : deux variables d'environnement posées sur le service
`bus-api` dans Dokploy, puis un redéploiement.

| Variable | Contenu |
| --- | --- |
| `SECRET_SESSION` | Une longue chaîne au hasard, à ne pas réutiliser. Sans elle, `/commune` et `/traductions` répondent 503 et le reste du serveur fonctionne normalement. |
| `GITHUB_PAT` | Jeton **fine-grained** (`Settings → Developer settings → Personal access tokens → Fine-grained tokens`), limité à **ce seul dépôt**, avec la permission `Contents: Read and write` et rien d'autre. C'est lui qui écrit ; il ne quitte jamais le serveur. |

`/api/sante` doit ensuite répondre `"commune": true` **et** `"depot": {"urgences":"ok", …}`.
Le premier dit que les secrets sont posés, le second qu'ils fonctionnent : un jeton
révoqué passe le premier contrôle et échoue le second.

Puis, pour chaque agent :

```bash
DATABASE_URL=… node serveur/creer-agent.mjs "Marie Weber" "service technique"
```

Le script engendre un code au format `xxxx-xxxx`, en stocke **l'empreinte SHA-256** en
base et affiche le code **une seule fois**. Il n'est récupérable nulle part ensuite :
en cas de perte, on en crée un autre et on retire l'ancien. Transmettez-le de vive voix
ou par un canal distinct de celui du lien.

Le serveur limite les tentatives à **5 par quart d'heure et par adresse IP**, sans quoi
un code de huit caractères se forcerait en quelques heures. Cette limite est désormais
**stricte** : elle tient dans un seul énoncé atomique de PostgreSQL. Sur l'ancien
stockage clé-valeur, la cohérence différée laissait passer quelques tentatives de plus
(c'était la réserve R4). Chaque publication est inscrite au journal, consultable sur
`/commune` : qui a publié quoi, et quand.

Pour retirer un accès, la commande est affichée à la création. On peut aussi lister les
agents des deux espaces, avec leur date de dernier accès — de quoi repérer un code
oublié :

```bash
DATABASE_URL=… node serveur/creer-agent.mjs --lister
DATABASE_URL=… node serveur/creer-agent.mjs --retirer <empreinte> [commune|traductions]
```

### Donner accès aux traductions (`/traductions`)

Même mécanique, mais un espace à part : le code n'ouvre **que** la correction des textes
de l'application. Un traducteur ne peut ni annuler un bus, ni toucher au plan.

```bash
DATABASE_URL=… node serveur/creer-agent.mjs "Jean Muller" "bénévole" traductions
```

La séparation ne tient pas à une seule ligne de code. Les codes de traduction vivent
dans la table `agent_traduction` et non `agent_commune` — un code de l'un n'existe
littéralement pas là où l'autre le cherche — et le jeton de session porte son rôle,
revérifié à chaque route. **Deux tables et non une colonne `role`** : une table unique
ne laisserait qu'une seule barrière, suspendue à une clause de filtrage qu'un jour
quelqu'un oubliera d'écrire.

Ce que le traducteur peut faire : choisir une langue, corriger n'importe quel texte de
l'application, et publier. Les corrections vont dans `public/traductions.json`, relu à
chaque ouverture — elles sont visibles **sans reconstruction du site**, contrairement au
plan ou aux crédits. Une correction ne peut viser qu'une clé existante, du même type et
avec les mêmes repères `{…}` que le français ; le reste est refusé, côté navigateur comme
côté serveur.

### Donner accès au mainteneur (`/admin`)

La page `/admin` reste réservée au mainteneur, avec les outils avancés, répartis en
cinq onglets : perturbations, position des arrêts sur carte, plan complet en JSON,
textes de l'application, et crédits. Inviter le compte GitHub concerné en **Write** sur
le dépôt (`Settings → Collaborators`) ; la page le reconnaîtra.

L'onglet actif est dans l'adresse (`?onglet=credits`) : un lien envoyé ouvre le bon.

L'onglet **Crédits** modifie `src/data/credits.json`, qui est dans le site : sa
publication déclenche une reconstruction, contrairement aux textes. N'y inscrire que des
noms dont l'accord est acquis — c'est la seule donnée personnelle que ce projet publie,
et la page `/credits` le dit à ses lecteurs.

Préférez cependant un jeton **fine-grained** saisi à la main dans le champ prévu par
`/admin` : la connexion OAuth demande la portée `repo`, très large, que GitHub n'offre
pas plus étroite en OAuth classique.

---

## 2. Ce qui marche déjà, sans configuration

- Le **bandeau d'alerte** en haut de l'application, à chaque ouverture.
- La relecture du fichier au lancement, au retour dans l'onglet, au retour du réseau
  et toutes les dix minutes.
- Les trajets concernés sont **barrés** (annulation) ou affichent la **nouvelle heure**
  (retard) dans la fiche de chaque enfant.

Autrement dit : un parent qui ouvre l'application le matin est prévenu. Ce qui manque
sans l'étape 3, c'est uniquement la notification qui sonne toute seule.

---

## 3. Activer les vraies notifications

**Pourquoi une brique en plus.** Le Web Push exige techniquement un serveur qui émet
la notification et un endroit où conserver les abonnements. Aucune page statique ne
peut le faire seule. Le serveur `bus-api` est ce minimum. Il ne stocke **aucune donnée
personnelle de famille** — ni adresse, ni prénom, ni cycle, seulement des identifiants
d'appareil opaques, supprimés dès le désabonnement.

### Ce que ça coûte réellement

Depuis le passage sur VPS, le coût est celui de la VPS, et rien d'autre : le serveur,
la base et le site tournent dans les mêmes conteneurs que le reste.

**Ce qui a disparu avec Cloudflare, et qui vaut d'être su :** le palier gratuit
n'accordait que **10 ms de processeur par invocation**, alors que le Web Push impose un
chiffrement et une signature *par destinataire*. Une boucle sur tous les abonnés
dépassait ce budget dès quelques dizaines d'inscrits, et l'envoi était interrompu en
silence. Le Worker contournait cela en découpant en lots de dix, chaque lot repartant
en sous-requête avec son propre budget ; au-delà d'environ 450 abonnés il répondait
`507 trop-abonnes` plutôt que de servir une partie des familles.

Tout cela n'existe plus. Il n'y a qu'une boucle, avec vingt envois simultanés au plus
pour ne pas ouvrir mille connexions d'un coup. **Il n'y a plus de plafond d'abonnés**,
plus de `TAILLE_LOT` — dont le code disait lui-même qu'il était « une estimation
prudente, NON MESURÉE » —, plus de `/notifier-lot`, et plus d'erreur `1042`.

### « Sans maintenance » serait exagéré

Ce n'est pas un service qu'on installe et qu'on oublie : les images de base se mettent
à jour, l'application OAuth GitHub et les clés VAPID peuvent devoir être renouvelées, et
PostgreSQL a des versions majeures. Compte une vérification par an, en même temps que la
mise à jour du plan de bus.

**Et désormais, une sauvegarde à surveiller.** L'ancien stockage clé-valeur n'en avait
aucune ; la base en a une, et une sauvegarde qu'on n'a jamais restaurée n'est pas une
sauvegarde. À éprouver sur la préproduction, pas sur la production.

Le chiffrement des notifications, lui, n'a aucune dépendance : il est écrit directement
dans `serveur/src/push.js`, aux normes RFC 8291 et RFC 8292, et verrouillé par le
vecteur de test officiel de l'annexe A dans `serveur/src/push.test.js`. **Ce fichier a
traversé le portage sans qu'une ligne change** — il ne tient que sur WebCrypto, et
c'est la seule brique qu'on ne peut pas déboguer à distance : c'est elle qui parle aux
serveurs d'Apple.

### Mettre le serveur en service

Le déploiement lui-même se fait dans **Dokploy** : c'est là que se posent les variables
d'environnement, que se déclenchent les redéploiements et que se règlent les
sauvegardes. Ce document ne décrit que ce qui se prépare en dehors ; la mécanique
Dokploy elle-même — image GHCR, fichier Compose, DNS et routage — est dans
**[docs/deploiement.md](docs/deploiement.md)**.

**a. Les clés de notification.**

```bash
node scripts/generer-vapid.mjs
```

Il rend deux choses : une clé publique (87 caractères, à poser en variable de dépôt
`CLE_VAPID`) et un JWK privé (à poser en variable `VAPID_JWK` sur `bus-api`). **La clé
privée ne doit jamais être affichée ailleurs ni écrite dans le dépôt.**

La préproduction a ses **propres** clés. Sans quoi une notification d'essai lancée
depuis la préproduction réveille les vrais téléphones des vrais parents.

**b. L'application OAuth GitHub.** `Settings → Developer settings → OAuth Apps`. L'URL
de rappel doit être exactement `https://app.schoulbus.lu/api/auth/callback` — GitHub la
compare caractère par caractère. Reporter l'identifiant et le secret en
`GITHUB_CLIENT_ID` et `GITHUB_CLIENT_SECRET`.

**c. Les variables du service `bus-api`.**

| Variable | Rôle | Sans elle |
| --- | --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL | Le serveur démarre quand même, et `/api/sante` répond `"base": false` — c'est voulu : un conteneur qui redémarre en boucle ne dit pas ce qui lui manque. |
| `ORIGINES_AUTORISEES` | Les origines qui ont le droit d'appeler le serveur, séparées par des virgules. Pendant la transition, **les deux** : `https://sashimee.github.io,https://app.schoulbus.lu` — le site de Pages (repli) comme celui de la VPS doivent pouvoir appeler l'API. Une fois Pages retiré, `https://app.schoulbus.lu` seule suffit. | Aucune origine n'est autorisée. Le serveur le dit au démarrage. |
| `URL_API_PUBLIQUE` | L'origine publique, pour fabriquer le `redirect_uri` d'OAuth | Déduite des en-têtes du proxy — ce qui produit `http://bus-api:3000/…` et un échange refusé sans qu'on comprenne pourquoi. **À poser.** |
| `VAPID_JWK`, `CONTACT_VAPID` | Notifications | `/api/sante` répond `"push": false` avec le motif. |
| `SECRET_SESSION`, `GITHUB_PAT` | Espaces commune et traductions | Ils répondent 503, et le reste fonctionne. |
| `SECRET_NOTIFICATION` | Envoi déclenché depuis GitHub Actions | `/api/notifier` répond 401. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Relais Google Agenda | L'intégration disparaît de l'interface, l'export `.ics` reste. |
| `URL_SITE` | Site publié, relu pour les rappels | Aucun rappel n'est programmé. |
| `NB_PROXYS_FIABLES` | Nombre de relais devant le serveur (défaut : 1) | Voir ci-dessous — **c'est le réglage le plus silencieux de tous**. |

> **`NB_PROXYS_FIABLES` mérite qu'on s'y arrête.** L'adresse du client est lue dans
> `X-Forwarded-For`, en partant de la FIN : le client peut écrire ce qu'il veut dans
> cet en-tête, mais il ne peut pas écrire après le relais. Avec Traefik seul devant,
> la valeur est 1. Si un jour un second relais s'ajoute, il faut la passer à 2 —
> sinon la limitation de débit compte les adresses du relais au lieu de celles des
> visiteurs, et cinq tentatives suffisent à bloquer tout le monde. Rien ne le
> signalerait.

**d. Les variables de dépôt GitHub.** `Settings → Secrets and variables → Actions` :
variables `URL_API` (`https://app.schoulbus.lu/api`), `CLE_VAPID`, `ID_CLIENT_GOOGLE` ;
secret `SECRET_NOTIFICATION`, le même que côté serveur. Ces variables servent aux deux
constructions du site — celle de GitHub Pages (repli) et l'image `bus-site` de la VPS.
`URL_PUBLIQUE` est facultative : sans elle, l'image `bus-site` se déclare sous
`https://app.schoulbus.lu`, ce qui est le cas voulu.

**e. Contrôler.**

```bash
curl https://app.schoulbus.lu/api/sante
```

`"base"`, `"push"`, `"commune"` et `"depot"` doivent tous être au vert. `"commune": true`
dit que les secrets sont posés ; `"depot": {"urgences":"ok"}` dit qu'ils fonctionnent.
Un jeton révoqué passe le premier et échoue le second — c'est exactement pour cela que
les deux sont là.

### Reprendre l'état de l'ancien serveur

À faire **une seule fois**, au moment de la bascule. Sans cette étape, tous les codes
d'agents sont invalidés et tous les parents désabonnés, sans que rien ne le signale.

```bash
node serveur/exporter-kv.mjs > /tmp/kv.json          # depuis un poste connecté à Cloudflare
DATABASE_URL=… node serveur/importer-kv.mjs /tmp/kv.json
```

L'import est idempotent : le relancer ne crée pas de doublon. Les états OAuth, les
verrous d'essai et les compteurs de tentatives ne sont **pas** repris — ils auront
expiré avant la fin de la bascule.

Le seul contrôle qui prouve quelque chose est de **se connecter à `/commune` avec un
vrai code d'agent**. Compter les lignes ne suffit pas.

### Si les notifications ne partent pas

**Commence par lire ce que le serveur a répondu** — ne régénère surtout pas les clés
d'emblée. Le workflow « Notifier les perturbations » journalise la réponse complète :

```bash
gh run list --workflow=notifier.yml --limit 1
gh run view <identifiant> --log | grep 'a répondu'
```

La réponse dit exactement ce qui s'est passé :

| Réponse | Interprétation |
| --- | --- |
| `envoyees` > 0 | Les notifications sont parties. Si le téléphone ne sonne pas, le problème est côté appareil (autorisation refusée, mode concentration). |
| `total: 0` | Aucun abonné enregistré. Il faut activer les notifications depuis le site, sur l'appareil. |
| `echecs` > 0 | Le service de push a refusé l'envoi. **Le champ `details` donne le service, le code HTTP et le motif exact** — c'est lui qu'il faut lire. |
| `401 non-autorise` | `SECRET_NOTIFICATION` diffère entre le secret du dépôt et la variable du serveur. |

Pour suivre un envoi en direct : `sudo docker logs -f <conteneur bus-api>` (ou le
journal du service dans Dokploy), puis publier la perturbation.

> **`507 trop-abonnes` et `error code: 1042` n'existent plus.** Ces deux réponses
> venaient du découpage en lots imposé par le palier gratuit de Cloudflare. Si tu les
> retrouves dans un ancien journal, c'est un envoi d'avant la bascule.

Ce n'est **que si `details` montre un refus de signature** (`401`, `403`, ou un motif du
genre `BadJwtToken`, `VapidPkHashMismatch`) que la paire VAPID est en cause : la clé
publique du site ne correspond alors plus à la clé privée du serveur. Régénérer la paire
avec `node scripts/generer-vapid.mjs`, reposer les deux moitiés — `CLE_VAPID` côté dépôt,
`VAPID_JWK` côté serveur — puis redéployer les deux. Les appareils déjà abonnés doivent
ensuite réactiver les notifications : ne le fais donc pas sans raison.

Une vérification rapide, avant tout soupçon sur les clés : la clé publique servie par le
site doit être identique à la variable du dépôt.

```bash
gh variable list | grep CLE_VAPID
curl -s https://app.schoulbus.lu/api/sante | grep -o '"clePubliqueVapid":"[^"]*"'
```

`/api/sante` importe réellement le JWK privé et en dérive la clé publique : si elle
concorde avec la variable du dépôt, les clés ne sont pas le problème. Constater que le
secret « existe » ne prouvait rien — c'est précisément ainsi qu'un `VAPID_JWK` présent
mais illisible avait pu passer pour valide.

> **L'URL de l'API est publique.** Elle est compilée dans le JavaScript servi à tous
> les parents : elle apparaît donc en clair dans le code du site. C'est sans
> conséquence tant qu'elle ne porte le nom de personne — ce qui était le risque du
> sous-domaine `workers.dev`, dérivé du nom du compte Cloudflare, et ce que
> `app.schoulbus.lu` règle définitivement.

### Relancer un déploiement

Un push sur `main` reconstruit le site et redéploie le serveur. Manuellement :
`Actions → Déploiement → Run workflow`, ou le bouton de redéploiement de Dokploy pour
le seul serveur — utile quand seule une variable d'environnement a changé, puisque
l'image, elle, n'a pas bougé.

La chaîne d'intégration bloque la mise en ligne sur : audit de sécurité des dépendances
au niveau « élevé », vérification des types, et la totalité des tests — ceux de
l'application **et** ceux du serveur, ces derniers contre un vrai PostgreSQL.

### Vérifier avant d'annoncer

1. Activer les notifications sur un téléphone, depuis les réglages du site.
2. Publier une perturbation de test datée d'aujourd'hui.
3. Vérifier que le téléphone sonne, puis retirer la perturbation de test.

Sur **iPhone et iPad**, les notifications ne fonctionnent que si l'application a été
ajoutée à l'écran d'accueil. La page `/installer` explique la manipulation.

---

## Ce que les notifications ne garantiront jamais

À dire aux parents, et déjà écrit dans l'application :

- elles sont publiées **à la main** : s'il n'y a personne pour publier, il n'y a pas
  d'alerte ;
- un téléphone éteint, en mode avion ou sans réseau ne les reçoit pas ;
- iOS peut retarder une notification quand l'appareil est en veille prolongée.

Elles sont un confort supplémentaire, jamais une garantie. En cas de doute, c'est
l'école ou la commune qu'il faut appeler.
