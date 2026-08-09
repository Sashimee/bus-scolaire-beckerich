# Plan d'évolution — Bus scolaire Beckerich

## Contexte

L'application fonctionne et rend déjà le service prévu : elle calcule, pour chaque enfant,
l'arrêt le plus proche et ses trajets jour par jour, hors ligne et sans serveur. Après
usage réel, une série de manques apparaissent — les uns purement visuels (heures de retour
illisibles, boutons qui débordent sur iPhone, bouton d'installation invisible), les autres
structurels : la configuration d'un enfant suppose un domicile unique et une présence au
Dillendapp limitée au midi, la page `/admin` exige un compte GitHub et sait éditer du JSON
brut, et l'intégration agenda s'arrête à un fichier `.ics` téléchargé.

L'objectif est de rendre l'application utilisable **par des parents pressés sur téléphone**
et **administrable par un agent communal non informaticien**, sans renoncer aux deux
principes du projet : aucune donnée personnelle ne quitte l'appareil, et l'application dit
ce qu'elle ne sait pas plutôt que de deviner.

Le travail est découpé en lots indépendants, lançables un par un — 13 à l'origine,
17 depuis les retours d'usage. Chaque lot est autonome : il compile, passe les tests et
peut être déployé seul. Les dépendances entre lots sont indiquées explicitement.

### Décisions déjà prises

| Sujet | Décision |
| --- | --- |
| Connexion des agents communaux | Code d'accès personnel vérifié par le Worker, qui publie sur GitHub avec un jeton machine. Aucun compte GitHub côté commune. |
| Google Agenda | Architecture préparée maintenant, ICS fortement amélioré ; l'intégration OAuth Google devient le lot 13, activable dès qu'un ID client existe. |
| Adresses par jour | Par enfant, avec départ (matin) et arrivée (soir) distincts. |
| Refonte UI/UX | Refonte visuelle complète : nouveau système de design (typographie, palette, espacements, composants) en plus de la mise en page. |

---

## Réserves ouvertes

Ce que les lots livrés **n'ont pas pu vérifier**, et comment le lever. Cette liste est
tenue à jour à chaque lot : une réserve énoncée et non inscrite ici est une réserve
perdue. Elle se raye quand la vérification a été faite, pas avant.

| # | Lot | Réserve | Comment la lever |
| --- | --- | --- | --- |
| R1 | 2, 7 | **L'aperçu papier débordait, et personne ne l'avait vu.** Signalé en usage réel le 2026-08-09 : deux enfants ne tenaient pas sur une feuille. Cause mesurée — la mise en page supposait la largeur contraignante alors que c'est la hauteur : 285 mm pour 273 disponibles. Corrigé (deux lignes par trajet au lieu de trois, pagination par trois enfants au lieu de cinq) et remesuré : 1 à 3 enfants tiennent en 220 mm, 4 et 5 font deux pages. **Mais toujours pas imprimé sur du vrai papier.** | Réimprimer depuis `/reglages` avec deux enfants, puis avec quatre. |
| ~~R2~~ | 6 | ~~L'installation réelle n'a pas été essayée.~~ **Levée le 2026-08-09** : installée depuis Safari sur l'iPhone de l'auteur, ouverte depuis l'icône. |
| R3 | 8 | **Le Worker n'a jamais tourné contre Cloudflare ni GitHub.** Les 29 tests s'appuient sur un KV en mémoire ; `worker/src/github.js` n'a émis aucun appel réel ; `creer-agent.sh` n'a été vérifié que par `bash -n`. | Poser les secrets, déployer, créer un agent, publier une perturbation de test puis la retirer. Voir « Mise en service » ci-dessous. |
| R4 | 8 | **La limitation de débit n'est pas stricte.** Elle repose sur la cohérence différée de KV : des requêtes concurrentes laisseront passer quelques tentatives de plus que les cinq annoncées. Sans commune mesure avec une force brute, mais à savoir. | Rien à faire tant que l'ordre de grandeur suffit. Un Durable Object le rendrait strict, au prix d'une brique de plus. |
| R5 | 9 | **Aucun aller-retour réel avec le Worker.** Les trois pages ont été éprouvées avec une session simulée et un Worker injoignable : rendu, navigation, diff d'horaires et message d'erreur réseau sont bons ; la connexion par code et la publication effective ne le sont pas. | Même manœuvre que R3, depuis `/commune` cette fois. |
| R7 | 10 | **Aucun rappel réel n'a été envoyé.** Le planificateur est couvert par 20 tests, mais le cron n'a jamais tourné, `URL_SITE` n'a jamais été lu, et le filtre par préférence n'a jamais été exercé sur un vrai abonnement. | Publier une alerte de test un matin d'école, vérifier dans `npx wrangler tail` que le rappel part au bon créneau, puis la retirer. |
| ~~R8~~ | 10 | ~~Le sélecteur de préférence n'a pas été vu à l'écran.~~ **Levée le 2026-08-09** sur iPhone, notifications actives. |
| ~~R9~~ | 11 | ~~La CSP n'a pas été vérifiée en production.~~ **Levée le 2026-08-08** : vérifiée sur le site déployé — tuiles OpenStreetMap chargées, service worker actif, GoatCounter chargé, zéro violation. |
| ~~R10~~ | 12 | ~~Aucun `.ics` de la nouvelle chaîne n'a été importé dans un vrai agenda.~~ **Levée le 2026-08-09** : importé dans Apple Calendrier depuis l'iPhone. |
| R11 | 13 | **L'intégration Google n'a jamais tourné.** Le prérequis — projet Google Cloud, API Calendar, ID client OAuth, écran de consentement — n'est pas fait. Ni le flux PKCE, ni la création d'agenda, ni l'écriture d'un événement n'ont été exercés. | Créer l'ID client, poser `VITE_ID_CLIENT_GOOGLE` en variable de dépôt, puis connecter un compte de test. |
| R12 | 11 | **La CSP avait cassé `npm run dev`** en bloquant le préambule inline de React Refresh — page blanche, découvert seulement au lot 13. Corrigé : la politique ne s'applique qu'au build. Rappel de méthode : vérifier le build **et** le serveur de développement après toute modification de `vite.config.ts`. | Corrigé. Ligne gardée comme trace. |
| R13 | 6 | **Trois vérifications successives n'avaient pas montré que la boîte d'installation ne s'ouvrait jamais**, parce qu'elles simulaient `beforeinstallprompt` APRÈS le montage de React — exactement le cas qui fonctionnait. Rappel de méthode : un événement simulé ne prouve rien sur le moment où le vrai arrive. | Corrigé. Ligne gardée comme trace. |
| ~~R14~~ | — | ~~Les champs d'heure débordaient sur iPhone.~~ **Levée le 2026-08-09** : la refonte du lot 14 — une case et un champ par ligne, deux blocs séparés — vérifiée sur l'iPhone de l'auteur. |
| R15 | — | **La vignette de partage n'a pas été soumise aux validateurs.** Les métadonnées Open Graph sont posées et l'image existe, mais aucun aperçu réel n'a été obtenu depuis WhatsApp, Facebook ou LinkedIn. | Coller le lien dans une conversation WhatsApp, ou passer par le débogueur de partage de chaque plateforme. |
| ~~R16~~ | 14 | ~~Les bornes `min`/`max` n'ont pas été vues sur Safari iOS.~~ **Levée le 2026-08-09** : la roue de sélection les respecte. |
| R17 | 15 | **L'espace `/traductions` n'a jamais parlé à un vrai Worker.** La séparation des rôles est couverte par quatre tests contre un KV en mémoire ; la connexion par code, la publication sur GitHub et la relecture de la surcouche déployée ne l'ont pas été. | Même manœuvre que R3, avec `./creer-agent.sh "Nom" "" traductions`, puis corriger une clé allemande et vérifier qu'elle change sans reconstruction. |
| R18 | 15 | **Les onglets d'`/admin` n'ont pas été vus connecté.** Le composant est couvert par huit tests (clavier, URL, ARIA) mais `/admin` exige un jeton GitHub, que le poste de développement n'a pas. | Se connecter sur `/admin` et parcourir les cinq onglets, dont ceux des textes et des crédits. |
| ~~R19~~ | 17 | ~~L'effet de l'en-tête `Urgency` n'est pas constatable ici.~~ **Levée le 2026-08-09** : marche à suivre iOS affichée, notification d'essai reçue en quelques secondes sur l'iPhone de l'auteur. |
| ~~R20~~ | 17 | ~~Aucune notification d'essai.~~ **Levée le 2026-08-09** : route `POST /essai`, authentifiée par le endpoint lui-même — le connaître ne permet que de se faire vibrer soi-même, une fois par minute au plus. 7 tests, dont le refus d'un endpoint non abonné et la limite par abonnement. Reste à essayer sur un vrai téléphone (R19). |
| ~~R6~~ | 3 | ~~Une arrivée après la sonnerie est affichée sans être signalée.~~ **Levée le 2026-08-08** : le signal a été écrit puis retiré. Mesure faite au lot 14 : il se déclenchait sur 14 arrêts sur 16 en c1 et 15 sur 16 en c2 — le plan fait arriver les bus à Oberpallen à 07:58 et à Noerdange à 08:00 pour une sonnerie annoncée à 07:55. Décision de l'auteur : c'est un transport scolaire, l'école intègre ces quelques minutes ; le signaler chaque jour à deux cycles entiers serait du bruit. |

### Mise en service, non faite

L'espace commune est écrit mais **pas activé**. Tant que `SECRET_SESSION` est absent,
les routes `/commune/*` répondent 503 et `/commune` affiche « non activé » — ce qui est
le comportement voulu, mais signifie que les lots 8 et 9 ne rendent aucun service pour
l'instant.

```bash
cd worker
npx wrangler secret put SECRET_SESSION   # longue chaîne au hasard, non réutilisée
npx wrangler secret put GITHUB_PAT       # jeton fine-grained, Contents: RW, CE dépôt seul
npx wrangler deploy
./creer-agent.sh "Prénom Nom" "service"
curl https://<worker>/sante              # doit renvoyer "commune": true
```

Il faut aussi que `VITE_URL_WORKER` soit défini à la construction, sans quoi l'espace
commune reste invisible côté navigateur.

---

## Lot 0 — Amorçage : `CLAUDE.md` et `docs/plan.md`

Aucun `CLAUDE.md` n'existe à la racine aujourd'hui.

1. Créer `docs/plan.md` : copie intégrale de ce plan (contexte, décisions, les 13 lots).
2. Créer `CLAUDE.md` à la racine, court, décrivant :
   - la nature du projet et ses deux principes non négociables (aucun serveur pour les
     données des familles ; honnêteté sur les limites) ;
   - la convention de nommage **en français** du code (`Trajet`, `contexteEnfant`,
     `definirRepas`…) — toute contribution doit s'y tenir ;
   - la carte des fichiers : `src/lib/` = moteur pur et testé, `src/composants/` +
     `src/pages/` = affichage, `src/data/` = toutes les données, `worker/` = Cloudflare ;
   - les commandes (`npm run dev`, `test`, `typecheck`, `build`) ;
   - un renvoi explicite : **« Feuille de route détaillée : [docs/plan.md](docs/plan.md) »** ;
   - les renvois existants vers `DONNEES.md` et `ADMIN.md`.

---

## Lot 1 — Corrections visibles immédiates

> **Fait le 2026-08-08.** Les quatre points sont livrés. Deux ajouts par rapport au texte
> ci-dessous : un utilitaire `destinationTrajet()` en plus de `sensTrajet()` (la fiche
> imprimable distingue trois destinations, pas deux sens), et un garde-fou anti-boucle
> sur le rechargement automatique (`sessionStorage`), pour qu'un déploiement incohérent
> ne rende pas l'application inutilisable.

Les quatre irritants signalés qui ne demandent aucun changement de modèle. Volontairement
groupés : ce sont ceux qui se voient dès l'ouverture de l'application.

### 1.1 Heures de retour lisibles — `src/composants/Trajets.tsx`, `src/index.css`

`LigneTrajet` affiche aujourd'hui l'heure de départ en grand à gauche et noie l'heure
d'arrivée dans la ligne de détail (`trajet.arrivee.heure` après un `·`). Pour un retour,
c'est l'inverse de ce qui intéresse le parent.

Nouvelle disposition, pilotée par le sens du trajet :

- **Trajet vers l'école** (`aller-matin`, `aller-apres-midi`, `navette-dillendapp-retour`) :
  heure de **départ en grand à gauche** (comportement actuel, correct), heure d'arrivée en
  petit.
- **Trajet de retour** (`retour-midi`, `retour-soir`, `retour-soir-dillendapp`,
  `navette-dillendapp-midi`) : heure de départ de l'école **en petit à gauche**, heure
  d'arrivée **en grand à droite**, dans la même couleur d'accent que l'heure de départ des
  allers.

Introduire un utilitaire `sensTrajet(type): 'aller' | 'retour'` dans `src/lib/affichage.ts`
et le réutiliser dans `FicheImprimable.tsx`, qui a déjà une fonction `sens()` locale
faisant le même travail — la remplacer par l'utilitaire partagé.

Les états `annule` / `decale` (barré, heure recalculée) doivent s'appliquer à l'heure
**mise en avant**, pas seulement au départ : `heureEffective()` dans `src/lib/urgences.ts`
ne décale aujourd'hui que `depart.heure`. Ajouter `heureArriveeEffective()` sur le même
modèle (même retard appliqué aux deux bouts) et le couvrir dans `src/lib/urgences.test.ts`.

### 1.2 Prénoms des enfants sur la page Réglages — `src/pages/Reglages.tsx`

La section renvoyant vers `/configurer` n'affiche que `foyer.adresse?.libelle` et un
compte. Remplacer par la liste des enfants : prénom, cycle, site scolaire
(`siteDuCycle(enfant.cycle).nom`, déjà utilisé dans `Semaine.tsx`), et un lien direct vers
la configuration de cet enfant. L'adresse du foyer reste affichée au-dessus.

### 1.3 Boutons « toute la semaine » — `src/composants/GrilleSemaine.tsx`, `src/index.css`

Aujourd'hui : un `<span class="champ__aide">` suivi de deux `<button class="bouton
bouton--discret">` dans un `.rangee`. Sur iPhone 15 Pro Max, le libellé pousse les deux
boutons sur deux lignes, et le style `--discret` les rend illisibles.

Refaire les deux raccourcis (repas et bus) sur le même modèle que la bascule `.bascule`
déjà utilisée dans la grille : **libellé sur sa propre ligne au-dessus**, puis un groupe de
boutons segmenté en pleine largeur, cible tactile ≥ 44 px, contraste identique aux boutons
normaux. Remplacer aussi le `<select>` « bus toute la semaine » (qui se réinitialise
bizarrement via `e.target.value = ''`) par le même groupe segmenté à quatre options.

### 1.4 Rechargement automatique à chaque déploiement — `src/composants/BandeauVersion.tsx`

`BandeauVersion` interroge `version.json` toutes les 30 min et affiche un bouton
« Recharger ». Passer en rechargement automatique :

- intervalle ramené à **5 min**, plus une vérification à chaque `visibilitychange` et à
  chaque `focus` (déjà partiellement en place) ;
- quand une nouvelle version est détectée, appeler `window.location.reload()`
  **automatiquement** après un court délai (2 s) avec un bandeau « nouvelle version, mise à
  jour… », sans bouton à cliquer ;
- **exception** : ne jamais recharger automatiquement si l'utilisateur est sur `/admin` ou
  `/commune/*` avec un brouillon non publié, ni si un `<dialog>` est ouvert. Dans ces cas,
  garder le bandeau avec bouton. Exposer cette garde via un petit contexte
  `src/rechargement-contexte.tsx` (`bloquerRechargement(raison)`) que les pages
  d'administration consomment.

Le service worker est déjà en `registerType: 'autoUpdate'` avec `skipWaiting` +
`clientsClaim` (`vite.config.ts`) : le rechargement récupère bien les nouveaux assets.

**Vérification du lot 1** : `npm test`, `npm run typecheck`, puis `npm run dev` — ouvrir la
fiche d'un enfant sur un viewport 430 × 932 (iPhone 15 Pro Max) dans les outils
développeur, vérifier que les deux boutons « toute la semaine » tiennent sur une ligne et
que les heures d'arrivée des retours sont l'élément le plus gros de la carte.

---

## Lot 2 — Refonte visuelle : le système de design

> **Fait le 2026-08-08.** Les quatre points sont livrés. Écarts et ajouts par rapport au
> texte ci-dessous :
>
> - Les jetons de couleur passent de l'anglais au français (`--bg` → `--fond`,
>   `--text` → `--encre`, `--line` → `--bord`…), ce qui aligne la feuille de style sur la
>   convention du dépôt et libère le préfixe `--texte-*` pour l'échelle typographique.
> - Les couleurs décoratives `--cyan` et `--violet` disparaissent au profit de l'accent
>   unique ; il ne reste qu'un `--accent-2`, dont le seul usage est de distinguer une
>   ligne de bus.
> - Deux défauts trouvés à la vérification et corrigés : l'URL de la source citée en
>   toutes lettres élargissait la page « Limites » au-delà d'un écran de 320 px
>   (`overflow-wrap: anywhere` sur les liens — `break-word` ne suffit pas, il ne réduit
>   pas la largeur minimale intrinsèque), et le champ « jeton » de `/admin` restait à
>   31 px de haut parce que `input[type='password']` n'était pas dans la liste des types
>   énumérés (remplacée par une exclusion).
> - `.bouton--discret` n'est plus gris sur fond transparent mais dans la couleur d'accent :
>   l'ancienne variante tombait sous le seuil de contraste.
> - Nouveaux fichiers : `src/composants/Navigation.tsx` (les deux variantes lisent la même
>   liste d'entrées) et `src/composants/Bandeaux.tsx` (la pile priorisée).
> - Vérification automatisée plutôt qu'à l'œil : 9 routes × 3 largeurs × 2 thèmes = 54
>   combinaisons, mesurées dans des iframes de largeur fixe. Aucun débordement
>   horizontal, aucune cible interactive sous 44 px.
>
> **Réserve** : la couche `impression` n'a pas été contrôlée visuellement. Le navigateur
> employé n'expose pas l'émulation du média `print`, et ouvrir la boîte d'impression
> bloquerait la session. `FicheImprimable.tsx` n'est pas touché et les variables de la
> couche ont été recroisées une à une (aucune utilisée sans être définie), mais
> l'aperçu papier reste à confirmer d'un `Cmd+P`.

**Fondation de toute la refonte. À faire avant les lots 3 à 8**, qui construisent des
écrans avec les nouvelles primitives.

`src/index.css` (767 lignes) est déjà organisé en `@layer reset, tokens, base, layout,
composants, impression` — la structure est bonne, c'est le contenu qui est repris.

### 2.1 Jetons — couche `tokens`

- **Typographie** : échelle modulaire explicite (`--texte-xs` … `--texte-3xl`) au lieu des
  `fontSize: '1rem'` en style inline dispersés dans une douzaine de composants. Chiffres en
  `font-variant-numeric: tabular-nums` partout où une heure s'affiche.
- **Palette** : conserver le principe clair/sombre piloté par `data-theme` (posé par
  `etat.tsx`), mais redéfinir les couleurs autour d'un accent unique plus lisible, et
  vérifier chaque couple texte/fond à un contraste ≥ 4.5:1 (≥ 3:1 pour les gros textes).
  Les couleurs sémantiques (`--rouge`, `--orange`) deviennent une famille complète
  (`--danger`, `--danger-fond`, `--danger-bord`…) pour que les encarts ne soient plus
  bricolés en style inline (`color: 'var(--rouge)'` dans `Trajets.tsx`).
- **Espacement** : échelle unique de 4 px, remplaçant les `marginInlineStart: '0.5rem'`
  ponctuels.
- **Rayons, ombres, épaisseurs de trait** : trois valeurs chacun, pas plus.

### 2.2 Primitives — couche `composants`

Redessiner et documenter : `.carte`, `.bouton` (+ variantes), `.champ`, `.encart`,
`.etiquette`, `.bascule`, `.pile`, `.rangee`, `.grille-semaine`, `.suggestions`, `.trajet`.

Règles imposées :
- toute cible tactile fait **≥ 44 × 44 px** ;
- aucun `.rangee` ne déborde : `flex-wrap` par défaut et `min-inline-size: 0` sur les
  enfants ;
- focus visible sur tout élément interactif ;
- `@media (prefers-reduced-motion: reduce)` neutralise les transitions.

### 2.3 Coquille de l'application — `src/App.tsx`

- **Navigation basse sur mobile** (barre fixe : Aujourd'hui · Enfants · Plan · Réglages),
  navigation haute conservée à partir de `min-width: 48rem`.
- En-tête allégé, `env(safe-area-inset-*)` respecté (le `viewport-fit=cover` est déjà posé
  dans `index.html`).
- Les bandeaux empilés en haut (version, plan périmé, urgences, avertissement initial,
  réception d'un partage) deviennent une **pile de bandeaux unique et priorisée** : au plus
  un bandeau bloquant à la fois, les autres accessibles derrière.

### 2.4 Nettoyage

Supprimer tous les `style={{ … }}` inline des composants au profit de classes. Ils sont
aujourd'hui présents dans `App.tsx`, `Accueil.tsx`, `Semaine.tsx`, `Reglages.tsx`,
`Configurer.tsx`, `Admin.tsx`, `Trajets.tsx`, `Notifications.tsx`, `Installer.tsx`,
`ChampAdresse.tsx`.

**Vérification** : parcourir chaque route (`/`, `/configurer`, `/enfant/:id`, `/plan`,
`/limites`, `/independance`, `/installer`, `/reglages`, `/admin`) en 320 px, 430 px et
1280 px de large, en thème clair et sombre. Aucun débordement horizontal.

---

## Lot 3 — Modèle de données : adresses par jour et inscription périscolaire

> **Fait le 2026-08-08.** Livré, avec une **correction de fond sur le §3.3**.
>
> **Le §3.3 partait d'un fait faux.** Il affirmait, « vérifié dans
> `src/data/plan-2025-2026.json` », qu'aucune course du plan ne dessert le Dillendapp le
> matin. C'est inexact : le service `aller-3-matin` s'y arrête à **07:38 puis à 07:52**,
> cinq jours sur cinq, en direction `vers-ecole`. Écrire sur la page « Limites » que la
> commune ne publie aucune desserte aurait été affirmer une contre-vérité aux parents —
> exactement ce que le deuxième principe du projet interdit.
>
> Ce qui a été fait à la place :
> - `dillendappDepuis[jour]` supprime bien l'`aller-matin` depuis le domicile et ne le
>   compte pas dans `manquants` — cette partie du §3.3 était juste.
> - Un nouveau type `navette-dillendapp-matin` calcule le trajet maison relais → école
>   sur le plan réel, au lieu de décréter qu'il n'existe pas. Il est interne à la journée
>   d'école (`concerneParent: false`), comme les deux autres navettes.
> - Cas particulier traité : la maison relais est à 86 m de l'école de Beckerich, donc le
>   **même point d'embarquement**. Pour un précoce ou un C4, aucune navette n'est proposée
>   — il y va à pied. Sans ce garde-fou, le moteur produisait un aller-retour à Oberpallen
>   pour revenir à son point de départ.
> - **Ce que le calcul révèle, et que l'application dit maintenant** : pour un C2, aucune
>   course Dillendapp → Noerdange n'arrive avant la sonnerie de 07:55. La première au
>   départ (Aller 2, 07:34 → 08:00) arrive cinq minutes après ; l'Aller 3 (07:52 → 07:58)
>   reste en alternative. Un C1 arrive à 07:45, à l'heure. L'application affiche les
>   heures publiées sans les corriger, et la page « Limites » énonce le fait.
>
> Autres écarts et ajouts :
> - `arretUtile(coord, enfant, sens)` cherche bien `vers-domicile` en `midi`/`soir` pour
>   une adresse de retour. Appliqué aussi au domicile : les 141 tests existants passent
>   sans modification, donc aucun village de la commune n'est desservi dans un seul sens.
> - `aller-apres-midi` repart de l'adresse du **retour de midi**, et non du domicile :
>   l'enfant reprend le bus là où il a déjeuné.
> - `depose` est affichée (fiche écran et fiche imprimable) et exportée dans l'ICS, comme
>   le prévoyait le §3.3. La boucle ICS des passages à la maison relais est mutualisée
>   entre dépose et récupération.
> - `adresseDerogatoire` est signalée par une étiquette dans `LigneTrajet`, sans quoi un
>   arrêt inhabituel se lit comme une erreur de calcul.
> - Deux sections ajoutées à la page « Limites » (`dillendapp`, `adresses`) dans les cinq
>   langues.
> - `src/lib/partage.test.ts` créé : aller-retour v4, relecture d'un lien v1 et d'un v3,
>   refus d'un lien corrompu. 172 tests au total.
>
> Reste explicitement au lot 4 : les écrans (`definirPeriscolaire`,
> `definirDillendappDepuis`, `definirAdresseJour`, choix d'un arrêt pour une adresse hors
> commune). Le modèle est en place, mais rien ne permet encore de le régler dans l'interface.

*Dépend du lot 2 pour l'habillage, mais peut être développé en parallèle : ce lot porte
d'abord sur `src/lib/`.*

C'est le lot le plus structurant. Il touche le type `Enfant`, la persistance, le partage
par lien et le moteur `plan.ts`.

### 3.1 Types — `src/lib/types.ts`

```ts
/** Une adresse qui remplace le domicile un jour donné, dans un sens donné. */
export interface AdresseJour {
  matin?: Adresse | null   // d'où part l'enfant ce matin-là
  soir?: Adresse | null    // où il est ramené ce soir-là
}

export interface Enfant {
  // … champs existants
  /** Adresses dérogatoires, par jour. Absent = domicile du foyer. */
  adresses?: Partial<Record<Jour, AdresseJour>>
  /** L'enfant est inscrit au périscolaire (Dillendapp / SEA). */
  periscolaire?: boolean
  /** Présence au Dillendapp AVANT la classe, par jour. `null` = pas de présence. */
  dillendappDepuis?: Record<Jour, string | null>
  // `dillendappJusqua` existe déjà : présence APRÈS la classe.
}
```

### 3.2 Moteur — `src/lib/plan.ts`

`contexteEnfant(enfant, adresse)` renvoie aujourd'hui **un** contexte, avec **un**
`arretDomicile`. Il faut désormais un contexte par jour et par sens.

- Extraire `arretUtile(coordDepart, enfant, sens)` de la logique actuelle de
  `contexteEnfant` (la boucle qui cherche le plus proche arrêt réellement desservi **dans
  le bon sens**). Attention : la version actuelle ne teste que le sens `vers-ecole` en
  période `matin` ; pour une adresse de retour différente, il faut tester
  `vers-domicile` en périodes `midi` / `soir`.
- `ContexteEnfant` gagne :
  ```ts
  arretsParJour: Record<Jour, { matin: ArretProche | null; soir: ArretProche | null }>
  ```
  `arretDomicile`, `distance`, `temps` restent comme valeurs par défaut (domicile du
  foyer), pour ne rien casser dans `Accueil.tsx` et `FicheImprimable.tsx`.
- `trajetsDuJour(ctx, jour)` utilise l'arrêt du jour et du sens au lieu de
  `arretDomicile.id` pour construire `domicile` : deux tableaux distincts,
  `departDuJour` et `arriveeDuJour`.
- `Trajet` gagne un champ optionnel `adresseDerogatoire?: 'matin' | 'soir'`, pour que
  l'affichage puisse signaler « départ depuis chez les grands-parents » plutôt que de
  laisser le parent croire à une erreur.

**Limite à assumer** : `chercherAdresses()` (`src/lib/adresses.ts`) ne connaît que les
adresses de la commune de Beckerich (jeu BD-Adresses embarqué, 41 Ko). Une adresse hors
commune est introuvable. Comportement retenu, cohérent avec le principe d'honnêteté :
proposer alors de **choisir directement un arrêt dans la liste** (`arrets` de
`src/lib/donnees.ts`), avec la mention « adresse hors commune : indique l'arrêt utilisé ».

### 3.3 Périscolaire — `src/lib/plan.ts`

Vérifié dans `src/data/plan-2025-2026.json` : **aucune course du plan officiel ne dessert
le Dillendapp le matin.** Les lignes `aller-*` déposent à l'école (arrivée ~07:45 pour un
début de classe à 07:55) et `aller-dillendapp` ne circule qu'à midi.

Conséquence, à traiter explicitement plutôt qu'à deviner :

- Si `dillendappDepuis[jour]` est renseigné, l'enfant **ne prend pas le bus du matin** :
  `trajetsDuJour` n'ajoute pas `aller-matin` et n'inscrit pas ce trajet dans `manquants`
  (ce n'est pas un manque, c'est le parent qui dépose).
- On ajoute à la place une entrée dans `JourneeEnfant` :
  ```ts
  depose?: { lieu: 'dillendapp'; heure: string }
  ```
  symétrique du `recuperation` existant, affichée avec le même encart et exportée dans
  l'ICS comme un rappel du matin.
- La page « Limites » (`src/pages/Infos.tsx`) reçoit un paragraphe : le plan communal ne
  publie aucune desserte Dillendapp → école le matin ; l'application ne l'invente pas.

`periscolaire: false` masque **toute** la mécanique Dillendapp (repas comme présence) :
c'est le cas de la majorité des familles et cela allège d'autant la configuration.

### 3.4 Persistance et partage

- `src/lib/stockage.ts` : `chargerFoyer()` complète déjà les champs ajoutés après coup
  (`repas`, `bus`, `dillendappJusqua`). Ajouter `dillendappDepuis`, `periscolaire`
  (déduit : `true` si un repas `dillendapp` existe déjà, pour ne pas faire disparaître la
  configuration des familles concernées) et `adresses` (défaut : `{}`).
- `src/lib/partage.ts` : passer `VERSION` de 3 à **4**. Le décodeur accepte déjà les
  versions antérieures ; ajouter les deux nouveaux champs en fin de tuple enfant, en
  gardant les adresses dérogatoires sous forme compacte `[libelle, localite, lat, lon]`
  arrondie à 5 décimales comme l'adresse principale. Compléter `src/lib/partage` (aucun
  test dédié aujourd'hui) avec un test aller-retour v4 et un test de lecture d'un lien v1.

**Vérification** : nouveaux tests dans `src/lib/plan.test.ts` — un enfant avec adresse de
retour différente le mardi obtient bien un arrêt de retour différent ce jour-là ; un enfant
avec `dillendappDepuis.lundi` n'a pas de trajet `aller-matin` le lundi et n'a pas
`'aller-matin'` dans `manquants`.

---

## Lot 4 — Écrans de configuration : sections Dillendapp et adresses par jour

> **Fait le 2026-08-08.** Les quatre sections sont livrées, avec les trois actions
> d'état prévues (`definirPeriscolaire`, `definirDillendappDepuis`,
> `definirAdresseJour`). Écarts et ajouts :
>
> - `ChampAdresse` gagne un mode `compact` (pour les dix champs de la grille des
>   adresses) et **la sortie de secours pour les adresses hors commune**, laissée en
>   suspens au lot 3 : quand la recherche ne trouve rien, elle propose de désigner
>   directement l'arrêt utilisé, dans la liste de `src/data/arrets.json`.
> - `definirAdresseJour` retire le jour de la table quand ses deux sens reviennent au
>   domicile, plutôt que d'y laisser un `{ matin: null, soir: null }` qui traînerait
>   ensuite dans le stockage et dans les liens de partage.
> - `ajouterEnfant` renvoie désormais l'identifiant créé, ce dont le lot 5 a besoin
>   pour enchaîner sur l'assistant.
> - Défaut corrigé à la vérification : en mode compact, l'adresse retenue s'affichait
>   **au-dessus** de son propre libellé, donc sous le champ précédent — un retour du
>   soir se lisait comme la réponse à « Part le matin de ».

*Dépend des lots 2 et 3.*

Refonte de `GrilleSemaine.tsx`, qui empile aujourd'hui tout dans une seule grille.

Trois sections distinctes, dans cet ordre :

1. **Repas de midi** — grille jour par jour, bascule maison / Dillendapp, plus les
   raccourcis « toute la semaine » refaits au lot 1. *Affichée seulement si
   `periscolaire`* ; sinon un simple rappel « rentre manger tous les jours ».
2. **Usage du bus** — grille jour par jour (aller-retour / aller / retour / aucun).
3. **Inscription périscolaire (Dillendapp)** — révélée par la case à cocher
   `periscolaire`. Contient, jour par jour, **deux champs horaires** :
   - « présent à partir de » (`dillendappDepuis`) — avant la classe ;
   - « présent jusqu'à » (`dillendappJusqua`) — après la classe (champ existant).
4. **Adresses particulières** — repliée par défaut (`<details>`). Pour chaque jour, deux
   `ChampAdresse` facultatifs (matin, soir) ; vide = domicile du foyer. Un badge « domicile »
   par défaut, remplacé par le libellé quand une dérogation existe.

Nouvelles actions dans `src/etat.tsx`, sur le modèle exact des existantes
(`definirRepas`, `definirDillendappJusqua`) : `definirPeriscolaire`,
`definirDillendappDepuis`, `definirAdresseJour(id, jour, sens, adresse | null)`.

---

## Lot 5 — Assistant de configuration par enfant (wizard)

> **Fait le 2026-08-08.** Route `/enfant/:id/assistant`, six étapes, proposée
> automatiquement à la création d'un enfant et par un bouton sur sa fiche. Écarts :
>
> - Plutôt qu'un dossier `src/composants/assistant/` de six composants qui auraient
>   redit ce que `GrilleSemaine` sait déjà faire, ce dernier **exporte ses sections**
>   (`SectionRepas`, `SectionBus`, `CasePeriscolaire`, `HorairesPeriscolaire`,
>   `SectionAdresses`). `/configurer` les empile, l'assistant les répartit par écran.
>   Une seule définition de chaque grille, donc aucune dérive possible entre les deux.
> - La case `periscolaire` est posée en tête de l'étape « Le midi », qu'elle commande,
>   et non à l'étape suivante : décochée, la question du repas n'a plus d'objet.
>   L'étape des horaires disparaît alors, et l'assistant passe de 6 à 5 étapes.
> - Les actions de fin (imprimer, agenda, partager) sont extraites dans
>   `ActionsEnfant.tsx`, partagé avec la fiche enfant — `Semaine.tsx` ne porte plus sa
>   propre copie de la génération ICS.
> - Défaut corrigé à la vérification : sur l'écran du bus, deux boutons portaient le
>   libellé « Retour » — l'usage du bus et la navigation. Ambigu au clavier comme au
>   lecteur d'écran, en français, en allemand et en luxembourgeois.
>   `onboarding.precedent` devient « Étape précédente ».
> - Les adresses particulières restent sur `/configurer` : la liste des six étapes du
>   plan ne leur donne pas d'écran, et elles ne concernent qu'une minorité de familles.
>
> Vérifié : les six étapes s'enchaînent sans débordement, la progression suit, et
> décocher le périscolaire ramène bien l'assistant à cinq étapes. 10 routes × 3
> largeurs × 2 thèmes = 60 combinaisons, aucun débordement, aucune cible sous 44 px.

*Dépend des lots 2, 3 et 4. Vient **en complément** de `/configurer`, qui reste accessible
pour les réglages fins.*

Nouvelle route `/enfant/:id/assistant`, proposée automatiquement à la création d'un enfant
et par un bouton « Configurer pas à pas » sur la fiche.

Six étapes, une par écran, barre de progression, retour arrière libre, enregistrement à
chaque étape (aucun « annuler » global — l'état est déjà persisté à chaque frappe par
`etat.tsx`) :

1. **L'enfant** — prénom, cycle. Affiche immédiatement le site scolaire déduit.
2. **Où il habite** — adresse du foyer, avec l'arrêt calculé et le temps de marche montrés
   en direct (réutilise `ChampAdresse` et `CarteTrajet`).
3. **Le bus** — une carte par jour : « comment vient-il ? / comment rentre-t-il ? », avec
   un raccourci « pareil tous les jours » en tête d'écran.
4. **Le midi** — rentre manger ou Dillendapp, jour par jour, même raccourci.
5. **Le périscolaire** — la case `periscolaire` puis, si cochée, les heures matin et soir
   par jour. Étape sautée si la case reste décochée.
6. **Récapitulatif** — la semaine calculée, les éventuels trajets manquants, puis les
   actions : imprimer, ajouter à l'agenda, partager.

Un composant `src/composants/Assistant.tsx` porte la coquille (progression, navigation,
gestion clavier) ; chaque étape est un composant dans `src/composants/assistant/`.
Les étapes réutilisent les mêmes actions d'état que `/configurer` — aucune logique
dupliquée, aucun état de brouillon parallèle.

---

## Lot 6 — Installation de l'application (PWA)

> **Fait le 2026-08-08.** Les deux parties sont livrées. Écarts et ajouts :
>
> - `src/installation-contexte.tsx` capte `beforeinstallprompt` au niveau de
>   l'application et expose `invite`, `installee`, `estIOS`, `proposable`,
>   `installer()`, `reporter()` et `noterFicheVue()`.
> - La boîte s'ouvre après **2 visites ou 1 fiche enfant consultée**, jamais avant que
>   le foyer soit configuré, et un refus vaut **30 jours**. Les cinq conditions ont été
>   éprouvées une à une dans le navigateur.
> - Quatre démonstrations SVG écrites à la main dans
>   `src/composants/installation/Demonstrations.tsx`. L'animation est portée par la CSS
>   et non par SMIL : c'est ce qui rend `prefers-reduced-motion` gratuit, la règle
>   globale de la couche `base` ramenant la durée à presque zéro et `forwards` figeant
>   l'image sur la dernière étape — qui est justement l'étape informative.
> - **Défaut trouvé et corrigé** : « Plus tard » fermait la boîte sans mémoriser le
>   refus, qui serait donc revenu à chaque ouverture. Deux causes successives — un
>   `onClose` que React ne relayait pas, puis un effet aux dépendances stables qui ne se
>   rejouait jamais pour trouver la boîte, absente au premier rendu. La boîte est
>   désormais pilotée par l'état, plus par un `close()` impératif.
> - **Défaut trouvé et corrigé** : « Installer l'application » débordait de son panneau
>   dans deux démonstrations. Les quatre démonstrations sont maintenant mesurées dans
>   les cinq langues.
> - L'entrée permanente de la barre basse porte un libellé court : « Installer
>   l'application » ne tient pas dans une case.
>
> **Réserve** : les cinq conditions d'affichage ont été éprouvées avec un
> `beforeinstallprompt` **simulé** — Chrome ne l'émet qu'en production, avec service
> worker. La logique de déclenchement est donc vérifiée, mais ni l'installation réelle,
> ni le comportement de `appinstalled`, ni le geste iOS ne l'ont été. À reprendre sur un
> appareil réel après le prochain déploiement.

*Dépend du lot 2.*

### 6.1 Invitation active

Aujourd'hui, `beforeinstallprompt` n'est capté que si le parent visite `/installer` : la
quasi-totalité ne le fera jamais.

- Capter `beforeinstallprompt` **au niveau de `App.tsx`** et le conserver dans un contexte
  `src/installation-contexte.tsx` (`invite`, `installee`, `installer()`, `reporter()`).
- **Boîte de dialogue** (`<dialog>` natif) proposée automatiquement une fois que le parent
  a réellement commencé à se servir de l'application — condition : foyer configuré **et**
  au moins 2 visites **ou** 1 fiche enfant consultée. Un refus est mémorisé
  (`bus-beckerich.installation-reportee`) et n'est représenté qu'après 30 jours.
- Sur iOS, où `beforeinstallprompt` n'existe pas, la boîte explique le geste
  Partager → « Sur l'écran d'accueil ».
- Entrée permanente et bien visible dans les Réglages et dans la navigation basse tant que
  l'application n'est pas installée.

### 6.2 Documentation illustrée — `src/pages/Installer.tsx`

Remplacer les listes d'étapes textuelles par des **démonstrations animées par plateforme**
(iOS/Safari, Android/Chrome, bureau, Firefox) :

- animations **SVG produites à la main**, pas des captures d'écran — un SVG animé pèse
  quelques kilo-octets, reste net sur tout écran, ne se périme pas à chaque version d'iOS
  et n'oblige pas à embarquer l'interface d'un tiers dans le dépôt ;
- une animation par plateforme, en boucle, dans `src/composants/installation/` ;
- `@media (prefers-reduced-motion: reduce)` fige l'animation sur son état final ;
- la plateforme détectée est mise en avant (`detecter()` existe déjà et gère le cas
  iPadOS), les autres restent accessibles en accordéon ;
- textes réécrits : ce que l'installation apporte concrètement (ouverture hors ligne,
  notifications, pas de barre d'adresse) plutôt que la seule procédure.

---

## Lot 7 — Impression : tous les enfants sur une feuille A4

> **Fait le 2026-08-08.** `src/composants/FicheFoyer.tsx` livré, avec le bouton sur
> l'accueil et sur `/reglages`. Écarts :
>
> - **La bascule en paysage au-delà de 5 enfants n'a pas été faite, volontairement** :
>   elle contredit la règle de pagination par groupes de 4 énoncée juste au-dessus.
>   Une page ne portant jamais plus de 4 colonnes au-delà de 5 enfants, le paysage
>   n'aurait plus rien à corriger — c'était une règle morte.
> - Le corps de texte suit `data-enfants` plutôt qu'une variable CSS posée en ligne :
>   un composant ne porte que des classes, et cinq cas se listent plus vite qu'ils ne
>   se calculent.
> - `FicheImprimable` perd son `aria-hidden="true"`, comme le demandait le §11.3 : la
>   fiche est déjà en `display: none` hors impression, donc absente de l'arbre
>   d'accessibilité, et l'attribut privait de tout contenu qui imprime en PDF pour le
>   relire ensuite.
> - Vérifié par la structure du DOM — 5 enfants sur une page de 6 colonnes, 7 enfants
>   sur deux pages de 4 et 3. **L'aperçu papier lui-même n'a pas pu être contrôlé** :
>   ce navigateur n'expose pas l'émulation du média `print`, et ouvrir la boîte
>   d'impression bloquerait la session.

*Dépend du lot 2.*

### Calcul de capacité

A4 portrait, marges de 12 mm (déjà dans `@page`) : **186 × 273 mm** utilisables.
Mise en page retenue : **un tableau unique, les 5 jours en lignes, un enfant par colonne.**

| Élément | Hauteur |
| --- | --- |
| En-tête (foyer, adresse, date) | 15 mm |
| Ligne d'en-tête du tableau (prénom, cycle, arrêt) | 18 mm |
| 5 lignes de jour | 5 × 34 mm = 170 mm |
| Pied (avertissement, source) | 14 mm |
| **Total** | **217 mm** — tient largement |

La contrainte est la **largeur** : `(186 − 22 mm de colonne « jour ») / N` par enfant.

| Enfants | Largeur/colonne | Verdict |
| --- | --- | --- |
| 1–3 | ≥ 54 mm | Confortable, corps 10 pt |
| 4 | 41 mm | Bon, corps 9,5 pt |
| **5** | **33 mm** | **Limite** — corps 9 pt, suffisant pour `07:25 → 07:45` sur deux lignes |
| 6+ | < 28 mm | Illisible → pagination |

**Règle : jusqu'à 5 enfants sur une page, au-delà on pagine par groupes de 4.** Cinq est
aussi la limite naturelle du domaine (précoce + C1 à C4), donc le cas « 6 enfants » restera
théorique — mais il doit produire deux pages propres, pas une bouillie.

### Mise en œuvre

- Nouveau composant `src/composants/FicheFoyer.tsx` : la fiche multi-enfants, sur le modèle
  de `FicheImprimable.tsx` (qui reste, pour l'impression d'un enfant seul).
- Bouton « Imprimer toute la famille » sur `/reglages` et sur l'accueil. La clé
  i18n `calendrier.tousLesEnfants` existe déjà et sera reprise pour la variante agenda.
- CSS dans la couche `impression` de `src/index.css` : `break-inside: avoid` sur chaque
  ligne de jour, `--enfants` en variable CSS pour piloter le corps de texte, et un
  `@media print` qui bascule en paysage au-delà de 5 enfants.
- Chaque cellule affiche : heure de départ, flèche, heure d'arrivée, nom de ligne en petit ;
  plus les mentions récupération/dépose Dillendapp et les trajets manquants.

**Vérification** : `window.print()` → aperçu PDF avec 1, 3, 5 puis 7 enfants fictifs.

---

## Lot 8 — Espace commune (partie Worker)

> **Fait le 2026-08-08.** `worker/src/commune.js` livré avec ses quatre routes, plus
> `worker/creer-agent.sh` et la section d'ADMIN.md. 28 tests. Écarts et ajouts :
>
> - `validerPlan()` est bien **importé** depuis `src/lib/validation.ts` par le Worker,
>   comme demandé : vérifié par `wrangler deploy --dry-run`, esbuild résout le
>   TypeScript et les imports JSON sans configuration.
> - En revanche, `src/lib/github.ts` **n'a pas pu être partagé** : il importe
>   `src/config.ts`, qui lit `import.meta.env` et n'existe donc pas hors de Vite.
>   `worker/src/github.js` reprend le strict nécessaire, avec le dépôt en variable
>   d'environnement plutôt qu'en constante compilée.
> - Le CORS des routes `/commune/*` vérifie l'origine contre `ORIGINES_AUTORISEES`.
>   Les routes existantes gardent leur `cors()` permissif : leur reprise est
>   explicitement au lot 11, et les mélanger aurait brouillé les deux lots.
> - `publiePar` est toujours pris dans la session, jamais dans la charge : un client
>   ne choisit pas la signature de sa publication.
> - Le script engendre le code en base 32 sans caractères ambigus (ni 0/O, ni 1/l/I) :
>   un code se dicte au téléphone.
>
> **Réserves** : rien n'a tourné contre Cloudflare ni GitHub. Les 29 tests s'appuient sur
> un KV en mémoire, `worker/src/github.js` n'a jamais émis d'appel réel, et
> `creer-agent.sh` n'a été vérifié que par `bash -n`, jamais exécuté. Par ailleurs, la
> limitation de débit repose sur la cohérence **différée** de KV : en cas de requêtes
> concurrentes, quelques tentatives de plus passeront — sans commune mesure avec les
> milliers qu'exigerait une force brute, mais le comportement n'est pas strict.

*Indépendant des lots 1 à 7. Peut être lancé en parallèle.*

Objectif : un agent communal publie une alerte **sans compte GitHub et sans voir de JSON**.

### 8.1 Authentification par code d'accès — `worker/src/`

Le Worker Cloudflare détient déjà un espace KV (`ABONNEMENTS`) et les secrets. On lui
ajoute le rôle de **publieur**.

Nouveau module `worker/src/commune.js` :

- `POST /commune/connexion` — corps `{ code }`. Le Worker compare le code à ceux stockés
  en KV sous `agent:<empreinte>` (valeur : `{ nom, service, cree, dernierAcces }`).
  - comparaison **à temps constant** (le code n'est jamais comparé par `===` sur la chaîne
    brute : on compare les empreintes SHA-256) ;
  - **limitation de débit** en KV par IP : 5 tentatives / 15 min, puis 429. Sans cela, un
    code à 8 caractères se force en quelques heures ;
  - en cas de succès, émission d'un **jeton de session signé** (HMAC-SHA-256 avec un secret
    `SECRET_SESSION`, durée 8 h, contenant `nom`, `service`, `expire`). Renvoyé dans le
    corps JSON, stocké côté navigateur en `sessionStorage` — même politique que le jeton
    GitHub actuel dans `Admin.tsx`.
