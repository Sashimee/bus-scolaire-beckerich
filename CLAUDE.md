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
| `src/lib/` | Moteur pur, testé. `plan.ts` (calcul des trajets), `calendrier.ts`, `urgences.ts`, `validation.ts`, `partage.ts`, `adresses.ts`. |
| `src/composants/`, `src/pages/` | Affichage uniquement. Aucune règle métier. |
| `src/data/` | Toutes les données : plan de bus, arrêts, écoles, vacances, adresses. |
| `src/i18n/` | Dictionnaires de traduction. |
| `worker/` | Worker Cloudflare : OAuth GitHub, abonnements et envoi des notifications push. |
| `public/urgences.json` | Perturbations ponctuelles, relues à chaque ouverture, hors bundle. |

`src/lib/plan.ts` est le fichier central : une erreur y fait rater un bus à un enfant.
C'est le plus testé, et il doit le rester.

## Commandes

```bash
npm run dev          # serveur de développement
npm test             # tests du moteur (src/lib) et des contextes
npm run typecheck
npm run lint
npm run build        # build de production dans dist/
```

## Documentation

- **[docs/plan.md](docs/plan.md) — feuille de route détaillée.** Les 13 lots d'évolution en
  cours (refonte UI, adresses par jour, espace commune, sécurité, agenda…), avec leurs
  dépendances et leur ordre d'exécution. **À consulter avant d'entamer une évolution.**

  À la fin d'un lot, y consigner **tout ce qui n'a pas pu être vérifié** : la section
  « Réserves ouvertes » en tête de fichier, plus une ligne dans le bloc du lot. Une
  réserve dite de vive voix et non écrite est une réserve perdue — elle réapparaît en
  panne trois mois plus tard. Y noter aussi les écarts assumés par rapport au texte du
  lot, et pourquoi.
- [DONNEES.md](DONNEES.md) — mettre à jour horaires, arrêts, cycles et vacances.
- [ADMIN.md](ADMIN.md) — publier une urgence, activer les notifications push.
- [README.md](README.md) — présentation publique et sources des données.
