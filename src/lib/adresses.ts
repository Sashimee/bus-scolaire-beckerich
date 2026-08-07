/**
 * Recherche d'adresse entièrement hors ligne.
 *
 * Le jeu BD-Adresses filtré sur la commune tient en 41 Ko : il est embarqué dans
 * l'application. Aucune requête réseau, donc aucune adresse de domicile transmise à
 * un tiers, et une autocomplétion qui fonctionne à l'arrêt de bus sans réseau.
 */
import brut from '../data/adresses-beckerich.json'
import type { Adresse } from './types'

interface JeuAdresses {
  genere: string
  source: { jeu: string; url: string; licence: string; derniereMaj: string }
  commune: string
  rues: string[]
  localites: string[]
  adresses: [number, string, number, string, number, number][]
}

const jeu = brut as unknown as JeuAdresses

export const sourceAdresses = jeu.source
export const communeAdresses = jeu.commune
export const localites = jeu.localites

export interface AdresseTrouvee extends Adresse {
  rue: string
  numero: string
  codePostal: string
}

/** Retire accents et ponctuation pour comparer « Haaptstrooss » et « haaptstross ». */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Index construit une seule fois, au premier usage. */
const index = jeu.adresses.map(([iRue, numero, iLoc, cp, lat, lon]) => {
  const rue = jeu.rues[iRue]
  const localite = jeu.localites[iLoc]
  return {
    adresse: {
      libelle: `${numero}, ${rue}`,
      localite,
      coord: [lat, lon] as const,
      rue,
      numero,
      codePostal: cp,
    } satisfies AdresseTrouvee,
    // On indexe rue + numéro + localité : un parent tape souvent « haapt 76 elvange ».
    recherche: normaliser(`${rue} ${numero} ${localite} ${cp}`),
    rueNormalisee: normaliser(rue),
    numeroNormalise: normaliser(numero),
  }
})

/**
 * Cherche des adresses correspondant à une saisie libre.
 *
 * Tous les mots saisis doivent être retrouvés, dans n'importe quel ordre. Les
 * correspondances en début de nom de rue et les numéros exacts remontent en premier,
 * parce que c'est ce qu'un parent tape le plus souvent.
 */
export function chercherAdresses(requete: string, limite = 8): AdresseTrouvee[] {
  const q = normaliser(requete)
  if (q.length < 2) return []
  const mots = q.split(' ')

  const resultats: { adresse: AdresseTrouvee; score: number }[] = []
  for (const e of index) {
    if (!mots.every((m) => e.recherche.includes(m))) continue

    let score = 0
    for (const m of mots) {
      if (e.rueNormalisee.startsWith(m)) score += 3
      else if (e.rueNormalisee.includes(m)) score += 1
      if (e.numeroNormalise === m) score += 4
    }
    // À score égal, les adresses les plus courtes sont les plus probables.
    resultats.push({ adresse: e.adresse, score: score * 100 - e.recherche.length })
  }

  return resultats
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((r) => r.adresse)
}

/** L'adresse connue la plus proche d'un point, pour le placement manuel sur carte. */
export function adressePlusProche(lat: number, lon: number): AdresseTrouvee | null {
  let meilleure: AdresseTrouvee | null = null
  let min = Infinity
  for (const e of index) {
    const d = (e.adresse.coord[0] - lat) ** 2 + (e.adresse.coord[1] - lon) ** 2
    if (d < min) {
      min = d
      meilleure = e.adresse
    }
  }
  return meilleure
}