- `POST /commune/perturbations` et `DELETE /commune/perturbations/:id` — vérifient le
  jeton de session, **valident intégralement la charge côté Worker** (voir lot 11), puis
  écrivent `public/urgences.json` via l'API GitHub avec le secret `GITHUB_PAT` (jeton
  *fine-grained*, portée : contenu en écriture, **ce dépôt uniquement**). Le message de
  commit porte l'auteur réel : `Urgence : annulation — publié par Marie (service technique)`.
  La relecture-avant-écriture avec `sha` (déjà implémentée dans `src/lib/github.ts`) est
  reproduite côté Worker pour ne pas écraser une publication concurrente.
- `POST /commune/horaires` — même mécanique, mais écrit `src/data/plan-2025-2026.json`.
  **Le Worker revalide le plan complet avant d'écrire** en réutilisant `validerPlan()` :
  extraire `src/lib/validation.ts` en module partagé importable par le Worker (il ne dépend
  que de `arrets` et `cycles`, donc de `src/data/`), plutôt que d'en écrire une seconde
  version qui divergera.
- `GET /commune/journal` — les 50 dernières actions (KV, préfixe `journal:`), pour que
  chacun voie ce qui a été publié et par qui.

Gestion des codes : commande `npx wrangler kv key put` documentée dans `ADMIN.md`, plus un
script `worker/creer-agent.sh` qui engendre un code lisible (format `xxxx-xxxx`), en stocke
l'empreinte et affiche le code une seule fois.

