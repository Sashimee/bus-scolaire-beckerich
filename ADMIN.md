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
peut le faire seule. Le Worker Cloudflare ci-dessous est ce minimum : il tient dans
l'offre gratuite, ne demande aucune maintenance, et ne stocke **aucune donnée
personnelle** — ni adresse, ni prénom, ni cycle, seulement des identifiants d'appareil
opaques, supprimés dès le désabonnement.

> Ces étapes demandent tes identifiants Cloudflare et GitHub : à toi de les faire.
> Le code est écrit, mais **il n'a pas pu être testé de bout en bout** faute de compte.
> Prévois de vérifier `/sante` puis un envoi réel avant d'annoncer la fonctionnalité
> aux parents.

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
- **Authorization callback URL** : `https://bus-beckerich.<ton-sous-domaine>.workers.dev/auth/callback`

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
curl https://bus-beckerich.<ton-sous-domaine>.workers.dev/sante
# {"ok":true,"oauth":true,"push":true,"origines":"https://sashimee.github.io,..."}
```

Si `oauth` ou `push` valent `false`, un secret manque.

### d. Déclarer les valeurs côté dépôt

Dans `Settings → Secrets and variables → Actions` :

| Type | Nom | Valeur |
| --- | --- | --- |
| Variable | `URL_WORKER` | `https://bus-beckerich.<ton-sous-domaine>.workers.dev` |
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
