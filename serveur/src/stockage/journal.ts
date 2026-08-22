/**
 * Journal des publications et des retraits : qui, quand, quoi.
 *
 * Purgé à 90 jours, plafonné à 50 entrées à la lecture. Sur le clé-valeur, l'ordre
 * chronologique s'obtenait en préfixant chaque clé d'un horodatage puis en triant les
 * noms — un tri alphabétique qui se serait trompé le jour où l'horodatage aurait
 * changé de nombre de chiffres. Ici c'est une colonne et un index.
 */
import { base, type Sql } from './client.ts'

export const DUREE_JOURNAL_JOURS = 90
export const JOURNAL_MAX = 50

export interface EntreeJournal {
  quand: string
  qui: string
  service: string
  action: string
  detail: string
}

export async function journaliser(
  agent: { nom?: string; service?: string } | null,
  action: string,
  detail: unknown,
  db: Sql = base(),
): Promise<void> {
  await db`
    insert into journal (qui, service, action, detail)
    values (
      ${agent?.nom ?? '?'},
      ${agent?.service ?? ''},
      ${action},
      ${String(detail ?? '').slice(0, 200)}
    )
  `
}

export async function lireJournal(db: Sql = base()): Promise<EntreeJournal[]> {
  const lignes = await db`
    select quand, qui, service, action, detail
    from journal order by quand desc limit ${JOURNAL_MAX}
  `
  return lignes.map((l) => ({
    quand: (l.quand as Date).toISOString(),
    qui: l.qui as string,
    service: l.service as string,
    action: l.action as string,
    detail: l.detail as string,
  }))
}

export async function purgerJournal(db: Sql = base()): Promise<number> {
  const efface = await db`
    delete from journal
    where quand < now() - make_interval(days => ${DUREE_JOURNAL_JOURS})
  `
  return efface.count
}