### 8.2 Conséquences

- La connexion GitHub OAuth reste pour `/admin` (le mainteneur), qui garde les outils
  avancés (correction d'arrêts sur carte, édition du plan complet).
- `ADMIN.md` gagne une section « Donner accès à un agent communal » (la section
  « Donner accès à la commune » existante est réécrite).
- `worker/wrangler.toml` : nouveaux secrets `GITHUB_PAT`, `SECRET_SESSION`, documentés en
  commentaire comme les précédents.

---

## Lot 9 — Espace commune (partie interface)

> **Fait le 2026-08-08.** Les trois pages sont livrées : `/commune`, `/commune/alertes`
> et `/commune/horaires`, plus `src/lib/commune.ts` qui parle au Worker. Écarts et
> ajouts :
>
> - **Incohérence trouvée entre le lot 8 et l'application** : le Worker validait un
>   type de perturbation `information` que `TypePerturbation` ne connaît pas — le
>   quatrième type s'appelle `message`. Le Worker aurait donc refusé les perturbations
>   de l'application, et accepté un type que personne n'aurait su afficher. Corrigé des
>   deux côtés, avec un test qui énumère les quatre types.
> - Le formulaire guidé réutilise la coquille `Assistant` du lot 5 : progression,
>   navigation et gestion du focus sont déjà écrites, il aurait été absurde de les
>   refaire.
> - `useBlocageRechargement` est branché sur les deux pages, comme le §1.4 le prévoyait :
>   une annonce à moitié tapée ne doit pas disparaître sous un rechargement automatique.
> - Le diff d'horaires se lit bien en langage naturel — « Aller — Bus 1 · Matin ·
>   Noerdange · Gare : 07:28 → 07:35 » — et une heure ramenée à sa valeur d'origine
>   disparaît de la liste plutôt que d'y figurer comme un changement nul.
> - La validation locale par `validerPlan()` sert à montrer les problèmes tout de suite ;
>   c'est celle du Worker qui fait autorité, et les deux appellent la même fonction.
> - Le jeton de session vit en `sessionStorage` : fermer l'onglet suffit à se
>   déconnecter d'un poste partagé.
>
> **Ce qui n'a pas pu être vérifié** : aucun aller-retour réel avec le Worker. Les
> pages ont été éprouvées avec une session simulée et un Worker injoignable — le
> rendu, la navigation, le diff et le message d'erreur réseau sont bons, mais la
> connexion par code et la publication effective attendent le déploiement.
>
> **Reporté au lot 10, volontairement** : la modification temporaire d'horaire qui
> produirait une perturbation de type `retard` depuis l'écran des horaires. Le §9 la
> mentionne, mais l'écran des alertes la couvre déjà, et la dupliquer aurait fait deux
> chemins vers le même résultat.

*Dépend des lots 2 et 8.*

Deux pages distinctes, volontairement séparées : un agent qui vient annoncer une annulation
ne doit jamais tomber sur l'éditeur d'horaires.

### `/commune` — connexion

Un seul champ (le code), gros, en `inputmode` adapté, avec message d'erreur en clair
(« code inconnu » / « trop de tentatives, réessaie dans 12 minutes »). Aucune mention de
GitHub, de JSON ni de jeton.

### `/commune/alertes` — annoncer une perturbation

Reprise de la logique de `Admin.tsx` (`brouillon()`, `ResumePerturbation`), réécrite en
**formulaire guidé** :

- **Étape 1 — Que se passe-t-il ?** Quatre grandes cartes cliquables :
  « Un bus est annulé » · « Un bus a du retard » · « Un arrêt est déplacé » ·
  « Une information à faire passer ».
- **Étape 2 — Qui est concerné ?** Ligne, course et arrêt en listes déroulantes déjà
  alimentées par `plan.lignes` et `arrets` — jamais d'identifiant technique à l'écran,
  seulement les noms lisibles (`nomArret`, `ligne.nom`).
- **Étape 3 — Quand ?** Boutons « aujourd'hui » / « aujourd'hui et demain » / « choisir des
  dates », plutôt que deux champs date nus.
- **Étape 4 — Message et gravité.** La gravité est exprimée en conséquences
  (« information » / « à savoir avant de partir » / « urgent, prévenir tout le monde »),
  pas en jargon.
- **Étape 5 — Aperçu et publication.** Ce que verront les parents, à l'identique, plus
  un rappel du délai de mise en ligne.

Sous le formulaire : la liste des perturbations en cours avec un bouton « retirer » par
ligne (confirmation explicite).

### `/commune/horaires` — modifier un horaire

**Aucun JSON à l'écran.** Vue tabulaire : ligne → course → arrêts, chaque heure étant un
champ `type="time"` modifiable.

- **Modification temporaire** : produit une perturbation de type `retard` (ou une
  annulation de course) dans `urgences.json` — réversible, sans reconstruction du site.
- **Modification définitive** : modifie `src/data/plan-2025-2026.json` via
  `POST /commune/horaires`. Écran de confirmation montrant un **diff lisible en langage
  naturel** (« Aller — Bus 2, matin, arrêt Hovelange : 07:32 → 07:35 »), les problèmes
  remontés par `validerPlan()` traduits en français simple, et un avertissement que le site
  sera reconstruit (une à deux minutes).

Le bloc `AdminPlan.tsx` (coller du JSON) **reste** sur `/admin`, réservé au mainteneur.

---

## Lot 10 — Notifications répétées pour les perturbations majeures

> **Fait le 2026-08-08.** `worker/src/rappels.js` et son cron sont livrés, avec le
> réglage parent et le champ `rappels` côté commune. 20 tests dédiés. Écarts et
> corrections :
>
> - **Le créneau cron du texte ci-dessous est faux.** `*/15 5-9 * * 1-5` est en UTC,
>   alors que les rappels sont écrits en heure locale : 06:45 à Beckerich vaut 04:45
>   UTC l'été, donc **hors de la fenêtre**. Le rappel le plus utile n'aurait jamais
>   été envoyé la moitié de l'année. Remplacé par `*/15 4-14 * * 1-5`, assez large
>   pour couvrir les deux régimes horaires, et toute la décision est prise en heure
>   locale via `Intl` avec `Europe/Luxembourg`.
> - Quand plusieurs créneaux sont échus d'un coup — cron manqué, déploiement en cours
>   de matinée — un seul rappel part, celui du créneau le plus proche. Les autres sont
>   marqués comme consommés : trois notifications d'affilée seraient pires que le
>   silence.
> - Une perturbation sans course précisée est rappelée avant **tous** les départs, du
>   matin comme de l'après-midi : on ne devine pas qu'elle ne concerne que la matinée.
> - L'état est écrit **après** l'envoi : si le Worker tombe entre les deux, le rappel
>   repart au cron suivant plutôt que de disparaître en silence.
> - Le réglage parent réutilise `/abonner` au lieu d'une route de plus : la clé y étant
>   dérivée du endpoint, l'enregistrement est remplacé et non dupliqué.
> - **Conséquence assumée du réglage par défaut** (`urgences + rappels`) : une
>   perturbation d'information ou d'attention **ne fait plus sonner les téléphones**,
>   alors qu'elle le faisait jusqu'ici. Le bandeau dans l'application la montre déjà à
>   l'ouverture, et réserver la sonnerie aux alertes est ce qui lui garde son sens. Le
>   choix « Tout » rétablit l'ancien comportement.
>
> **Réserves** : aucun rappel réel n'a été envoyé. Le planificateur est couvert par 20
> tests, mais le cron n'a jamais tourné, `URL_SITE` n'a jamais été lu, et le filtre par
> préférence n'a jamais été exercé sur un vrai abonnement. Par ailleurs, le sélecteur de
> préférence n'a pas pu être vu à l'écran : il n'apparaît qu'une fois les notifications
> réellement actives, ce qui exige d'accorder la permission du navigateur.

*Dépend du lot 8 pour la partie Worker.*

Aujourd'hui, `.github/workflows/notifier.yml` envoie **une** notification par perturbation
nouvellement ajoutée. Une annulation publiée à 6 h 40 est manquée par tous ceux qui dorment
encore.

- Nouveau champ sur `Perturbation` (`src/lib/urgences.ts`) : `rappels?: number` — nombre de
  rappels souhaités, proposé automatiquement à `gravite: 'alerte'`.
- Le Worker gagne un **Cron Trigger** (`[triggers] crons = ["*/15 5-9 * * 1-5"]` dans
  `wrangler.toml`) qui, aux créneaux utiles, relit `urgences.json` et renvoie les
  perturbations de gravité `alerte` encore actives et pas encore rappelées le nombre de
  fois demandé. L'état des rappels vit en KV (`rappel:<id>` → compteur + dernier envoi).
- **Intervalles cohérents** — un rappel n'a de valeur qu'avant le départ à l'arrêt :
  - à la publication (immédiat, comportement actuel) ;
  - puis à **06:45**, **07:15** et **07:40** le jour concerné, uniquement pour une
    perturbation du matin ;
  - pour une perturbation de l'après-midi ou du soir, à **11:15** et **15:00** ;
  - **jamais plus de 3 rappels**, jamais entre 21 h et 6 h, jamais un jour sans école
    (`etatDuJour()` de `src/lib/calendrier.ts` est réutilisé côté Worker).
- Le corps du rappel diffère du premier envoi (« Rappel : le bus de 07:25 est toujours
  annulé »), sans quoi les téléphones les regroupent silencieusement.
- Côté parent : un réglage dans `Notifications.tsx` — « seulement les urgences » /
  « urgences + rappels » (défaut) / « tout ».

**Vérification** : tests unitaires du planificateur de rappels (créneaux, plafond, jours
sans école) dans `worker/src/rappels.test.js`, sur le modèle de `worker/src/push.test.js`.

---

## Lot 11 — Sécurité et nettoyage des entrées

> **Fait le 2026-08-08.** `src/lib/nettoyage.ts` livré et branché sur les deux entrées
> exposées, CSP posée, CORS du Worker corrigé, `npm audit` en intégration continue.
> 243 tests. Écarts et corrections :
>
> - **La CSP est engendrée à la construction**, dans `vite.config.ts`, et non écrite en
>   dur dans `index.html` : elle doit contenir l'origine du Worker, connue seulement au
>   build.
> - **`frame-ancestors` a été volontairement omise.** La spécification l'ignore en
>   balise `<meta>` — elle n'a d'effet qu'en en-tête HTTP, que GitHub Pages ne permet
>   pas. L'écrire aurait donné une fausse impression de protection.
> - **`style-src` autorise `'unsafe-inline'`.** Leaflet et le service worker injectent
>   des styles ; une politique qui casse la carte protégerait surtout les parents de
>   leur propre application. Les `style={{ … }}` des composants ayant disparu au lot 2,
>   c'est la seule concession.
> - Les caractères indésirables sont filtrés par propriétés Unicode (`\p{Cc}`,
>   `\p{Cf}`) et non par une liste de points de code : cette liste aurait été écrite
>   avec les caractères eux-mêmes, donc invisible dans l'éditeur comme dans une revue —
>   précisément le défaut qu'ils servent à exploiter.
> - `dateIsoValide` reconstruit la date et vérifie qu'elle se réécrit à l'identique :
>   l'expression régulière seule laissait passer un 31 février.
> - **Le CORS du Worker renvoyait l'origine de la requête telle quelle** sur `/abonner`
>   et `/desabonner` : n'importe quel site pouvait faire désabonner un parent depuis son
>   navigateur. Il compare désormais à `ORIGINES_AUTORISEES`.
> - `chargerUrgences()` valide chaque perturbation séparément et **ignore les entrées
>   invalides sans emporter les autres** : une faute de frappe dans le fichier ne doit
>   pas priver les parents de toutes les annonces.
> - `decoderFoyer()` refuse le lien **entier** quand le foyer n'a pas de coordonnée
>   valable, mais se contente d'ignorer une adresse dérogatoire aberrante : sans
>   domicile il n'y a aucun trajet à calculer, alors qu'un jour dérogatoire en moins
>   laisse une configuration utilisable.
> - Les deux points déjà traités ailleurs sont confirmés faits : le jeton *fine-grained*
>   est documenté dans `ADMIN.md` (lot 8), et l'`aria-hidden` de `FicheImprimable` a été
>   retiré (lot 7).
>
> **Réserve** : la CSP a été éprouvée sur le build local servi par `vite preview` —
> carte OpenStreetMap, service worker, QR code et navigation sur sept routes, sans une
> seule violation. Elle n'a **pas** été vérifiée sur GitHub Pages, où le chemin de base
> et l'origine diffèrent. Une violation s'y traduirait par une carte vide ou un service
> worker inerte, pas par un message visible.

*Indépendant, mais à faire **après** le lot 8, dont il durcit les points d'entrée.*

Passe complète. Points identifiés à l'audit du code actuel :

### 11.1 En-têtes et politique de contenu

GitHub Pages ne permet pas de définir d'en-têtes HTTP : poser une **CSP par balise
`<meta http-equiv>`** dans `index.html`, autorisant strictement : `'self'`, les tuiles
`*.tile.openstreetmap.org`, l'origine du Worker, et `gc.zgo.at` (GoatCounter, déjà chargé).
`object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Vérifier que Vite
n'injecte pas de style inline incompatible.

### 11.2 Validation de toute donnée entrante

Créer `src/lib/nettoyage.ts`, unique point de passage :

- `texteSur(valeur, max)` — force le type chaîne, `normalize('NFC')`, retire les caractères
  de contrôle et les marques de direction bidirectionnelle (un `U+202E` dans un prénom
  inverse l'affichage de toute une ligne), effondre les espaces, tronque à `max`.
- `coordValide([lat, lon])` — nombres finis, dans la boîte englobante du Luxembourg.
- `heureValide('HH:MM')` — l'expression `HEURE` de `validation.ts` est réutilisée.
- `dateIsoValide('AAAA-MM-JJ')`.

Points d'application :
- **`src/lib/partage.ts` / `decoderFoyer()`** — c'est l'entrée la plus exposée : n'importe
  qui peut faire ouvrir un lien. Aujourd'hui `prenom`, `libelle` et `localite` sont repris
  tels quels et les coordonnées ne sont vérifiées que par `typeof === 'number'` (`NaN` passe).
  Valider champ par champ, plafonner le nombre d'enfants (10) et la longueur des prénoms
  (40), rejeter le lien entier en cas d'anomalie plutôt que d'importer à moitié.
- **`src/lib/urgences.ts` / `chargerUrgences()`** — le fichier est relu à chaque ouverture ;
  valider chaque perturbation (types, dates, `minutes` bornées à 1–120, message ≤ 200
  caractères) et **ignorer les entrées invalides** sans faire tomber le reste.
- **Formulaires `/commune` et `/admin`** — validation à la saisie **et** revalidation côté
  Worker. Ne jamais faire confiance au client, même « le nôtre ».
- **`worker/src/`** — taille de corps maximale sur chaque route, `Content-Type` vérifié,
  `JSON.parse` toujours dans un `try`.

### 11.3 Points ciblés

- **CORS du Worker** : `cors(origine)` renvoie l'origine de la requête telle quelle, ce qui
  autorise de fait tout le monde sur `/abonner` et `/desabonner`. La remplacer par une
  vérification contre `ORIGINES_AUTORISEES`, déjà présent dans la configuration et déjà
  utilisé correctement par `retourAutorise()`.
- **Jeton GitHub OAuth** : la portée `repo` demandée par `demarrerOAuth` est très large.
  Avec le lot 8, l'agent communal n'en a plus besoin ; documenter dans `ADMIN.md` que le
  mainteneur passe de préférence par un jeton *fine-grained* saisi à la main (le champ
  existe déjà dans `Admin.tsx`).
- **`FicheImprimable`** porte `aria-hidden="true"` tout en contenant l'information ; à
  revoir au lot 7 pour que le contenu imprimé reste accessible aux lecteurs d'écran.
- **`escape` de l'ICS** : `echapper()` traite `,`, `;`, `\` et `\n`, mais pas `\r`. Un
  prénom collé depuis Windows peut casser le fichier. Corriger.

### 11.4 Contrôle continu

Ajouter au workflow `deploy.yml`, avant `construction` : `npm audit --audit-level=high`.

**Vérification** : `npm test` (nouveaux tests de `nettoyage.ts` et de `decoderFoyer` sur
des liens malformés), puis vérification manuelle qu'un lien de partage trafiqué
(coordonnées hors zone, prénom de 5 000 caractères, `U+202E`) est refusé proprement.

---

## Lot 12 — Agenda : ICS amélioré et architecture d'export

> **Fait le 2026-08-08.** L'export est isolé dans `src/lib/agenda/` autour d'une
> représentation intermédiaire `EvenementRecurrent`, et `calendrier.ts` retrouve une
> seule responsabilité — savoir s'il y a école. Écarts et ajouts :
>
> - L'export « toute la famille » produit **un seul fichier** : trois enfants voulaient
>   dire trois calendriers à activer, masquer et supprimer séparément.
> - Le regroupement des trajets tient compte des **arrêts**, pas seulement de la ligne
>   et de l'heure : une adresse dérogatoire change le lieu du rendez-vous ce jour-là, et
>   un agenda qui annoncerait le mauvais arrêt serait pire qu'aucun agenda.
> - Nouvelle page `/agenda` : ce qu'il faut faire du fichier une fois téléchargé, avec
>   une démonstration animée par plateforme. Sans elle, le bouton produisait un fichier
>   que beaucoup de parents ne retrouvaient jamais.
> - `lienGoogleAgenda()` est supprimé, ainsi que ses clés i18n.
> - Les tests ICS déménagent avec le code qu'ils couvrent, dans
>   `src/lib/agenda/agenda.test.ts`.
>
> **Réserve** : aucun fichier `.ics` produit par la nouvelle chaîne n'a été importé dans
> un vrai agenda. Les 27 tests vérifient la structure du texte, pas qu'Apple Calendrier
> ou Google l'acceptent.

*Dépend du lot 3 (les adresses par jour changent les lieux des événements).*

- **Isoler l'export** : `src/lib/calendrier.ts` mélange calendrier scolaire et génération
  ICS. Extraire la partie export vers `src/lib/agenda/` avec une représentation
  intermédiaire commune — `EvenementRecurrent { titre, lieu, debut, duree, jours, exclusions,
  rappel }` — puis un producteur `versIcs()`. C'est cette représentation que le lot 13
  branchera sur l'API Google, sans réécrire le calcul.
- **Export « toute la famille »** : un seul `.ics` contenant tous les enfants
  (`calendrier.tousLesEnfants` existe déjà en i18n).
- **Assistant d'import** par plateforme (iOS, Android, Google Agenda web, Outlook), avec
  les mêmes animations SVG que le lot 6.
- **Retirer** les liens « autre agenda » : `lienGoogleAgenda()` est déjà signalé comme
  inférieur au `.ics` dans son propre commentaire (Google gère mal `EXDATE` dans une URL de
  modèle). Le supprimer plutôt que de l'entretenir.
- Prendre en compte les nouveautés du lot 3 : dépose du matin au Dillendapp, adresses
  dérogatoires (le `LOCATION` change ce jour-là).

---

## Lot 13 — Intégration Google Agenda (activable)

> **Fait le 2026-08-08, mais INACTIF.** `src/lib/agenda/google.ts` livré : OAuth PKCE
> dans l'onglet, portée `calendar.app.created`, un agenda dédié par enfant,
> identifiants d'événements stables pour que la resynchronisation remplace au lieu de
> dupliquer. Le bloc n'apparaît dans `/agenda` que si `VITE_ID_CLIENT_GOOGLE` est
> défini — vérifié : sans lui, aucun bouton de connexion n'existe.
>
> - La CSP a dû être élargie à `oauth2.googleapis.com` et `www.googleapis.com` en
>   `connect-src`, et `accounts.google.com` en `form-action`.
> - `PUT` sur un identifiant dérivé de l'enfant et du trajet, et non `POST` : sans cela,
>   chaque resynchronisation aurait créé un doublon.
>
> **Réserves** : le prérequis à ta charge — projet Google Cloud, API Calendar activée,
> ID client OAuth « application web », écran de consentement publié pour la portée
> `calendar.app.created` — **n'est pas fait**. Rien de ce module n'a donc jamais tourné :
> ni le flux PKCE, ni la création d'agenda, ni l'écriture d'un événement. C'est du code
> écrit contre une documentation, pas contre un serveur.

*Dépend du lot 12. À lancer quand l'ID client Google Cloud existe.*

- Prérequis à ta charge : créer un projet Google Cloud, activer l'API Calendar, créer un
  **ID client OAuth de type « application web »** (l'ID client est public, il n'y a pas de
  secret à protéger), publier l'écran de consentement pour la portée
  `https://www.googleapis.com/auth/calendar.app.created`. Cette portée **restreint l'accès
  aux agendas créés par l'application** : elle ne donne aucun droit sur l'agenda personnel
  existant, ce qui est exactement la garantie recherchée.
- Flux **OAuth PKCE côté navigateur** : le jeton reste dans l'onglet, rien ne transite par
  le Worker ni par GitHub Pages. Aucune donnée familiale ne quitte l'appareil autrement que
  vers Google, à la demande explicite du parent.
- L'application crée **un agenda dédié par enfant** — « Bus scolaire — Léa » — et y insère
  les `EvenementRecurrent` du lot 12 en événements récurrents (`RRULE` + `EXDATE` vacances).
  Conséquence directe de la demande : le parent peut masquer, modifier ou **supprimer tout
  l'agenda d'un geste**, sans toucher au sien.
- **Resynchronisation** : un bouton « mettre à jour l'agenda » remplace les événements de
  l'agenda dédié (identifiants d'événements stables dérivés de l'enfant et du trajet, comme
  les `UID` ICS actuels) — utile après un changement de cycle ou de plan.
