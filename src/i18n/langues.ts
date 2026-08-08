/**
 * Les langues de l'application, isolées du fournisseur React.
 *
 * `src/lib/traductions.ts` en a besoin pour valider une correction, et le fournisseur
 * a besoin de la surcouche : les garder dans `index.tsx` ferait un cycle d'imports.
 */
export const LANGUES = ['fr', 'de', 'lb', 'pt', 'en'] as const
export type Langue = (typeof LANGUES)[number]

/** Nom de chaque langue, écrit dans cette langue. */
export const NOMS_LANGUES: Record<Langue, string> = {
  fr: 'Français',
  de: 'Deutsch',
  lb: 'Lëtzebuergesch',
  pt: 'Português',
  en: 'English',
}
