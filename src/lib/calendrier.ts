/**
 * Calendrier scolaire.
 *
 * Une seule responsabilité depuis le lot 12 : savoir s'il y a école un jour donné. La
 * fabrication des agendas vit dans `src/lib/agenda/`, qui s'appuie sur ce module —
 * mélanger les deux rendait impossible l'ajout d'un second format sans réécrire le
 * calcul.
 */
import { vacances, type AnneeVacances } from './donnees'
import type { Jour } from './types'
import { JOURS } from './types'

/** Date locale au format AAAA-MM-JJ, sans décalage de fuseau. */
export function isoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const jj = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${jj}`
}

/**
 * Lit une date « AAAA-MM-JJ » comme une date LOCALE.
 *
 * `new Date('2026-09-15')` serait interprété en UTC : à l'ouest de Greenwich, la
 * rentrée tomberait la veille et tout le calendrier serait décalé d'un jour.
 */
export function depuisIso(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(a, m - 1, j)
}

/** Le jour de classe correspondant à une date, ou `null` le week-end. */
export function jourDeSemaine(d: Date): Jour | null {
  const i = d.getDay()
  return i >= 1 && i <= 5 ? JOURS[i - 1] : null
}

/**
 * L'année scolaire couvrant cette date, si elle est connue.
 *
 * La couverture va au-delà du dernier jour de cours : le congé d'été déborde sur la
 * rentrée suivante, et c'est précisément en août qu'un parent risque d'ouvrir
 * l'application pour préparer la rentrée.
 */
export function anneePour(d: Date): AnneeVacances | null {
  const iso = isoDate(d)
  return (
    vacances.annees.find((a) => {
      const finCouverture = a.vacances.reduce((max, v) => (v.au > max ? v.au : max), a.fin)
      return iso >= a.debut && iso <= finCouverture
    }) ?? null
  )
}

/**
 * L'année scolaire à exporter vers les agendas : celle en cours si elle est
 * complètement renseignée, sinon la prochaine qui l'est. On n'exporte jamais une
 * année partielle, dont les vacances manquantes produiraient des rappels erronés.
 */
export function anneeAExporter(aujourdhui = new Date()): AnneeVacances | null {
  const iso = isoDate(aujourdhui)
  const completes = vacances.annees.filter((a) => !a.partiel)
  return completes.find((a) => iso <= a.fin) ?? completes.at(-1) ?? null
}

/**
 * Les dates du lundi au vendredi de la semaine en cours.
 *
 * Sert à rattacher une perturbation, qui porte une date, à la fiche hebdomadaire d'un
 * enfant, qui raisonne en jours de semaine. Le week-end, on affiche la semaine à venir :
 * un parent qui consulte le samedi prépare le lundi, pas la veille.
 */
export function datesDeLaSemaine(reference = new Date()): Record<Jour, Date> {
  const base = new Date(reference)
  base.setHours(0, 0, 0, 0)
  const jourSemaine = base.getDay()
  const decalageLundi = jourSemaine === 0 ? 1 : jourSemaine === 6 ? 2 : 1 - jourSemaine
  base.setDate(base.getDate() + decalageLundi)

  return Object.fromEntries(
    JOURS.map((j, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      return [j, d]
    }),
  ) as Record<Jour, Date>
}

export type RaisonSansEcole = 'weekend' | 'vacances' | 'ferie' | 'annee-inconnue'

export interface EtatJour {
  ecole: boolean
  raison?: RaisonSansEcole
  /** Identifiant de la période de vacances ou du jour férié, pour l'affichage. */
  id?: string
}

/**
 * Y a-t-il école ce jour-là ?
 *
 * Si la date sort des années scolaires connues, l'application le dit franchement
 * (`annee-inconnue`) plutôt que d'affirmer une réponse qu'elle n'a pas.
 */
export function etatDuJour(d: Date): EtatJour {
  if (!jourDeSemaine(d)) return { ecole: false, raison: 'weekend' }

  const annee = anneePour(d)
  if (!annee) return { ecole: false, raison: 'annee-inconnue' }

  const iso = isoDate(d)
  const conge = annee.vacances.find((v) => iso >= v.du && iso <= v.au)
  if (conge) return { ecole: false, raison: 'vacances', id: conge.id }

  const ferie = annee.feries.find((f) => f.date === iso)
  if (ferie) return { ecole: false, raison: 'ferie', id: ferie.id }

  // Année partiellement renseignée : hors des périodes connues, on ne conclut pas.
  if (annee.partiel) return { ecole: false, raison: 'annee-inconnue' }

  return { ecole: true }
}

/** Toutes les dates sans école d'une année scolaire, jour de semaine uniquement. */
export function datesSansEcole(annee: AnneeVacances): Date[] {
  const out: Date[] = []
  const fin = depuisIso(annee.fin)
  for (const d = depuisIso(annee.debut); d <= fin; d.setDate(d.getDate() + 1)) {
    if (!jourDeSemaine(d)) continue
    const iso = isoDate(d)
    const enConge = annee.vacances.some((v) => iso >= v.du && iso <= v.au)
    const ferie = annee.feries.some((f) => f.date === iso)
    if (enConge || ferie) out.push(new Date(d))
  }
  return out
}