- Nouvelle variable de build `VITE_ID_CLIENT_GOOGLE`, sur le modèle de `VITE_URL_WORKER` :
  vide, la fonctionnalité disparaît de l'interface et l'ICS reste seul, exactement comme
  `notificationsConfigurees()` le fait déjà.

---

## Lot 14 — Reprise de l'assistant et de la présence au Dillendapp

> **Fait le 2026-08-08.** Signalé en usage réel sur iPhone. Livré : bornes d'heures
> calculées par cycle depuis le plan de bus, deux inscriptions au Dillendapp au lieu
> d'une, adresse de midi, raccourcis « toute la semaine » remontés en tête, horaires en
> deux blocs d'une colonne, adresse du foyer verrouillée dès le deuxième enfant, actions
> retirées de l'assistant. Écarts :
>
> - **Le retour de midi ne suit plus l'adresse du soir.** Une famille qui déclarait
>   seulement « revient le soir chez la nounou » voyait aussi son retour de midi partir
>   là-bas. Désormais le midi revient au domicile sauf adresse de midi explicite. C'est
>   la lecture fidèle du libellé, mais cela change le calcul de configurations
>   existantes. Couvert par deux tests.
> - **Défaut trouvé en route et corrigé** : un enfant déposé au Dillendapp à 07:45 se
>   voyait proposer la navette de 07:38, déjà partie. `liaisons()` accepte désormais un
>   seuil `apres`.
> - **La case unique est conservée en lecture** (`Enfant.periscolaire`, marquée
>   `@deprecated`) : les configurations enregistrées et les liens de partage antérieurs
>   la portent, et `deduireInscriptions()` en tire les deux nouvelles.
> - **L'étape 5 disparaît toujours** quand la case hors-midi est décochée, mais le total
>   annoncé reste 7 : le repère ne bouge plus sous les pieds du parent.
> - **Idée B abandonnée** après mesure, voir R6 rayée.
>
> Vérifié : 312 tests (dont 9 nouveaux sur les bornes, 4 sur les deux inscriptions,
> 3 sur l'adresse de midi, 9 de composant sur l'assistant — les premiers du dépôt) ;
> mesures DOM à 390 px sur les cinq étapes touchées ; lien de partage v4 relu.
>
> **Réserves** : R16.

