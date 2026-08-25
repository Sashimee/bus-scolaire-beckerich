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

### Donner accès à un agent

**C'est la voie normale.** Un agent se connecte par **compte** — courriel et mot de
passe — sur `/connexion`, et publie depuis `/edition`. Il n'a besoin d'aucun compte
GitHub, ne voit aucun JSON, et ne détient aucun jeton : le serveur publie en son nom, et
ne lui montre que les onglets correspondant à ses **capacités**.

Prérequis, une seule fois : la variable `SECRET_SESSION` posée sur le service `bus-api`
dans Dokploy — une longue chaîne au hasard, à ne pas réutiliser. Sans elle, l'édition et
les comptes répondent 503, et le reste du serveur fonctionne normalement. Un relai SMTP
est aussi nécessaire pour les liens d'activation (voir le tableau des variables plus bas).
`/api/sante` doit ensuite répondre `"comptes": true`.

Une capacité = le droit d'éditer **une** nature de donnée. Les six :

| Capacité | Ce qu'elle ouvre |
| --- | --- |
| `perturbations` | Annoncer et retirer une perturbation (notification comprise). |
| `horaires` | Publier un nouveau plan, revalidé côté serveur. |
| `traductions` | Corriger les textes de l'application, dans les cinq langues. |
| `arrets` | Corriger la position d'un arrêt sur la carte. |
| `credits` | Modifier la page des crédits et remerciements. |
| `comptes` | Créer, modifier et désactiver les comptes eux-mêmes. |

On n'accorde que ce qu'il faut : confier la relecture des cinq langues à un bénévole
(`traductions` seule) ne lui donne jamais le droit d'annuler un bus. Le serveur revérifie
la capacité **en base à chaque requête** — la retirer prend effet tout de suite, sans
attendre l'expiration du jeton. C'est ce qui a remplacé les anciens espaces à code
personnel (`/commune`, `/traductions`) et l'ancienne page `/admin` : une seule porte, un
seul compte, des droits à la carte.

