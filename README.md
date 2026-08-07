# Bus scolaire Beckerich

Application web qui personnalise le plan du bus scolaire de la commune de Beckerich
(Luxembourg) pour chaque enfant : arrêt le plus proche, temps de marche, horaires du
jour, export vers l'agenda.

> **Ce site n'a aucun lien avec la commune de Beckerich ni avec l'école.**
> Il est réalisé par un parent, à titre privé. Le plan officiel peut être modifié sans
> préavis de la part de la commune. Le meilleur effort est fourni pour tenir ce site à
> jour, sans engagement de résultat. **En cas de doute, le document officiel de la
> commune fait foi** : [kanner.beckerich.lu](https://kanner.beckerich.lu/infos/horaires-de-bus).

## Pourquoi

Pour savoir quel bus concerne son enfant, un parent doit croiser de tête : le cycle de
l'enfant → le site scolaire correspondant → la ligne qui le dessert dans le bon sens →
l'arrêt le plus proche de chez lui → et selon qu'il déjeune à la maison ou au Dillendapp,
un jour donné. Cette combinatoire est refaite à chaque rentrée et à chaque changement de
cycle. L'application la fait une fois pour toutes.

## Principes

- **Aucun serveur.** Tout est calculé sur l'appareil. L'adresse du domicile et les
  prénoms des enfants ne sont jamais transmis nulle part, y compris lors d'un partage
  par lien (les données voyagent dans le fragment de l'URL, que le serveur ne reçoit pas).
- **Hors ligne.** Les adresses de la commune et tous les horaires sont embarqués :
  l'application reste utilisable à l'arrêt de bus, sans réseau.
- **Honnête sur ses limites.** Les temps de marche sont des estimations, certaines
  coordonnées d'arrêts sont approximatives, et une règle du plan officiel reste
  ambiguë — l'application le dit au lieu de deviner. Voir la page « Limites ».

## Développement

```bash
npm install
npm run dev        # serveur de développement
npm test           # tests du moteur (src/lib)
npm run typecheck
npm run build      # build de production dans dist/
```

Le chemin de base est configurable pour ne pas dépendre de l'hébergement :

```bash
BASE_PATH=/ npm run build
```

## Mettre à jour les horaires

Tous les horaires, arrêts et règles vivent dans `src/data/`. Aucune donnée n'est écrite
en dur dans le code. La procédure de mise à jour, à la portée d'une personne non
développeuse, est décrite dans **[DONNEES.md](DONNEES.md)**.

## Source des données

| Donnée | Source | Licence |
| --- | --- | --- |
| Horaires du bus scolaire | [kanner.beckerich.lu](https://kanner.beckerich.lu/infos/horaires-de-bus) — brochure *Suebelmouk Spezial*, rentrée 2025/2026 | document communal |
| Répartition des cycles | [beckerich.lu — infrastructures scolaires](https://www.beckerich.lu/fr/enseignement-sea-dillendapp/infrastructures-scolaires) | document communal |
| Adresses de la commune | [BD-Adresses, data.public.lu](https://data.public.lu/en/datasets/adresses-georeferencees-bd-adresses/) | CC0 |
| Coordonnées des arrêts | OpenStreetMap / Nominatim | ODbL |
| Vacances scolaires | [men.public.lu](https://men.public.lu/fr/vacances-scolaires.html) | document officiel |

## Licence

Le code est sous licence MIT. Les données publiques conservent la licence de leur
source ; le plan de bus reste la propriété de la commune de Beckerich et n'est
redistribué que pour faciliter sa consultation par les parents.