*Dépend des lots 3, 4 et 5.*

Sept points relevés après usage : raccourcis hebdomadaires sous les grilles, deux
explications d'horaires empilées et illisibles sur iPhone, heures non bornées, adresses
dérogatoires en contradiction avec la présence au Dillendapp, actions dupliquées en fin
d'assistant, adresse du foyer modifiable depuis l'assistant de n'importe quel enfant, et
un modèle d'adresses qui ignore le déjeuner ailleurs qu'à la maison.

### 14.1 Amplitude d'accueil — `src/data/ecoles.json`, `src/lib/types.ts`

`maisonRelais.horaires` : ouverture, fermeture, marge avant bus. Les bornes ne sont pas
des constantes du code.

### 14.2 Bornes par cycle — `src/lib/plan.ts`

`bornesDillendapp(ctx, jour)` lit le dernier départ Dillendapp → école du cycle et en
retranche la marge ; à défaut de navette, le début des cours. Le soir, l'arrivée du bus
fait le plancher. `ajusterDillendapp()` écrête au changement de cycle.

### 14.3 Deux inscriptions — `src/lib/types.ts`, `src/lib/plan.ts`

`periscolaireMidi` et `periscolaireHorsMidi`. `RechercheOptions.repas` devient
`inscritDillendapp` : une desserte réservée aux inscrits reste ouverte à l'enfant qui
n'est là qu'en dehors du midi.

