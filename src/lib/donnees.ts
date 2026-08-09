/**
 * Chargement et indexation des données statiques.
 *
 * Les fichiers JSON de `src/data/` sont la seule source de vérité : aucun horaire,
 * aucune coordonnée et aucune règle ne doit être écrite en dur ailleurs dans le code.
 */
import planJson from '../data/plan-2025-2026.json'
import arretsJson from '../data/arrets.json'
import ecolesJson from '../data/ecoles.json'
import vacancesJson from '../data/vacances-lu.json'
import transportJson from '../data/transport-a-la-demande.json'
import type {
  Arret,
  Cycle,
  CycleScolaire,
  MaisonRelais,
  Plan,
  SiteScolaire,
  TransportALaDemande,
} from './types'

export const plan = planJson as unknown as Plan

export const arrets: Arret[] = (arretsJson as unknown as { arrets: Arret[] }).arrets

const ecoles = ecolesJson as unknown as {
  cycles: CycleScolaire[]
  sites: SiteScolaire[]
  maisonRelais: MaisonRelais
}

export const cycles = ecoles.cycles
export const sites = ecoles.sites
export const maisonRelais = ecoles.maisonRelais

/** Service de transport à la demande. Voir `src/data/transport-a-la-demande.json`. */
export const transportALaDemande = transportJson as unknown as TransportALaDemande

export interface AnneeVacances {
  anneeScolaire: string
  debut: string
  fin: string
  /** Seules certaines périodes sont renseignées : ne rien affirmer en dehors. */
  partiel?: boolean
  vacances: { id: string; du: string; au: string }[]
  feries: { id: string; date: string }[]
}

export const vacances = vacancesJson as unknown as {
  source: { url: string; intitule: string; dateReleve: string }
  annees: AnneeVacances[]
}

const parArretId = new Map(arrets.map((a) => [a.id, a]))
const parCycleId = new Map(cycles.map((c) => [c.id, c]))
const parSiteId = new Map(sites.map((s) => [s.id, s]))

/** Récupère un arrêt par identifiant. Lève si l'identifiant est inconnu : une donnée
 *  incohérente doit échouer bruyamment au développement plutôt que silencieusement. */
export function arret(id: string): Arret {
  const a = parArretId.get(id)
  if (!a) throw new Error(`Arrêt inconnu : ${id}`)
  return a
}

export function cycleScolaire(id: Cycle): CycleScolaire {
  const c = parCycleId.get(id)
  if (!c) throw new Error(`Cycle inconnu : ${id}`)
  return c
}

export function site(id: string): SiteScolaire {
  const s = parSiteId.get(id)
  if (!s) throw new Error(`Site scolaire inconnu : ${id}`)
  return s
}

/** Le site scolaire fréquenté par un cycle donné. */
export function siteDuCycle(id: Cycle): SiteScolaire {
  return site(cycleScolaire(id).site)
}

/** L'arrêt « école » desservi pour un cycle donné. */
export function arretEcoleDuCycle(id: Cycle): Arret {
  return arret(cycleScolaire(id).arretEcole)
}

/** L'incertitude déclarée dans le plan, si elle existe. */
export function incertitude(id: string) {
  return plan.incertitudes.find((i) => i.id === id)
}

/** État d'origine des arrêts, conservé pour pouvoir revenir en arrière. */
const arretsOrigine = new Map(arrets.map((a) => [a.id, { coord: a.coord, precision: a.precision }]))

/**
 * Applique des corrections de position venues du fichier des urgences.
 *
 * On modifie les objets en place plutôt que de faire circuler les corrections dans
 * tout le moteur : les arrêts sont un singleton, et cette mutation contenue évite de
 * complexifier une dizaine de signatures pour un cas rare. Les positions d'origine
 * sont mémorisées, si bien que retirer une correction restaure l'état initial.
 *
 * Renvoie le nombre d'arrêts effectivement déplacés, ce qui permet à l'interface de
 * savoir qu'elle doit recalculer les trajets.
 */
export function appliquerCorrectionsArrets(
  corrections: { arret: string; coord: [number, number] }[],
): number {
  const corriges = new Map(corrections.map((c) => [c.arret, c.coord]))
  let modifies = 0

  for (const a of arrets) {
    const origine = arretsOrigine.get(a.id)!
    const cible = corriges.get(a.id) ?? origine.coord

    if (a.coord[0] !== cible[0] || a.coord[1] !== cible[1]) {
      // `coord` est typé en lecture seule pour le reste de l'application ; c'est ici,
      // et uniquement ici, qu'on assume l'écriture.
      ;(a as { coord: readonly [number, number] }).coord = cible
      modifies++
    }

    // Une position corrigée à la main est par définition vérifiée ; en l'absence de
    // correction, on restaure la précision d'origine plutôt que de la laisser
    // faussement à « vérifiée ».
    a.precision = corriges.has(a.id) ? 'verifiee' : origine.precision
  }
  return modifies
}
