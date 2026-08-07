/**
 * Mise en forme des données pour l'affichage.
 *
 * Isolé du moteur : `plan.ts` ne connaît que des identifiants, c'est ici qu'on les
 * traduit en texte lisible.
 */
import type { Traduction } from '../i18n'
import { arret as trouverArret, plan } from './donnees'
import type { Arret } from './types'

/**
 * Nom affiché d'un arrêt : « Noerdange · École », « Hovelange · Kneppchen ».
 * Les noms propres luxembourgeois ne sont jamais traduits ; les mots génériques le sont.
 */
export function nomArret(a: Arret, t: Traduction['t']): string {
  const lieu = a.lieuNom ?? (a.lieuCle ? t(`arrets.${a.lieuCle}`) : '')
  // Un arrêt « village » porte déjà le nom de la localité : inutile de le répéter.
  if (!lieu || a.lieuCle === 'village') return a.village
  return `${a.village} · ${lieu}`
}

export function nomArretParId(id: string, t: Traduction['t']): string {
  return nomArret(trouverArret(id), t)
}

/** Heure affichable, ou mention explicite quand le plan ne la publie pas. */
export function heureOuMention(heure: string | null, t: Traduction['t']): string {
  return heure ?? t('trajets.heureNonPubliee')
}

/** « 1,2 km » ou « 640 m » selon la distance. */
export function distanceLisible(metres: number): string {
  if (metres < 950) return `${Math.round(metres / 10) * 10} m`
  return `${(metres / 1000).toFixed(1).replace('.', ',')} km`
}

/** Le plan chargé est-il encore dans sa période de validité ? */
export function planPerime(aujourdhui = new Date()): boolean {
  return aujourdhui.toISOString().slice(0, 10) > plan.valideAu
}

/** Liste lisible : « 2025/2026 et 2026/2027 ». */
export function listeLisible(elements: string[], t: Traduction['t']): string {
  if (elements.length <= 1) return elements[0] ?? ''
  return `${elements.slice(0, -1).join(', ')} ${t('commun.et')} ${elements.at(-1)}`
}
