/**
 * Export vers les agendas.
 *
 * Deux étages, volontairement séparés : `evenements.ts` calcule ce qui doit figurer
 * dans un agenda, `ics.ts` le met en forme. Un second producteur — l'API Google, au
 * lot 13 — se branche sur le premier sans toucher au calcul.
 */
import { evenementsEnfant, type EvenementRecurrent, type OptionsAgenda } from './evenements'
import { versIcs } from './ics'
import type { ContexteEnfant } from '../plan'

export { evenementsEnfant, versIcs }
export type { EvenementRecurrent, OptionsAgenda }

/** Le calendrier d'un seul enfant. */
export function icsEnfant(ctx: ContexteEnfant, o: OptionsAgenda): string {
  return versIcs(evenementsEnfant(ctx, o), `Bus scolaire — ${ctx.enfant.prenom}`)
}

/**
 * Le calendrier de tout le foyer, en un seul fichier.
 *
 * Un parent de trois enfants importait trois fichiers, donc trois calendriers à
 * activer, masquer ou supprimer séparément. Les titres portent déjà le prénom : un
 * calendrier unique reste lisible et se gère d'un geste.
 */
export function icsFoyer(contextes: ContexteEnfant[], o: OptionsAgenda, nom: string): string {
  return versIcs(
    contextes.flatMap((ctx) => evenementsEnfant(ctx, o)),
    nom,
  )
}
