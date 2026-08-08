/**
 * Chargement de la surcouche de traduction.
 *
 * Séparé de `src/lib/traductions.ts`, qui porte les règles : celui-là est importé par
 * le Worker, qui n'a ni `fetch` vers le site ni `import.meta.env`. Ici, on est
 * franchement côté navigateur.
 */
import { relireSurcouche, SURCOUCHE_VIDE, type Surcouche } from '../lib/traductions'

/**
 * Relit `public/traductions.json`. Hors ligne, on renvoie une surcouche vide plutôt
 * qu'une erreur : les dictionnaires du bundle sont complets, l'application reste
 * entièrement lisible sans ce fichier.
 */
export async function chargerTraductions(signal?: AbortSignal): Promise<Surcouche> {
  try {
    const rep = await fetch(`${import.meta.env.BASE_URL}traductions.json`, {
      cache: 'no-store',
      signal,
    })
    if (!rep.ok) return SURCOUCHE_VIDE
    return relireSurcouche(await rep.json())
  } catch {
    return SURCOUCHE_VIDE
  }
}