### 14.4 Adresse de midi — `src/lib/types.ts`, `src/lib/plan.ts`

`AdresseJour.midi`, `ArretsDuJour.midi`. Proposée seulement les jours avec cours
l'après-midi où l'enfant ne déjeune pas au Dillendapp.

### 14.5 Migrations — `src/lib/stockage.ts`, `src/lib/partage.ts`

Lien de partage en version 5 : second drapeau d'inscription, adresses en triplets
`[matin, midi, soir]`. Les versions 1 à 4 restent lisibles.

### 14.6 à 14.8 Écrans et invariants

Assistant, grilles, et `etat.tsx` où se ferment les contradictions : une heure de dépose
efface l'adresse du matin, une récupération un mardi force le repas au Dillendapp.

### 14.9 à 14.13 Ménage et couverture

Regex `HEURE` factorisée, récapitulatif Dillendapp sur la fiche, compteur au repli des
adresses, et `src/pages/AssistantEnfant.test.tsx`.

---

## Lot 15 — Traductions modifiables sans reconstruction

> **Fait le 2026-08-08.** Livré : `public/traductions.json` en surcouche relue à chaque
> ouverture, éditeur commun à `/admin` et au nouvel espace `/traductions`, rôle distinct
> côté Worker, et `/admin` passé en onglets. Écarts :
>
> - **`chargerTraductions` vit dans `src/i18n/surcouche.ts`**, pas dans
>   `src/lib/traductions.ts` : ce dernier est importé par le Worker, qui n'a ni `fetch`
>   vers le site ni `import.meta.env`.
> - **Deux barrières, pas une** entre les espaces : préfixe KV (`agent:` contre
>   `traducteur:`) et rôle inscrit dans le jeton signé. Un jeton d'avant les rôles est lu
>   comme un jeton de commune, pour ne pas déconnecter une session en cours.
> - **Scintillement assumé** : le premier rendu utilise les dictionnaires du bundle, qui
>   sont complets ; la surcouche ne fait que corriger.
> - **`/traductions` ne touche pas aux crédits.** Un traducteur ne s'ajoute pas lui-même.
>
> Vérifié : 15 tests sur les règles de la surcouche, 8 sur les onglets, 4 sur la
> séparation des rôles ; `globIgnores` et `runtimeCaching` posés — le build reste à
> 18 entrées préchargées, donc la surcouche n'est pas figée.
>
> **Réserves** : R17, R18.

