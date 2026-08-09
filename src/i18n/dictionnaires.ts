/**
 * Les cinq dictionnaires compilés, et l'accès à une valeur par chemin pointé.
 *
 * Séparés du fournisseur React : l'éditeur de traductions doit pouvoir lire la valeur
 * d'une langue qui n'est pas celle affichée à l'écran — celle qu'il corrige, et celle à
 * laquelle il la compare.
 *
 * Séparés aussi de `src/lib/traductions.ts`, qui n'a besoin que du français comme
 * référence et qui est importé par le Worker : lui charger les cinq dictionnaires
 * alourdirait son bundle pour rien.
 */
import fr from './fr.json'
import de from './de.json'
import lb from './lb.json'
import pt from './pt.json'
import en from './en.json'
import type { Langue } from './langues'

export type Dictionnaire = Record<string, unknown>

export const DICTIONNAIRES: Record<Langue, Dictionnaire> = { fr, de, lb, pt, en }

/** Suit un chemin pointé. `undefined` si la clé n'existe pas dans cette langue. */
export function chercher(dico: Dictionnaire, chemin: string): unknown {
  return chemin.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, dico)
}

/**
 * La valeur compilée d'une clé dans une langue, avec repli sur le français.
 *
 * C'est ce qu'un parent lit aujourd'hui, avant toute correction : donc ce que l'éditeur
 * doit proposer à corriger. Il montrait un champ vide, ce qui obligeait à retaper une
 * traduction qui existait déjà.
 */
export function valeurCompilee(langue: Langue, cle: string): unknown {
  return chercher(DICTIONNAIRES[langue], cle) ?? chercher(fr, cle)
}
