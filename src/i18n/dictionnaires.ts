/**
 * Les dictionnaires, et l'accès à une valeur par chemin pointé.
 *
 * Le français est là d'emblée : c'est la langue de référence, le repli de toutes les
 * autres, et celle de la majorité des familles. Les quatre autres sont chargées à la
 * demande — un parent luxembourgeois n'a rien à faire du portugais, et les cinq
 * dictionnaires réunis pèsent plus du tiers de ce que l'application télécharge au
 * premier lancement.
 *
 * Séparés du fournisseur React : l'éditeur de traductions doit pouvoir lire la valeur
 * d'une langue qui n'est pas celle affichée à l'écran. Séparés aussi de
 * `src/lib/traductions.ts`, qui n'a besoin que du français comme référence et qui est
 * importé par le serveur.
 */
import fr from './fr.json'
import type { Langue } from './langues'

export type Dictionnaire = Record<string, unknown>

const charges: Partial<Record<Langue, Dictionnaire>> = { fr }

const SOURCES: Record<Langue, () => Promise<{ default: Dictionnaire }>> = {
  fr: () => Promise.resolve({ default: fr }),
  de: () => import('./de.json'),
  lb: () => import('./lb.json'),
  pt: () => import('./pt.json'),
  en: () => import('./en.json'),
}

/**
 * Le dictionnaire d'une langue, ou le français tant qu'il n'est pas arrivé.
 *
 * Ce repli n'est pas un pis-aller silencieux : c'est déjà la règle de traduction de
 * l'application — une clé absente d'une langue se lit en français plutôt que de
 * disparaître.
 */
export function dictionnaire(langue: Langue): Dictionnaire {
  return charges[langue] ?? fr
}

export const dictionnaireCharge = (langue: Langue): boolean => charges[langue] !== undefined

export async function chargerDictionnaire(langue: Langue): Promise<void> {
  if (charges[langue]) return
  charges[langue] = (await SOURCES[langue]()).default
}

/** Suit un chemin pointé. `undefined` si la clé n'existe pas dans cette langue. */
export function chercher(dico: Dictionnaire, chemin: string): unknown {
  return chemin.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, dico)
}