*Dépend du lot 8 pour le Worker, du lot 11 pour la validation des entrées.*

Corriger une tournure allemande demandait un commit et un redéploiement, donc l'auteur.

### 15.1 Surcouche — `public/traductions.json`, `src/lib/traductions.ts`

Clés pointées et plates. Une correction doit viser une clé qui existe en français, du
même type, avec exactement les mêmes marqueurs `{…}`. Une entrée refusée est ignorée,
les autres s'appliquent.

### 15.2 à 15.5 Éditeur, rôle et hôtes

`EditeurTraductions` avec le français en référence et le motif de refus affiché à la
saisie ; `routerTraductions` côté Worker ; `Onglets` générique, l'onglet actif dans la
query string.

---

## Lot 16 — Crédits et remerciements

> **Fait le 2026-08-08.** Livré : `src/data/credits.json`, page `/credits` liée depuis
> les réglages, éditeur en cinquième onglet d'`/admin`. Écarts :
>
> - **Fichier du bundle, pas surcouche** : une page de crédits doit s'afficher hors
>   ligne, et elle change quelques fois par an. Sa publication déclenche donc une
>   reconstruction, ce que l'éditeur annonce.
> - **Un `lien` n'est rendu cliquable que s'il est en `http(s)`.** C'est le seul endroit
>   du projet où du texte saisi dans une page web devient une URL sur une page publique.
> - **Une langue sans traducteur déclaré n'affiche pas de bloc vide** : cela se lirait
>   comme un oubli plutôt que comme une absence.
>
> Vérifié : 9 tests, dont le refus d'un `javascript:` ; page mesurée à 390 px.

