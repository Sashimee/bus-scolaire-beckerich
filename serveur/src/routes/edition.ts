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
import { coordValide, dateIsoValide, texteSur } from '../../../src/lib/nettoyage.ts'
import { corpsJson } from '../http.ts'
import { exigerCapacite } from './comptes.ts'
import {
  ecrireDocument,
  enregistrerCorrection,
  supprimerCorrection,
} from '../stockage/publications.ts'
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

/**
 * Correction de position d'un arrêt (capacité `arrets`), refuge de l'ancien `/admin`.
 * Revalidée par les mêmes garde-fous que le navigateur — un arrêt ne peut être déplacé
 * hors du Luxembourg —, et l'auteur est celui de la session, jamais celui que le client
 * prétend.
 */
async function publierCorrection(c: Context) {
  const r = await exigerCapacite(c, 'arrets')
  if ('refus' in r) return r.refus

  const charge = await corpsJson<{ correction?: Record<string, unknown> }>(c, TAILLE_CORPS_MAX).catch(
    () => null,
  )
  const brut = charge?.correction ?? {}
  const arret = texteSur(brut.arret, 64)
  if (!arret || !coordValide(brut.coord)) return c.json({ erreur: 'charge-invalide' }, 400)

  const correction = {
    arret,
    coord: brut.coord,
    publieLe: new Date().toISOString(),
    publiePar: r.compte.nom,
    ...(dateIsoValide(brut.jusqua) ? { jusqua: brut.jusqua } : {}),
    ...(texteSur(brut.note, 200) ? { note: texteSur(brut.note, 200) } : {}),
  }
  await enregistrerCorrection(arret, correction)
  await journaliser(r.compte, 'correction-arret', `${arret} → ${brut.coord.join(', ')}`)
  return c.json({ ok: true })
}

async function retirerCorrection(c: Context) {
  const r = await exigerCapacite(c, 'arrets')
  if ('refus' in r) return r.refus
  const arret = texteSur(decodeURIComponent(c.req.param('arret') ?? ''), 64)
  if (!arret) return c.json({ erreur: 'arret-invalide' }, 400)
  await supprimerCorrection(arret)
  await journaliser(r.compte, 'correction-retrait', arret)
  return c.json({ ok: true })
}

export function monterEdition(app: Hono): void {
  app.post('/edition/credits', publierCredits)
  app.post('/edition/corrections', publierCorrection)
  app.delete('/edition/corrections/:arret', retirerCorrection)
}
