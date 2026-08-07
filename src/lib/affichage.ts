/**
 * Mise en forme des données pour l'affichage.
 *
 * Isolé du moteur : `plan.ts` ne connaît que des identifiants, c'est ici qu'on les
 * traduit en texte lisible.
 */
import type { Traduction } from '../i18n'
import { arret as trouverArret, plan } from './donnees'
import type { Arret, ArretDesservi, Ligne, Service } from './types'

/**
 * Aligne les services d'une ligne sur une même colonne d'arrêts, pour l'affichage
 * en tableau.
 *
 * On ne peut pas se contenter de l'index : sur l'Aller 1, la course de l'après-midi
 * part de Beckerich alors que celle du matin commence à Huttange. Aligner par
 * position décalerait toute la colonne du matin d'un cran. On parcourt donc les deux
 * séquences en parallèle, en avançant dans le service quand l'arrêt correspond.
 */
export function alignerServices(ligne: Ligne): {
  reference: ArretDesservi[]
  colonnes: { service: Service; cases: (ArretDesservi | null)[] }[]
} {
  const reference = ligne.services.reduce((a, b) =>
    b.arrets.length > a.arrets.length ? b : a,
  ).arrets

  const colonnes = ligne.services.map((service) => {
    let curseur = 0
    const cases = reference.map((ref) => {
      for (let k = curseur; k < service.arrets.length; k++) {
        if (service.arrets[k].arret === ref.arret) {
          curseur = k + 1
          return service.arrets[k]
        }
      }
      return null
    })
    return { service, cases }
  })

  return { reference, colonnes }
}

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
