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
import { coordValide, dateIsoValide, entierEntre, texteSur } from './nettoyage'
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
  /**
   * Nombre de rappels souhaités, envoyés par le Worker aux créneaux utiles du jour
   * concerné. Absent = trois, le plafond. Ne vaut que pour la gravité `alerte` : une
   * information ne fait pas sonner un téléphone trois fois.
   */
  rappels?: number
}

/**
 * Correction de position d'un arrêt, appliquée sans reconstruire le site.
 *
 * Sert quand on découvre qu'un arrêt est mal placé et qu'on veut corriger tout de
 * suite, ou quand un arrêt est déplacé pour quelques jours (travaux). Une correction
 * définitive se fait plutôt dans `arrets.json`, qui reste la référence.
 */
export interface CorrectionArret {
  arret: string
  coord: [number, number]
  /** Sans date de fin, la correction vaut jusqu'à son retrait. */
  jusqua?: string
  note?: string
  publieLe: string
  publiePar: string
}

export interface Urgences {
  version: number
  misAJour: string
  perturbations: Perturbation[]
  correctionsArrets?: CorrectionArret[]
}

export const URGENCES_VIDES: Urgences = {
  version: 1,
  misAJour: new Date(0).toISOString(),
  perturbations: [],
  correctionsArrets: [],
}

/** Les corrections d'arrêts encore valables à une date donnée. */
export function correctionsActives(urgences: Urgences, date: Date): CorrectionArret[] {
  const iso = isoDate(date)
  return (urgences.correctionsArrets ?? []).filter((c) => !c.jusqua || iso <= c.jusqua)
}

/**
 * Relit le fichier des urgences depuis le réseau.
 *
 * `cache: no-store` est indispensable : une annulation de bus qui resterait en cache
 * serait pire qu'inutile. Le service worker applique la même stratégie réseau d'abord,
 * avec repli sur la dernière version connue en cas de coupure.
 */
const TYPES: TypePerturbation[] = ['annulation', 'retard', 'arret-deplace', 'message']
const GRAVITES: Gravite[] = ['info', 'attention', 'alerte']
const LANGUES = ['fr', 'de', 'lb', 'pt', 'en']
const MESSAGE_MAX = 200
const PERTURBATIONS_MAX = 50

/**
 * Relit une perturbation publiée, ou renvoie `null` si elle est inexploitable.
 *
 * Ce fichier est relu à CHAQUE ouverture de l'application, et il est écrit par le
 * Worker, par `/admin`, et à la main dans le dépôt en cas de secours. Une entrée
 * cassée par une faute de frappe ne doit pas emporter les autres avec elle : on
 * l'ignore, et le reste s'affiche.
 */
function relirePerturbation(brut: unknown): Perturbation | null {
  if (typeof brut !== 'object' || brut === null) return null
  const p = brut as Record<string, unknown>

  const id = texteSur(p.id, 64)
  if (!id) return null
  if (!TYPES.includes(p.type as TypePerturbation)) return null
  if (!GRAVITES.includes(p.gravite as Gravite)) return null
  if (!dateIsoValide(p.du) || !dateIsoValide(p.au) || p.au < p.du) return null

  const messageBrut = p.message
  if (typeof messageBrut !== 'object' || messageBrut === null) return null
  const message: Record<string, string> = {}
  for (const langue of LANGUES) {
    const texte = texteSur((messageBrut as Record<string, unknown>)[langue], MESSAGE_MAX)
    if (texte) message[langue] = texte
  }
  // Le français est la seule langue obligatoire : sans lui, rien à afficher.
  if (!message.fr) return null

  const minutes = p.minutes
  if (minutes !== undefined && !entierEntre(minutes, 1, 120)) return null

  const portee = (cle: string) => {
    const v = texteSur(p[cle], 64)
    return v ? { [cle]: v } : {}
  }

  return {
    id,
    du: p.du,
    au: p.au,
    type: p.type as TypePerturbation,
    gravite: p.gravite as Gravite,
    message: message as Perturbation['message'],
    publieLe: texteSur(p.publieLe, 40),
    publiePar: texteSur(p.publiePar, 80),
    ...portee('ligne'),
    ...portee('service'),
    ...portee('arret'),
    ...portee('arretRemplacement'),
    ...(minutes !== undefined ? { minutes: minutes as number } : {}),
    ...(entierEntre(p.rappels, 0, 3) ? { rappels: p.rappels as number } : {}),
  }
}

