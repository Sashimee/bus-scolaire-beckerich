/**
 * Limitation des tentatives de connexion — la réserve R4, levée.
 *
 * Sur le clé-valeur, le compteur se lisait puis se réécrivait. Entre les deux, la
 * cohérence différée laissait passer quelques tentatives de plus que les cinq
 * annoncées : la limite était un ordre de grandeur, pas une règle.
 *
 * Ici tout tient dans un seul énoncé atomique. La fenêtre se referme d'elle-même :
 * si `fenetre_fin` est passée, le compteur repart à 1 au lieu de s'incrémenter — sans
 * quoi une adresse bloquée une fois le resterait pour toujours.
 */
import { base, type Sql } from './client.ts'
import { empreinte } from '../crypto.ts'

export const TENTATIVES_MAX = 5
export const FENETRE_DEBIT_S = 15 * 60

export async function debitDepasse(ip: string, db: Sql = base()): Promise<boolean> {
  const cle = await empreinte(ip)
  const [ligne] = await db`
    insert into debit (ip_hash, compte, fenetre_fin)
    values (${cle}, 1, now() + make_interval(secs => ${FENETRE_DEBIT_S}))
    on conflict (ip_hash) do update set
      compte = case when debit.fenetre_fin <= now() then 1 else debit.compte + 1 end,
      fenetre_fin = case
        when debit.fenetre_fin <= now()
        then now() + make_interval(secs => ${FENETRE_DEBIT_S})
        else debit.fenetre_fin
      end
    returning compte
  `
  return Number(ligne.compte) > TENTATIVES_MAX
}

/** Une connexion réussie efface le compteur : c'est le comportement d'avant. */
export async function reussite(ip: string, db: Sql = base()): Promise<void> {
  await db`delete from debit where ip_hash = ${await empreinte(ip)}`
}

export async function balayerDebits(db: Sql = base()): Promise<number> {
  const efface = await db`delete from debit where fenetre_fin <= now()`
  return efface.count
}
