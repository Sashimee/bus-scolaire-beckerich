/**
 * Les capacités d'un compte.
 *
 * Une capacité = un droit d'éditer UNE nature de donnée. Le jeton de session porte
 * l'ensemble accordé au compte ; chaque route d'édition en exige une, nommément. Ce
 * modèle subsume les deux rôles figés d'avant : `commune` valait perturbations +
 * horaires, `traductions` valait traductions.
 *
 * La liste est fermée et vérifiée à la création d'un compte : accorder une capacité qui
 * n'existe pas est une faute, pas un droit inerte qu'on découvre le jour où on tente de
 * s'en servir.
 */
export const CAPACITES = [
  'perturbations',
  'arrets',
  'horaires',
  'traductions',
  'credits',
  // La méta-capacité : gérer les comptes eux-mêmes (créer, modifier, désactiver).
  'comptes',
] as const

export type Capacite = (typeof CAPACITES)[number]

export function estCapacite(x: unknown): x is Capacite {
  return typeof x === 'string' && (CAPACITES as readonly string[]).includes(x)
}

/** Ne garde d'une liste que des capacités connues, sans doublon. Le reste est écarté. */
export function capacitesPropres(brut: unknown): Capacite[] {
  if (!Array.isArray(brut)) return []
  return [...new Set(brut.filter(estCapacite))]
}
