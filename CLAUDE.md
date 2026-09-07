# Bus scolaire Beckerich — repères pour travailler sur ce dépôt

Application web qui personnalise le plan du bus scolaire de la commune de Beckerich
(Luxembourg) pour chaque enfant. Réalisée par un parent, à titre privé, **sans lien avec
la commune ni avec l'école**.

## Deux principes non négociables

1. **Aucune donnée de famille ne quitte l'appareil.** Adresse du domicile, prénoms et
   cycles vivent dans `localStorage`. Le partage par lien passe par le **fragment** de
   l'URL (`#partage=…`), que le serveur ne reçoit jamais. La recherche d'adresse est
   entièrement hors ligne (jeu BD-Adresses embarqué). Toute proposition qui enverrait ces
   données quelque part est à écarter, ou à signaler explicitement.
2. **L'application dit ce qu'elle ne sait pas.** Temps de marche estimés, coordonnées
   d'arrêts approximatives, règles ambiguës du plan officiel : c'est affiché, pas deviné.
   Voir la page « Limites » et le champ `incertitudes` du plan.

## Conventions

- **Le code est écrit en français** : types (`Trajet`, `Enfant`, `JourneeEnfant`),
  fonctions (`contexteEnfant`, `trajetsDuJour`, `definirRepas`), variables, commentaires.
  S'y tenir — un mélange franco-anglais rendrait le domaine illisible.
- **Aucune chaîne visible en dur** dans un composant : tout passe par `useT()` et les
  dictionnaires `src/i18n/*.json` (fr, de, lb, pt, en).
- **Aucune donnée en dur dans le code** : horaires, arrêts, cycles et vacances vivent dans
  `src/data/`.
- **Aucun `style={{ … }}` dans un composant, aucune valeur brute dans `src/index.css`** :
  couleurs, tailles de texte, espacements, rayons et ombres passent par les jetons de la
  couche `tokens`. Un composant ne porte que des classes. Toute cible tactile fait
  ≥ 44 px (`--cible`), et chaque couple encre/fond se vérifie à un contraste ≥ 4.5:1
  avant d'entrer dans la palette.
- Les commentaires expliquent **pourquoi**, pas quoi.

## Carte du dépôt

| Chemin | Rôle |
| --- | --- |
| `src/lib/` | Moteur pur, testé. `plan.ts` (calcul des trajets), `moments.ts` (la journée telle qu'un parent la décrit ↔ les champs du stockage), `calendrier.ts`, `urgences.ts`, `validation.ts`, `partage.ts`, `adresses.ts`. |
| `src/composants/`, `src/pages/` | Affichage uniquement. Aucune règle métier. |
| `src/data/` | Toutes les données : plan de bus, arrêts, écoles, vacances, adresses. |
| `src/i18n/` | Dictionnaires de traduction. |
| `serveur/` | Serveur Node (Hono + PostgreSQL), conteneurisé : abonnements, envoi des notifications push, OAuth Google (agenda), et **toute la publication par comptes à capacités** — courriel + mot de passe argon2id (`src/comptes/`, `src/routes/comptes.ts`, `creer-utilisateur.mjs`), chaque nature de donnée gardée par une capacité et servie par `src/routes/edition.ts`. |
| `serveur/src/migrations/` | Schéma de la base, en fichiers `.sql` numérotés, appliqués au démarrage. Ajouter une migration : créer le fichier **et** l'inscrire dans `migrations/index.ts`. |
| `public/urgences.json` | Perturbations ponctuelles, relues à chaque ouverture, hors bundle. |

`src/lib/plan.ts` est le fichier central : une erreur y fait rater un bus à un enfant.
C'est le plus testé, et il doit le rester.

## Commandes

```bash
npm run dev          # serveur de développement
npm test             # tests du moteur (src/lib) et des contextes — PAS ceux du serveur
npm run typecheck
npm run lint
npm run build        # build de production dans dist/

npm run test:tout    # les deux : application ET serveur
```

Le serveur a son propre paquet, son propre environnement de test (node, pas jsdom) et
ses propres dépendances. `npm test` à la racine **ne le couvre pas** :

```bash
sudo docker compose up -d bus-postgres      # une vraie base, exigée par une partie des tests
cd serveur
DATABASE_URL_TEST=postgres://bus:bus@localhost:5433/bus npm test
npm run typecheck && npm run build
```

Sans `DATABASE_URL_TEST`, les tests de stockage **se sautent** au lieu d'échouer : la
boucle courte doit rester lançable sans Docker. C'est aussi pourquoi la CI, elle, la
pose toujours — un test qui se saute en silence ne protège rien s'il se saute partout.

```bash
docker compose up                            # la pile entière en local
sudo docker build -f serveur/Dockerfile -t bus-api .   # contexte = RACINE du dépôt
```

Le contexte de construction est la racine et non `serveur/` : le serveur importe
`src/lib/validation.ts`, `src/lib/traductions.ts`, `src/lib/calendrier.ts` et
`src/lib/donnees.ts`. Ces modules sont partagés **délibérément** — une seconde
implémentation des règles de validation aurait divergé au premier ajustement.

## Documentation

- **[docs/plan.md](docs/plan.md) — feuille de route détaillée.** Les lots 0 à 25 sont
  faits (25 : toute la publication — perturbations, traductions, horaires, crédits,
  corrections d'arrêts — vit en base et se fait par capacité ; plus aucune écriture dans
  le dépôt, `/admin` et le chemin GitHub retirés). **Consolidation faite le 2026-08-24** :
  les derniers espaces à code personnel (`/commune`, `/traductions`) sont repliés sur les
  comptes à capacités — un seul mécanisme d'authentification, tout passe par `/edition`
  (voir la section « Consolidation » du plan). L'application est **déployée sur
  `app.schoulbus.lu`** (voir [docs/deploiement.md](docs/deploiement.md)). **Lot 26 fait le
  2026-08-24** : les rappels ont un journal de livraison, lisible à l'onglet « Journal » de
  `/edition`. **Lots 27-28 faits le 2026-08-24** : la mesure de fréquentation est
  auto-hébergée (GoatCounter retiré, onglet « Fréquentation » de `/edition`). **Tous les
  lots planifiés (0 à 28) sont faits.** **Le 2026-09-07** : la clé VAPID se lit à
  l'exécution sur `/sante` au lieu d'être figée au build, un jeton de session refusé
  s'efface, `pull_policy: always` sur les deux images — et **l'ouverture à la commune est
  faite** : le premier compte d'agent est créé et le courriel d'accès envoyé (les
  identités restent hors dépôt, il est public). **À consulter avant d'entamer une évolution.**

  À la fin d'un lot, y consigner **tout ce qui n'a pas pu être vérifié** : la section
  « Réserves ouvertes » en tête de fichier, plus une ligne dans le bloc du lot. Une
  réserve dite de vive voix et non écrite est une réserve perdue — elle réapparaît en
  panne trois mois plus tard. Y noter aussi les écarts assumés par rapport au texte du
  lot, et pourquoi.
- [DONNEES.md](DONNEES.md) — mettre à jour horaires, arrêts, cycles et vacances.
- [ADMIN.md](ADMIN.md) — publier une urgence, activer les notifications push.
- [docs/deploiement.md](docs/deploiement.md) — déployer le serveur sur la VPS (Dokploy, image GHCR, DNS).
- [README.md](README.md) — présentation publique et sources des données.
