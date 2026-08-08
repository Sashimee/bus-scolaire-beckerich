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

- **« Se connecter avec GitHub »** — nécessite le Worker (§ 3). Le jeton obtenu est
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

### Donner accès à la commune

Inviter le compte GitHub concerné en **Write** sur le dépôt
(`Settings → Collaborators`). Rien d'autre à faire : la page `/admin` le reconnaîtra.

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
peut le faire seule. Le Worker Cloudflare ci-dessous est ce minimum. Il ne stocke
**aucune donnée personnelle** — ni adresse, ni prénom, ni cycle, seulement des
identifiants d'appareil opaques, supprimés dès le désabonnement.

### Ce que ça coûte réellement

Chiffres relevés sur la [documentation Cloudflare](https://developers.cloudflare.com/workers/platform/limits/)
en août 2026, à revérifier : les grilles tarifaires changent.

| | Plan gratuit | Plan payant |
| --- | --- | --- |
| Requêtes | 100 000 / jour | illimité — **5 $/mois** |
| **Processeur par invocation** | **10 ms** | jusqu'à 5 minutes |
| Lectures KV | 100 000 / jour | — |
| Écritures KV | 1 000 / jour | — |
| Stockage KV | 1 Go | — |

Pour cette commune, les volumes ne posent aucun problème : 300 familles abonnées et
trois alertes par jour représentent environ 900 lectures KV, très loin des 100 000.

**La contrainte réelle est ailleurs : les 10 ms de processeur par invocation.** Le Web
Push impose un chiffrement et une signature *par destinataire*. Une boucle sur tous les
abonnés dépasserait ce budget dès quelques dizaines d'inscrits, et Cloudflare
interromprait l'envoi en silence — une partie des parents ne recevrait rien sans que
personne s'en aperçoive.

Le Worker contourne cela en découpant l'envoi en lots, chaque lot repartant avec son
propre budget. Avec les réglages par défaut (`TAILLE_LOT = 10`, 45 lots), il couvre
**environ 450 abonnés par envoi**. Au-delà, il répond explicitement `507 trop-abonnes`
plutôt que de servir une partie des familles seulement.

> **Le coût par push n'a pas été mesuré.** `TAILLE_LOT = 10` est une estimation
> prudente, pas une valeur validée. Après le premier envoi réel, regarde
> `npx wrangler tail` : si aucune invocation n'est interrompue, tu peux monter la
> valeur ; si certaines le sont, descends-la. Passer au plan payant à 5 $/mois lève
> entièrement la question.

### « Sans maintenance » serait exagéré

Ce n'est pas un service qu'on installe et qu'on oublie : `wrangler` se met à jour,
l'application OAuth GitHub et les clés VAPID peuvent devoir être renouvelées, et l'API de
Cloudflare évolue. Compte une vérification par an, en même temps que la mise à jour du
plan de bus.

Le chiffrement des notifications, lui, n'a plus de dépendance : il est écrit directement
dans `worker/src/push.js`, aux normes RFC 8291 et RFC 8292, et verrouillé par le vecteur
de test officiel dans `worker/src/push.test.js`.

> Ces étapes demandent tes identifiants Cloudflare et GitHub : à toi de les faire.
> Le code est écrit, mais **il n'a pas pu être testé de bout en bout** faute de compte.
> Prévois de vérifier `/sante` puis un envoi réel avant d'annoncer la fonctionnalité
> aux parents.

### Le chemin court : le script guidé

```bash
cd worker
./installer.sh
```

**Si `wrangler login` échoue** — ce qui arrive régulièrement quand le compte Cloudflare
passe par Google — utilise un jeton d'API, qui évite complètement le passage par le
navigateur et reste la méthode recommandée pour un script :

1. [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   → **Create Token** ;
2. modèle **« Edit Cloudflare Workers »** (il couvre Workers Scripts et Workers KV) ;
3. vérifier que le compte sélectionné est le bon, puis créer le jeton ;
4. l'exporter et relancer :

```bash
export CLOUDFLARE_API_TOKEN='le-jeton'
./installer.sh
```

Le jeton reste dans ton terminal : il n'est ni affiché, ni écrit dans le dépôt.
Ferme la session ou fais `unset CLOUDFLARE_API_TOKEN` quand tu as fini.

Il enchaîne tout — dépendances, connexion Cloudflare, création de l'espace de
stockage, génération des clés, dépôt des quatre secrets, déploiement, déclaration des
variables côté GitHub, puis vérification — en s'arrêtant aux deux seuls moments qui
demandent une décision : l'identifiant de compte Cloudflare et la création de
l'application OAuth GitHub.

Deux précautions y sont prises :

- **la clé privée VAPID n'est jamais affichée** : elle passe directement du générateur
  au secret Cloudflare ;
- **l'identifiant de compte n'est pas écrit dans le dépôt** : il est lu depuis
  `CLOUDFLARE_ACCOUNT_ID` ou demandé à l'exécution.

### Si les notifications ne partent pas

**Commence par lire ce que le Worker a répondu** — ne régénère surtout pas les clés
d'emblée. Le workflow « Notifier les perturbations » journalise la réponse complète :

```bash
gh run list --workflow=notifier.yml --limit 1
gh run view <identifiant> --log | grep 'Worker a répondu'
```

La réponse dit exactement ce qui s'est passé :

| Réponse | Interprétation |
| --- | --- |
| `envoyees` > 0 | Les notifications sont parties. Si le téléphone ne sonne pas, le problème est côté appareil (autorisation refusée, mode concentration). |
| `total: 0` | Aucun abonné enregistré. Il faut activer les notifications depuis le site, sur l'appareil. |
| `echecs` > 0 | Le service de push a refusé l'envoi. **Le champ `details` donne le service, le code HTTP et le motif exact** — c'est lui qu'il faut lire. |

Pour suivre un envoi en direct : `cd worker && npx wrangler tail`, puis publier la
perturbation.

Ce n'est **que si `details` montre un refus de signature** (`401`, `403`, ou un motif du
genre `BadJwtToken`, `VapidPkHashMismatch`) que la paire VAPID est en cause : la clé
publique du site ne correspond alors plus à la clé privée du Worker. `./reparer-vapid.sh`
régénère la paire et la redépose des deux côtés, puis relance le déploiement. Les
appareils déjà abonnés doivent ensuite réactiver les notifications — ne le lance donc
pas sans raison.

Une vérification rapide, avant tout soupçon sur les clés : la clé publique servie par le
site doit être identique à la variable du dépôt.

```bash
gh variable list | grep CLE_VAPID
curl -s https://sashimee.github.io/bus-scolaire-beckerich/ \
  | grep -oE '/assets/index-[^"]+\.js' | head -1
# puis chercher la clé (commence par « B », 87 caractères) dans ce fichier
```

Si les deux concordent, les clés ne sont pas le problème.

> **Le sous-domaine workers.dev sera public.** L'URL du Worker est compilée dans le
> JavaScript servi à tous les parents : elle apparaît donc en clair dans le code du
> site, et reste indexable. Un sous-domaine contenant un nom de personne y réintroduit
> une donnée personnelle. Il se change dans Cloudflare, sous
> **Workers & Pages → Subdomain** — un nom neutre comme `bus-beckerich` évite le
> problème. Le script prévient si le sous-domaine choisi ressemble à un nom propre.

Les étapes ci-dessous décrivent la même chose à la main, si tu préfères contrôler
chaque commande ou si le script échoue quelque part.

### a. Générer les clés VAPID

```bash
node scripts/generer-vapid.mjs
```

Deux valeurs s'affichent : une clé **publique** et un **JWK privé**. Le JWK privé ne
doit jamais être commité.

### b. Créer l'application OAuth GitHub

Sur [github.com/settings/developers](https://github.com/settings/developers) →
*New OAuth App* :

- **Homepage URL** : `https://sashimee.github.io/bus-scolaire-beckerich/`
- **Authorization callback URL** : `https://bus-beckerich.abadev.workers.dev/auth/callback`

Noter le *Client ID* et générer un *Client secret*.

### c. Déployer le Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create ABONNEMENTS   # reporter l'id dans wrangler.toml
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put VAPID_JWK              # le JWK privé de l'étape a
npx wrangler secret put SECRET_NOTIFICATION    # une chaîne aléatoire, à réutiliser en d
npx wrangler deploy
```

Vérifier ensuite :

```bash
curl https://bus-beckerich.abadev.workers.dev/sante
# {"ok":true,"oauth":true,"push":true,"origines":"https://sashimee.github.io,..."}
```

Si `oauth` ou `push` valent `false`, un secret manque.

### d. Déclarer les valeurs côté dépôt

Dans `Settings → Secrets and variables → Actions` :

| Type | Nom | Valeur |
| --- | --- | --- |
| Variable | `URL_WORKER` | `https://bus-beckerich.abadev.workers.dev` |
| Variable | `CLE_VAPID` | la clé publique de l'étape a |
| Secret | `SECRET_NOTIFICATION` | la même chaîne aléatoire qu'en c |

Ce sont des **variables** et non des secrets pour les deux premières : l'URL du Worker
et la clé publique VAPID se retrouvent de toute façon dans le code servi au navigateur.
Les traiter comme des secrets donnerait une fausse impression de confidentialité.

### e. Relancer un déploiement

Un push sur `main`, ou `Actions → Déploiement GitHub Pages → Run workflow`. Le bouton
« Activer les notifications » apparaît alors dans les réglages du site.

### f. Vérifier avant d'annoncer

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
