#!/usr/bin/env node
/**
 * Construit le jeu d'adresses embarqué, à partir de BD-Adresses (data.public.lu, CC0).
 *
 * Le résultat est COMMITÉ dans le dépôt : la construction en intégration continue ne
 * doit dépendre d'aucun téléchargement. Relancer ce script une fois par an suffit.
 *
 *   npm run donnees:adresses
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DATASET = 'adresses-georeferencees-bd-adresses'
const COMMUNE = 'Beckerich'
const SORTIE = resolve(import.meta.dirname, '../src/data/adresses-beckerich.json')

/** Résout l'URL du CSV le plus récent, plutôt que de figer une URL datée qui périmera. */
async function urlDuCsv() {
  const rep = await fetch(`https://data.public.lu/api/1/datasets/${DATASET}/`)
  if (!rep.ok) throw new Error(`API data.public.lu : ${rep.status}`)
  const jeu = await rep.json()
  const csv = jeu.resources.find((r) => r.format === 'csv' && r.url.endsWith('.csv'))
  if (!csv) throw new Error('Aucune ressource CSV dans le jeu de données')
  return { url: csv.url, maj: jeu.last_modified, licence: jeu.license, titre: jeu.title }
}

const source = await urlDuCsv()
console.log(`Téléchargement de ${source.url}`)

const rep = await fetch(source.url)
if (!rep.ok) throw new Error(`Téléchargement : ${rep.status}`)
const csv = await rep.text()

const lignes = csv.split('\n')
// Le fichier commence par une marque d'ordre des octets qu'il faut retirer.
const entete = lignes[0].replace(/^﻿/, '').split(';')
const col = (nom) => {
  const i = entete.indexOf(nom)
  if (i === -1) throw new Error(`Colonne absente du CSV : ${nom}`)
  return i
}
const iRue = col('rue')
const iNum = col('numero')
const iLoc = col('localite')
const iCp = col('code_postal')
const iLat = col('lat_wgs84')
const iLon = col('lon_wgs84')
const iCommune = col('commune')

// Tables d'index : les noms de rue et de localité se répètent des dizaines de fois,
// les stocker une seule fois divise la taille du fichier par trois environ.
const rues = []
const localites = []
const indexer = (table, valeur) => {
  let i = table.indexOf(valeur)
  if (i === -1) i = table.push(valeur) - 1
  return i
}

const adresses = []
for (let n = 1; n < lignes.length; n++) {
  const c = lignes[n].split(';')
  if (c.length <= iCommune || c[iCommune] !== COMMUNE) continue
  const lat = Number(c[iLat])
  const lon = Number(c[iLon])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
  adresses.push([
    indexer(rues, c[iRue]),
    c[iNum],
    indexer(localites, c[iLoc]),
    c[iCp],
    // Cinq décimales = environ un mètre : largement suffisant pour un temps de marche.
    Number(lat.toFixed(5)),
    Number(lon.toFixed(5)),
  ])
}

adresses.sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1]), 'fr', { numeric: true }))

const resultat = {
  $commentaire:
    'Généré par scripts/build-adresses.mjs. Ne pas modifier à la main. Format : adresses = [indexRue, numero, indexLocalite, codePostal, latitude, longitude].',
  genere: new Date().toISOString().slice(0, 10),
  source: {
    jeu: source.titre,
    url: `https://data.public.lu/fr/datasets/${DATASET}/`,
    licence: source.licence,
    derniereMaj: source.maj,
  },
  commune: COMMUNE,
  rues,
  localites,
  adresses,
}

writeFileSync(SORTIE, JSON.stringify(resultat) + '\n')

const ko = (JSON.stringify(resultat).length / 1024).toFixed(0)
console.log(`${adresses.length} adresses, ${rues.length} rues, ${localites.length} localités`)
console.log(`Localités : ${localites.sort().join(', ')}`)
console.log(`Écrit dans ${SORTIE} (${ko} Ko)`)
