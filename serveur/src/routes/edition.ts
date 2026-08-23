/**
 * Édition gardée par CAPACITÉ (lot 24-25) : ce que l'ancien `/admin` faisait par jeton
 * GitHub personnel, replié sur les comptes à capacités. Chaque route exige une capacité
 * nommée et écrit en base, jamais dans le dépôt.
 *
 * Pour l'instant : les crédits (capacité `credits`). Les corrections d'arrêts et, à
 * terme, la consolidation des espaces `/commune` et `/traductions` viennent ensuite.
 */
import type { Context, Hono } from 'hono'
// Mêmes règles que le navigateur, importées et non réécrites.
import { relireCredits } from '../../../src/lib/credits.ts'
import { corpsJson } from '../http.ts'
import { exigerCapacite } from './comptes.ts'
import { ecrireDocument } from '../stockage/publications.ts'
import { journaliser } from '../stockage/journal.ts'

const TAILLE_CORPS_MAX = 64 * 1024

async function publierCredits(c: Context) {
  const r = await exigerCapacite(c, 'credits')
  if ('refus' in r) return r.refus

  const charge = await corpsJson<{ credits?: unknown }>(c, TAILLE_CORPS_MAX).catch(() => null)
  // Revalidé ici, quoi qu'ait fait le navigateur : `relireCredits` écarte les entrées
  // sans nom, tronque les textes trop longs, et ne garde des liens que ce que la page
  // publique rendra cliquable. C'est la même fonction que l'application, importée.
  const propre = relireCredits(charge?.credits)
  await ecrireDocument('credits', propre, new Date().toISOString())
  await journaliser(r.compte, 'credits', `${propre.developpement.length} dév · ${propre.remerciements.length} remerciements`)
  return c.json({ ok: true, credits: propre })
}

export function monterEdition(app: Hono): void {
  app.post('/edition/credits', publierCredits)
}
