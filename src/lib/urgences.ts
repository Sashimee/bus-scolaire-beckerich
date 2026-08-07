/**
 * Perturbations ponctuelles : annulations, retards, arrêts déplacés.
 *
 * Volontairement séparées du plan de référence. Le plan est figé dans le bundle et ne
 * bouge qu'à la rentrée ; les urgences vivent dans un fichier statique relu à chaque
 * ouverture de l'application. Cette séparation a deux conséquences utiles : publier
 * une urgence ne demande pas de reconstruire le site, et une fausse manipulation dans
 * l'urgence ne peut pas corrompre les horaires de référence.
 */
import { isoDate } from './calendrier'
import type { Trajet } from './types'

export type TypePerturbation = 'annulation' | 'retard' | 'arret-deplace' | 'message'
export type Gravite = 'info' | 'attention' | 'alerte'

export interface Perturbation {
  id: string
  /** Bornes incluses, au format AAAA-MM-JJ. */
  du: string
  au: string
  type: TypePerturbation
  /** Portée. Sans ligne ni arrêt, la perturbation concerne toute la commune. */
  ligne?: string
  service?: string
  arret?: string
  /** Retard en minutes, positif. */
  minutes?: number
  /** Arrêt de remplacement, pour un arrêt déplacé. */
  arretRemplacement?: string
  /** Message libre. Le français est obligatoire, les autres langues facultatives. */
  message: { fr: string } & Partial<Record<string, string>>
  publieLe: string
  publiePar: string
  gravite: Gravite
}

export interface Urgences {
  version: number
  misAJour: string
  perturbations: Perturbation[]
}

export const URGENCES_VIDES: Urgences = {
  version: 1,
  misAJour: new Date(0).toISOString(),
  perturbations: [],
}

/**
 * Relit le fichier des urgences depuis le réseau.
 *
 * `cache: no-store` est indispensable : une annulation de bus qui resterait en cache
 * serait pire qu'inutile. Le service worker applique la même stratégie réseau d'abord,
 * avec repli sur la dernière version connue en cas de coupure.
 */
export async function chargerUrgences(signal?: AbortSignal): Promise<Urgences | null> {
  try {
    const rep = await fetch(`${import.meta.env.BASE_URL}urgences.json`, {
      cache: 'no-store',
      signal,
    })
    if (!rep.ok) return null
    const donnees = (await rep.json()) as Urgences
    if (!Array.isArray(donnees.perturbations)) return null
    return donnees
  } catch {
    // Hors ligne : ce n'est pas une erreur, l'application reste utilisable.
    return null
  }
}

/** Les perturbations actives à une date donnée. */
export function perturbationsDuJour(urgences: Urgences, date: Date): Perturbation[] {
  const iso = isoDate(date)
  return urgences.perturbations.filter((p) => iso >= p.du && iso <= p.au)
}

/**
 * Cette perturbation touche-t-elle ce trajet ?
 *
 * Une perturbation sans portée précise concerne tout le monde ; sinon elle ne
 * s'applique qu'aux trajets dont la ligne, la course ou l'un des deux arrêts
 * correspond. On ne veut surtout pas alarmer un parent pour une ligne qui n'est pas
 * la sienne.
 */
export function toucheLeTrajet(p: Perturbation, trajet: Trajet): boolean {
  if (!p.ligne && !p.service && !p.arret) return true
  if (p.ligne && p.ligne !== trajet.ligne.id) return false
  if (p.service && p.service !== trajet.serviceId) return false
  if (p.arret && p.arret !== trajet.depart.arret.id && p.arret !== trajet.arrivee.arret.id) {
    return false
  }
  return true
}

/** Les perturbations d'un jour qui concernent réellement ce trajet. */
export function perturbationsDuTrajet(
  perturbations: Perturbation[],
  trajet: Trajet,
): Perturbation[] {
  return perturbations.filter((p) => toucheLeTrajet(p, trajet))
}

/** Perturbations générales, qui ne visent aucune ligne ni aucun arrêt en particulier. */
export function perturbationsGenerales(perturbations: Perturbation[]): Perturbation[] {
  return perturbations.filter((p) => !p.ligne && !p.service && !p.arret)
}

/** Décale une heure « HH:MM » de n minutes, en restant dans la journée. */
export function decalerHeure(heure: string, minutes: number): string {
  const [h, m] = heure.split(':').map(Number)
  const total = Math.max(0, Math.min(24 * 60 - 1, h * 60 + m + minutes))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * L'heure de départ à afficher pour un trajet, une fois les retards appliqués.
 * Renvoie `null` si le trajet est annulé.
 */
export function heureEffective(trajet: Trajet, perturbations: Perturbation[]): string | null {
  if (perturbations.some((p) => p.type === 'annulation')) return null
  const retard = perturbations
    .filter((p) => p.type === 'retard' && typeof p.minutes === 'number')
    .reduce((somme, p) => somme + (p.minutes ?? 0), 0)
  if (!trajet.depart.heure) return null
  return retard ? decalerHeure(trajet.depart.heure, retard) : trajet.depart.heure
}

/** Le message d'une perturbation dans la langue demandée, avec repli sur le français. */
export function messagePerturbation(p: Perturbation, langue: string): string {
  return p.message[langue] ?? p.message.fr
}

/** La gravité la plus élevée d'un ensemble de perturbations. */
export function graviteMax(perturbations: Perturbation[]): Gravite | null {
  const ordre: Gravite[] = ['info', 'attention', 'alerte']
  return perturbations.reduce<Gravite | null>((max, p) => {
    if (!max) return p.gravite
    return ordre.indexOf(p.gravite) > ordre.indexOf(max) ? p.gravite : max
  }, null)
}

/** Identifiant lisible et unique, utilisé à la publication. */
export function nouvelIdentifiant(date = new Date()): string {
  return `${isoDate(date)}-${Math.random().toString(36).slice(2, 7)}`
}