Le premier compte s'amorce par la CLI ; ensuite tout se gère depuis l'application. Voir
[« Amorcer les comptes utilisateurs »](#amorcer-les-comptes-utilisateurs) plus bas.

Le serveur limite les connexions à **5 par quart d'heure et par adresse IP**. Chaque
publication est inscrite au journal, consultable par toute session connectée : qui a
publié quoi, et quand.

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
| `SECRET_SESSION` | Comptes et édition (il signe les jetons de session) | Ils répondent 503, et le reste fonctionne. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Relais Google Agenda | L'intégration disparaît de l'interface, l'export `.ics` reste. |
| `URL_SITE` | Site publié, relu pour les rappels ; sert aussi de base aux liens d'activation et de réinitialisation des comptes | Aucun rappel n'est programmé ; les liens de compte seraient malformés. |
| `SMTP_HOTE`, `SMTP_PORT`, `SMTP_EXPEDITEUR` | Relai courriel pour les comptes utilisateurs (vérification, réinitialisation) — vise le conteneur de relai sur le réseau interne | La création de compte et la réinitialisation répondent 503 avec un motif clair ; la connexion aux comptes existants marche quand même. `SMTP_TLS`, `SMTP_UTILISATEUR`, `SMTP_MOTDEPASSE` sont facultatifs. |
| `NB_PROXYS_FIABLES` | Nombre de relais devant le serveur (défaut : 1) | Voir ci-dessous — **c'est le réglage le plus silencieux de tous**. |

> **`NB_PROXYS_FIABLES` mérite qu'on s'y arrête.** L'adresse du client est lue dans
> `X-Forwarded-For`, en partant de la FIN : le client peut écrire ce qu'il veut dans
> cet en-tête, mais il ne peut pas écrire après le relais. Avec Traefik seul devant,
> la valeur est 1. Si un jour un second relais s'ajoute, il faut la passer à 2 —
> sinon la limitation de débit compte les adresses du relais au lieu de celles des
> visiteurs, et cinq tentatives suffisent à bloquer tout le monde. Rien ne le
> signalerait.

**d. Les variables de dépôt GitHub.** `Settings → Secrets and variables → Actions` :
variables `URL_API` (`https://app.schoulbus.lu/api`), `CLE_VAPID`, `ID_CLIENT_GOOGLE`.
Ces variables servent aux deux constructions du site — celle de GitHub Pages (repli) et
l'image `bus-site` de la VPS.
`URL_PUBLIQUE` est facultative : sans elle, l'image `bus-site` se déclare sous
`https://app.schoulbus.lu`, ce qui est le cas voulu.

**e. Contrôler.**

```bash
curl https://app.schoulbus.lu/api/sante
```

`"base"`, `"push"` et `"comptes"` doivent être au vert. Depuis le lot 25, la publication
ne passe plus par le dépôt : il n'y a plus de champ `"depot"`, plus de `GITHUB_PAT`, tout
s'écrit en base.

### Reprendre l'état de l'ancien serveur

À faire **une seule fois**, au moment de la bascule. Sans cette étape, tous les parents
sont désabonnés, sans que rien ne le signale. (Les **codes d'agents ne sont plus repris** :
les espaces à code personnel ont été retirés — chaque agent est à recréer en compte, voir
« Donner accès à un agent » plus haut.)

L'export se fait depuis un poste connecté à Cloudflare ; l'import, **dans le conteneur**
`bus-api` (où `importer-kv.mjs` est embarqué et `DATABASE_URL` déjà posé), après y avoir
copié le fichier :

```bash
node serveur/exporter-kv.mjs > kv.json                      # poste connecté à Cloudflare
docker cp kv.json <conteneur bus-api>:/tmp/kv.json
docker exec <conteneur bus-api> node importer-kv.mjs /tmp/kv.json
```

L'import est idempotent : le relancer ne crée pas de doublon. Les états OAuth, les
verrous d'essai et les compteurs de tentatives ne sont **pas** repris — ils auront
expiré avant la fin de la bascule.

Le seul contrôle qui prouve quelque chose est de **se connecter à `/connexion` avec un
vrai compte**, puis de publier depuis `/edition`. Compter les lignes ne suffit pas.

### Amorcer les comptes utilisateurs

Depuis le lot 24, un agent peut se connecter par **compte (courriel + mot de passe)**,
avec des **capacités** — `perturbations`, `arrets`, `horaires`, `traductions`,
`credits`, `comptes` (gérer les comptes eux-mêmes). C'est optionnel : sans
`SECRET_SESSION`, l'espace est éteint et l'application parent tourne comme avant.

Le premier administrateur ne peut pas être créé depuis l'application — il n'y a encore
personne pour le créer. On l'amorce par la CLI, **dans le conteneur `bus-api`**, où le
script `creer-utilisateur.mjs` est embarqué et où `DATABASE_URL` est déjà posé (un
terminal Dokploy sur le service, ou `docker exec` sur la VPS) :

```bash
docker exec <conteneur bus-api> \
  node creer-utilisateur.mjs "agent@ville.lu" "Marie Weber" comptes
```

Une capacité par nature de donnée, séparées par des virgules ou des espaces — pour
amorcer un administrateur qui peut **tout** faire :
`"comptes,perturbations,horaires,traductions,credits,arrets"`.

Le compte naît **déjà vérifié** (l'opérateur en répond) avec un mot de passe tiré au
hasard, **affiché une seule fois**. Ensuite, toute personne portant `comptes` crée et
gère les autres **depuis l'application** (page `/comptes`, atteinte par le lien « Espace
agents » en pied de page). Les comptes créés dans l'application reçoivent un **lien
d'activation** par courriel qui pose leur mot de passe et vérifie leur adresse d'un même
geste — d'où l'exigence d'un relai SMTP configuré (voir le tableau des variables).

En secours, sans relai ou pour une personne verrouillée dehors, les mêmes commandes dans
le conteneur :

```bash
docker exec <conteneur bus-api> node creer-utilisateur.mjs --lister
docker exec <conteneur bus-api> node creer-utilisateur.mjs --mot-de-passe "agent@ville.lu"
docker exec <conteneur bus-api> node creer-utilisateur.mjs --desactiver "agent@ville.lu"
```

> On ne peut ni se retirer à soi-même la capacité `comptes`, ni se désactiver soi-même :
> la dernière personne à pouvoir gérer les comptes ne peut pas se verrouiller dehors.

### Si les notifications ne partent pas

**Depuis le lot 25, l'envoi fait partie de la publication** : annoncer une perturbation
depuis l'espace agents l'écrit en base ET notifie dans la même opération — il n'y a plus
de workflow GitHub `notifier.yml`, plus de `/notifier`, plus de `SECRET_NOTIFICATION`.
La réponse à la publication porte le résultat de l'envoi (`notification`), et le journal
du conteneur le détaille.

**Commence par lire ce que le serveur a répondu** — ne régénère surtout pas les clés
d'emblée. Suis l'envoi dans le journal du conteneur, puis publie la perturbation :

```bash
sudo docker logs -f <conteneur bus-api>   # ou le journal du service dans Dokploy
```

Le résultat de l'envoi dit exactement ce qui s'est passé :

| Champ | Interprétation |
| --- | --- |
| `envoyees` > 0 | Les notifications sont parties. Si le téléphone ne sonne pas, le problème est côté appareil (autorisation refusée, mode concentration). |
| `total: 0` | Aucun abonné enregistré. Il faut activer les notifications depuis le site, sur l'appareil. |
| `echecs` > 0 | Le service de push a refusé l'envoi. **Le champ `details` donne le service, le code HTTP et le motif exact** — c'est lui qu'il faut lire. |
| `notifiee: false` | La perturbation existait déjà (même identifiant) ou n'a pas de message français : c'est voulu, une reprise ne re-réveille personne. |

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
