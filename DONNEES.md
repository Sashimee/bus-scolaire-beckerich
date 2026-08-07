# Mettre à jour les données

Cette notice s'adresse à toute personne qui doit tenir le site à jour, développeuse ou
non. **Aucun horaire n'est écrit dans le code** : tout vit dans `src/data/`. Mettre à
jour le site, c'est modifier un fichier texte et l'enregistrer.

Après chaque modification enregistrée sur GitHub, le site se reconstruit et se met en
ligne tout seul en deux à trois minutes. Les personnes qui ont installé l'application
voient apparaître un bandeau « Une nouvelle version est disponible ».

---

## Les fichiers, et quand y toucher

| Fichier | Contenu | Quand |
| --- | --- | --- |
| `src/data/plan-2025-2026.json` | Tous les horaires de bus | À chaque nouveau plan |
| `src/data/ecoles.json` | Quel cycle va dans quelle école | À chaque rentrée |
| `src/data/vacances-lu.json` | Vacances scolaires et jours fériés | Une fois par an |
| `src/data/arrets.json` | Position des arrêts sur la carte | Rarement |
| `public/plan-bus-2025-2026.pdf` | Le PDF téléchargeable | À chaque nouveau plan |

> Les fichiers `.json` sont du texte. Les guillemets, les virgules et les accolades
> comptent : si vous en supprimez un par mégarde, le site refusera de se construire —
> il ne se mettra pas en ligne cassé. En cas de doute, `npm test` le dit tout de suite.

---

## Cas 1 — La commune publie un nouveau plan de bus

C'est le cas le plus fréquent, à chaque rentrée.

1. **Récupérer le nouveau PDF** sur
   [kanner.beckerich.lu](https://kanner.beckerich.lu/infos/horaires-de-bus).
2. **Le déposer** dans `public/`, en le nommant d'après l'année, par exemple
   `plan-bus-2026-2027.pdf`.
3. **Copier** `src/data/plan-2025-2026.json` en `src/data/plan-2026-2027.json`.
4. **Modifier l'en-tête** du nouveau fichier :
   ```json
   "anneeScolaire": "2026/2027",
   "anneesCouvertes": ["2026/2027"],
   "valideDu": "2026-09-15",
   "valideAu": "2027-07-15",
   "source": {
     "pdf": "plan-bus-2026-2027.pdf",
     "dateReleve": "2026-09-01",
     "confirmationOrale": false
   }
   ```
5. **Corriger les horaires** ligne par ligne en comparant au PDF. Chaque arrêt s'écrit :
   ```json
   { "arret": "noerdange-gare", "heure": "07:28" }
   ```
   Mettez `"heure": null` si le plan n'indique pas d'heure à cet arrêt.
6. **Faire pointer l'application** sur le nouveau fichier : dans `src/lib/donnees.ts`,
   remplacer `plan-2025-2026.json` par `plan-2026-2027.json`. C'est la seule ligne de
   code à toucher.
7. Mettre à jour le lien du PDF dans `src/pages/Plan.tsx` et `src/pages/Infos.tsx`
   (`plan-bus-2025-2026.pdf` → `plan-bus-2026-2027.pdf`).

### Si le plan n'a pas changé

Il suffit d'ajouter la nouvelle année à `anneesCouvertes` et de repousser `valideAu`.
Notez d'où vient l'information, c'est ce qui permettra plus tard de savoir sur quoi
repose cette validité :

```json
"anneesCouvertes": ["2025/2026", "2026/2027"],
"valideAu": "2027-07-15",
"source": {
  "confirmePar": "la commune de Beckerich",
  "confirmeLe": "2026-08",
  "confirmationOrale": true
}
```

---

## Cas 2 — La commune redistribue les cycles entre les écoles

C'est le changement le plus important : c'est cette table qui fait que l'application
sait où va chaque enfant. Dans `src/data/ecoles.json` :

```json
{ "id": "c2", "ordre": 2, "site": "noerdange", "arretEcole": "noerdange-ecole" }
```

Si le cycle 2 déménageait à Elvange, il suffirait d'écrire `"site": "elvange"` et
`"arretEcole": "elvange-ecole"`. Tous les plans des enfants concernés se recalculent
d'eux-mêmes.

Pensez à mettre à jour `dateReleve` juste au-dessus.

---

## Cas 3 — Nouvelle année de vacances scolaires

Une fois par an, relever le calendrier sur
[men.public.lu](https://men.public.lu/fr/vacances-scolaires.html) et ajouter un bloc
dans `src/data/vacances-lu.json` :

```json
{
  "anneeScolaire": "2027/2028",
  "debut": "2027-09-15",
  "fin": "2028-07-14",
  "vacances": [
    { "id": "toussaint", "du": "2027-10-30", "au": "2027-11-07" }
  ],
  "feries": [{ "id": "ascension", "date": "2028-05-25" }]
}
```

Les dates sont **inclusives** des deux côtés. Ne listez dans `feries` que les jours
fériés qui tombent un jour de classe hors vacances — les autres n'ont aucun effet.

Tant qu'une année n'est pas renseignée, l'application ne prétend pas savoir s'il y a
école : elle l'écrit franchement. C'est voulu, ne la forcez pas à deviner.

Le congé d'été déborde toujours sur la rentrée suivante : conservez l'année écoulée
avec `"partiel": true` et son seul congé d'été, sinon l'application ne saura pas quoi
répondre au mois d'août.

---

## Cas 4 — Corriger la position d'un arrêt

Les arrêts marqués `"precision": "approximative"` dans `src/data/arrets.json` n'ont pas
pu être vérifiés ; l'application le signale aux parents. Pour en corriger un :

1. Ouvrir [openstreetmap.org](https://www.openstreetmap.org/), trouver l'arrêt.
2. Clic droit → « Afficher l'adresse » : les coordonnées apparaissent dans l'URL.
3. Reporter latitude puis longitude, et passer la précision à `verifiee` :
   ```json
   "coord": [49.72283, 5.90488],
   "precision": "verifiee",
   "source": "Relevé sur place, septembre 2026"
   ```

---

## Régénérer les adresses de la commune

Une fois par an suffit largement — le registre national bouge peu à l'échelle d'une
commune de 1162 adresses.

```bash
npm run donnees:adresses
```

Le script télécharge le registre officiel, filtre sur Beckerich et réécrit
`src/data/adresses-beckerich.json`. **Ce fichier doit être enregistré dans le dépôt** :
la mise en ligne ne télécharge rien.

---

## Vérifier avant de publier

```bash
npm test        # les horaires sont-ils cohérents ?
npm run build   # le site se construit-il ?
```

Si `npm test` passe, les cas délicats sont couverts : cycles, jours sans cours
l'après-midi, repas au Dillendapp, cas particuliers de Huttange.

---

## Règles confirmées auprès de la commune

Consignées dans `reglesConfirmees` de `plan-*.json`, avec leur date, pour qu'on sache
plus tard sur quoi elles reposent :

- **Les retours de fin d'après-midi (15:45–16:37) ne circulent pas le mardi ni le
  jeudi**, puisqu'il n'y a pas cours l'après-midi ces jours-là. Un enfant resté au
  Dillendapp doit être récupéré sur place. *(Confirmé le 7 août 2026.)*

## Questions encore en suspens

À poser lors du prochain contact avec la commune :

- **L'arrêt du départ de 13:25 à Beckerich (Aller 1)** n'est pas nommé dans le plan :
  s'agit-il de l'école, du Dillendapp ou d'un autre point ?