/** Relit une correction d'arrêt, en refusant celles qui déplaceraient un arrêt hors du pays. */
function relireCorrection(brut: unknown): CorrectionArret | null {
  if (typeof brut !== 'object' || brut === null) return null
  const c = brut as Record<string, unknown>
  const arret = texteSur(c.arret, 64)
  if (!arret || !coordValide(c.coord)) return null
  return {
    arret,
    coord: c.coord,
    publieLe: texteSur(c.publieLe, 40),
    publiePar: texteSur(c.publiePar, 80),
    ...(dateIsoValide(c.jusqua) ? { jusqua: c.jusqua } : {}),
    ...(texteSur(c.note, 200) ? { note: texteSur(c.note, 200) } : {}),
  }
}

export async function chargerUrgences(signal?: AbortSignal): Promise<Urgences | null> {
  try {
    const rep = await fetch(`${import.meta.env.BASE_URL}urgences.json`, {
      cache: 'no-store',
      signal,
    })
    if (!rep.ok) return null
    const donnees = (await rep.json()) as Record<string, unknown>
    if (!Array.isArray(donnees.perturbations)) return null

    // Chaque entrée est validée séparément : une seule mal formée ne doit pas priver
    // les parents de toutes les autres.
    const perturbations = donnees.perturbations
      .slice(0, PERTURBATIONS_MAX)
      .map(relirePerturbation)
      .filter((p): p is Perturbation => p !== null)

    const correctionsArrets = Array.isArray(donnees.correctionsArrets)
      ? donnees.correctionsArrets
          .slice(0, PERTURBATIONS_MAX)
          .map(relireCorrection)
          .filter((c): c is CorrectionArret => c !== null)
      : []

    return { ...(donnees as unknown as Urgences), perturbations, correctionsArrets }
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

/** Le retard total annoncé par un ensemble de perturbations, en minutes. */
function retardCumule(perturbations: Perturbation[]): number {
  return perturbations
    .filter((p) => p.type === 'retard' && typeof p.minutes === 'number')
    .reduce((somme, p) => somme + (p.minutes ?? 0), 0)
}

/** L'heure décalée du retard annoncé, ou `null` si le trajet est annulé. */
function heureDecalee(heure: string | null, perturbations: Perturbation[]): string | null {
  if (perturbations.some((p) => p.type === 'annulation')) return null
  if (!heure) return null
  const retard = retardCumule(perturbations)
  return retard ? decalerHeure(heure, retard) : heure
}

/**
 * L'heure de départ à afficher pour un trajet, une fois les retards appliqués.
 * Renvoie `null` si le trajet est annulé.
 */
export function heureEffective(trajet: Trajet, perturbations: Perturbation[]): string | null {
  return heureDecalee(trajet.depart.heure, perturbations)
}

/**
 * L'heure d'arrivée à afficher, une fois les retards appliqués.
 *
 * Le même retard s'applique aux deux bouts : un bus parti en retard arrive en retard.
 * L'hypothèse inverse — un bus qui rattraperait son retard en route — ferait attendre
 * un parent à l'arrêt sur une heure que rien ne garantit.
 */
export function heureArriveeEffective(
  trajet: Trajet,
  perturbations: Perturbation[],
): string | null {
  return heureDecalee(trajet.arrivee.heure, perturbations)
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
