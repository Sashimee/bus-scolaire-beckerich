/**
 * Crédits : qui a fait quoi.
 *
 * Fichier du bundle et non surcouche relue à l'exécution : une page de crédits doit
 * s'afficher hors ligne, et rien n'y presse au point de justifier un second fichier
 * relu à chaque ouverture. Il s'édite depuis `/admin` comme les autres données du
 * dépôt, avec le redéploiement que cela implique.
 *
 * Ce module porte aussi les garde-fous : ce fichier est le seul du projet à publier des
 * noms de personnes, et il est modifiable depuis une page web.
 */
import creditsJson from '../data/credits.json'
import { LANGUES, type Langue } from '../i18n/langues'

export interface Credit {
  nom: string
  /** Ce que la personne a fait. Facultatif. */
  role?: string
  /** Pourquoi on la remercie. Facultatif. */
  motif?: string
  /** Page personnelle. Rendue cliquable seulement si c'est bien une adresse web. */
  lien?: string
}

export interface Credits {
  developpement: Credit[]
  traductions: Partial<Record<Langue, Credit[]>>
  remerciements: Credit[]
}

const NOM_MAX = 80
const TEXTE_MAX = 120

/**
 * Un lien collé dans `/admin` devient un lien cliquable sur une page publique. Un
 * `javascript:` y serait exécutable : on ne rend donc que ce qui est franchement une
 * adresse web.
 */
export function lienSur(lien: string | undefined): string | null {
  if (!lien) return null
  try {
    const url = new URL(lien)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

const texteSur = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined
  const propre = v.trim().slice(0, max)
  return propre || undefined
}

/** Relit une entrée. `null` si elle n'a même pas de nom : il n'y aurait rien à afficher. */
export function relireCredit(brut: unknown): Credit | null {
  if (!brut || typeof brut !== 'object') return null
  const c = brut as Record<string, unknown>
  const nom = texteSur(c.nom, NOM_MAX)
  if (!nom) return null
  return {
    nom,
    ...(texteSur(c.role, TEXTE_MAX) ? { role: texteSur(c.role, TEXTE_MAX) } : {}),
    ...(texteSur(c.motif, TEXTE_MAX) ? { motif: texteSur(c.motif, TEXTE_MAX) } : {}),
    // Le lien est conservé tel quel ; c'est `lienSur` qui décide de le rendre ou non.
    ...(texteSur(c.lien, 300) ? { lien: texteSur(c.lien, 300) } : {}),
  }
}

const relireListe = (brut: unknown): Credit[] =>
  Array.isArray(brut) ? brut.map(relireCredit).filter((c): c is Credit => c !== null) : []

export function relireCredits(brut: unknown): Credits {
  const c = (brut ?? {}) as Record<string, unknown>
  const parLangue = (c.traductions ?? {}) as Record<string, unknown>
  const traductions: Partial<Record<Langue, Credit[]>> = {}
  for (const langue of LANGUES) {
    const liste = relireListe(parLangue[langue])
    // Une langue sans traducteur déclaré n'apparaît pas : un bloc vide se lirait
    // comme un oubli plutôt que comme une absence.
    if (liste.length) traductions[langue] = liste
  }
  return {
    developpement: relireListe(c.developpement),
    traductions,
    remerciements: relireListe(c.remerciements),
  }
}

export const credits: Credits = relireCredits(creditsJson)
