/**
 * Les cinq dictionnaires d'un bloc, pour l'éditeur de traductions et lui seul.
 *
 * Il compare une langue à une autre : il lui faut les cinq, tout de suite. Ce module
 * n'est atteint que depuis `/edition`, qui n'est plus chargé avec l'application — les
 * quatre dictionnaires non français y voyagent donc sans peser sur ce qu'un parent
 * télécharge. Partout ailleurs, c'est `dictionnaires.ts` et son chargement à la demande.
 */
import fr from './fr.json'
import de from './de.json'
import lb from './lb.json'
import pt from './pt.json'
import en from './en.json'
import { chercher, type Dictionnaire } from './dictionnaires'
import type { Langue } from './langues'

export const DICTIONNAIRES: Record<Langue, Dictionnaire> = { fr, de, lb, pt, en }

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