*Dépend du lot 15 pour les onglets d'`/admin`.*

Trois sections : développement, traductions par langue, remerciements. Le fichier porte
des noms de tiers : seuls ceux dont l'accord est acquis y figurent, et la page le dit.

---

## Lot 17 — Notifications prioritaires, et ce qu'elles ne remplacent pas

> **Fait le 2026-08-08.** Livré : en-tête `Urgency` de la RFC 8030, TTL calculé sur la
> fenêtre de pertinence, vibration sur les alertes, marche à suivre par plateforme après
> activation, et encart d'honnêteté permanent. Écarts :
>
> - **Rien sur WhatsApp.** Envoyer un message supposerait de confier le numéro de chaque
>   parent à un serveur et à Meta : cela romprait le principe n° 1. Décision de l'auteur.
> - **Aucune application web ne peut se déclarer prioritaire d'elle-même** : le niveau
>   « temps réel » d'iOS est réservé aux applications natives, et le canal Android
>   appartient au navigateur. Tout ce qui pouvait l'être l'est au niveau du transport ;
>   le reste est écrit noir sur blanc à l'écran.
> - **Notification d'essai** d'abord écartée du périmètre, puis livrée le 2026-08-09
>   avec les correctifs ci-dessous. R20 rayée.
> - Ajouté au passage, hors plan initial : l'avertissement du site officiel sur les
>   horaires indicatifs, repris mot pour mot sur `/plan`, `/limites` et la fiche enfant.
>
> Vérifié : 61 tests du Worker, dont deux nouveaux sur `Urgency`.
>
> **Réserves** : R19.

*Indépendant des lots 14 à 16.*

Un bus annulé est une information dont dix minutes de retard changent la valeur. La
requête push ne portait aucun en-tête d'urgence, et rien n'expliquait au parent comment
faire sortir ces notifications du lot sur son téléphone.

---

## Correctifs du 2026-08-09

> **Fait le 2026-08-09**, après la mise en production des lots 14 à 17. Quatre défauts
> relevés en relisant ce qui venait d'être déployé, dont aucun n'était propre aux
> nouveaux lots.

*Ne dépend de rien : chacun se tient seul.*

### Un espace non activé le disait mal

Sans `SECRET_SESSION`, le Worker répond 503 à tout `/commune/*` et `/traductions/*` —
mais `src/lib/commune.ts` ne traduisait pas ce motif : l'agent lisait « la publication a
échoué, réessayez dans un instant » devant un serveur qui ne serait jamais prêt. Motif
`non-activee` ajouté, et les deux écrans de connexion partagent désormais un `cleErreur()`
au lieu de trois ternaires imbriqués qu'il fallait penser à corriger des deux côtés.

### Une perturbation publiait tout ce qu'on lui donnait

`publierPerturbation` recopiait la charge par `...charge.perturbation` : n'importe quel
champ envoyé par un client — le nôtre ou un `curl` porteur d'une session valide — partait
tel quel dans `public/urgences.json`, donc dans un fichier public du dépôt. L'application
l'aurait ignoré à la lecture ; il aurait tout de même été publié. Liste blanche
`CHAMPS_PERTURBATION`, et `rappels` — que le client envoyait sans que personne le valide —
borné entre 0 et 3, puisque chacun commande un envoi répété à toutes les familles.

### Le journal ne rendait de comptes à personne

`GET /commune/journal` existe depuis le lot 8, `lireJournal()` était exportée, et aucune
page ne l'appelait. Un journal que personne ne peut lire ne sert à rien : il s'affiche
maintenant, replié, sur `/commune`.

### Notification d'essai

Voir R20, rayée.

---

## Correctif du 2026-08-09 — la feuille A4 débordait

> **Fait le 2026-08-09.** Signalé en usage réel : deux enfants ne tenaient pas sur une
> feuille. C'est le défaut que R1 attendait depuis le lot 7.
>
> **La cause n'était pas celle qu'on croyait.** Le lot 7 avait raisonné sur la largeur —
> « (186 mm − 22) / 5, soit 33 mm par colonne, ce qui suffit » — et pagine à cinq
> enfants. Mais la contrainte est la HAUTEUR, jamais mesurée : chaque trajet occupait
> trois lignes (les heures, la destination, le nom de la ligne), les trois jours avec
> cours l'après-midi coûtaient 57,9 mm chacun, et la feuille réclamait 285 mm pour
> 273 disponibles.
>
> Deux changements : la destination remonte sur la ligne des heures — « 07:25 → 07:45 →
> école » se lit d'un bloc — et la pagination passe de cinq à trois enfants par feuille.
>
> Mesuré au banc (règles de la couche impression rejouées dans un cadre de 186 mm,
> `table-layout: fixed` vérifié) : 1 enfant 117,6 mm · 2 enfants 220,0 · 3 enfants 219,6 ·
> 4 enfants deux pages de 204,8 et 164,1 · 5 enfants deux pages de 219,6 et 220,0. Toutes
> sous 273.
>
> **Écart de méthode, à retenir** : la première version du banc lisait la CSS dans les
> `<link rel=stylesheet>`, absents en développement — Vite injecte un `<style>`. Trois
> mesures ont donc tourné sans les règles d'impression et donnaient 166 mm pour tout
> effectif. Un banc doit contrôler qu'il mesure bien ce qu'il prétend : celui-ci vérifie
> désormais `table-layout` et la largeur du tableau avant de rendre un chiffre.
>
> **Réserve** : R1 reste ouverte — toujours pas d'impression sur papier.

*Dépend du lot 7.*

---

## Correctif du 2026-08-09 — deux traducteurs se recouvraient

> **Fait le 2026-08-09.** Défaut introduit par le lot 15 et trouvé sur question de
> l'auteur : « que se passe-t-il si deux traducteurs publient en même temps ? »
>
> **Le dernier gagnait, et effaçait l'autre sans un mot.** L'éditeur envoyait la
> surcouche ENTIÈRE, construite à partir de l'état chargé à l'ouverture de sa page ; le
> Worker écrivait cette charge par-dessus le fichier. Deux traducteurs partis du même
> état se recouvraient donc intégralement — y compris entre langues différentes, où il
> n'y avait pourtant aucun désaccord. Le `sha` de GitHub n'y changeait rien : relu juste
> avant l'écriture, il n'attrape qu'une collision de quelques millisecondes, pas deux
> personnes qui travaillent le même après-midi.
>
> Le patron correct existait déjà dans le même fichier — `majUrgences` relit, transforme,
> réécrit — et n'avait pas été suivi. Désormais : l'éditeur n'envoie que ses
> modifications (`{ langue, modifications }`, `null` valant retrait), le Worker relit
> l'état en ligne et fusionne clé par clé, puis renvoie l'état fusionné dont l'éditeur
> se sert comme nouvelle base. `/admin` suit le même chemin — rien n'empêche les deux
> espaces d'être ouverts ensemble.
>
> Deux personnes sur la même clé restent en dernier-arrivé-gagnant : c'est un vrai
> désaccord, pas un accident de mécanique, et fusionner deux traductions d'une même
> phrase n'aurait aucun sens.
>
> Vérifié : 6 tests sur `appliquerModifications`, et un test de bout en bout côté Worker
> avec le fichier GitHub simulé — A publie en allemand, B en portugais, les deux
> corrections coexistent dans le fichier réellement écrit.
>
> **L'éditeur de crédits portait le même défaut, et un cousin plus vicieux** : il
> s'amorçait sur `src/data/credits.json` COMPILÉ DANS LE BUNDLE. Publier une
> modification puis rouvrir `/admin` avant la reconstruction du site réaffichait
> l'ancienne version, et la republier annulait le travail. Il lit désormais le fichier
> du dépôt, et republie avec le `sha` lu à l'ouverture : c'est GitHub qui refuse si
> quelqu'un a publié entre-temps. Une liste de personnes ne se fusionne pas — l'ordre
> compte, un renommage ne se distingue pas d'un ajout — donc on refuse franchement
> plutôt que de deviner.
>
> Deux défauts trouvés en chemin et corrigés : `useBlocageRechargement` était appelé
> après un `return` conditionnel (ordre des hooks), et `charger` était recréé à chaque
> rendu alors qu'il sert de dépendance d'effet — ce qui aurait relancé la lecture GitHub
> sans fin.

*Dépend du lot 15.*

---

## Ordre d'exécution conseillé

```
Lot 0  (amorçage)
  ├── Lot 1  (corrections immédiates)          ← à lancer en premier, effet visible
  ├── Lot 2  (système de design)               ← fondation des lots 4 à 7, 9
  │     ├── Lot 3 (modèle : adresses + périscolaire)
  │     │     ├── Lot 4 (écrans de configuration)
  │     │     │     └── Lot 5 (assistant)
  │     │     └── Lot 12 (agenda : ICS + architecture)
  │     │           └── Lot 13 (Google Agenda)
  │     ├── Lot 6 (installation PWA)
  │     └── Lot 7 (impression A4 famille)
  └── Lot 8  (Worker commune)                  ← indépendant, parallélisable
        ├── Lot 9  (interface commune)
        ├── Lot 10 (rappels de notification)
        └── Lot 11 (sécurité et nettoyage)
```

Les lots 1, 2 et 8 peuvent être lancés dans trois sessions distinctes sans se gêner.

## Vérification, à chaque lot

```bash
npm run typecheck && npm test && npm run lint
npm run dev          # inspection manuelle des écrans touchés
npm run build        # le build doit rester propre
```

Pour le Worker (lots 8, 10, 11) :

```bash
cd worker && npm test
npx wrangler dev                    # essai local des routes /commune
curl https://<worker>/sante         # après déploiement
```

Aucun lot n'est considéré comme terminé tant que la fiche d'un enfant n'a pas été
réexaminée sur un viewport de 430 × 932 px, en thème clair **et** sombre.
