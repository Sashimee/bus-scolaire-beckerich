/**
 * Ce qui expire tout seul : états OAuth, verrous d'essai, états de rappel.
 *
 * Le clé-valeur offrait un `expirationTtl` par écriture. Ici, `expire_le` est une
 * colonne, et **toute lecture la filtre**. Le balayeur ci-dessous ne récupère que de
 * la place : il n'est jamais ce qui garantit qu'une valeur périmée ne ressorte pas.
 * S'y fier reviendrait à faire dépendre l'expiration d'une tâche de fond, donc à la
 * perdre le jour où cette tâche tombe.
 */
import { base, type Sql } from './client.ts'

export async function lireEphemere<T = unknown>(cle: string, db: Sql = base()): Promise<T | null> {
  const lignes = await db`select valeur from ephemere where cle = ${cle} and expire_le > now()`
  return lignes.length ? (lignes[0].valeur as T) : null
}

export async function ecrireEphemere(
  cle: string,
  valeur: unknown,
  dureeSecondes: number,
  db: Sql = base(),
): Promise<void> {
  await db`
    insert into ephemere (cle, valeur, expire_le)
    values (${cle}, ${db.json(valeur as never)}, now() + make_interval(secs => ${dureeSecondes}))
    on conflict (cle) do update
      set valeur = excluded.valeur, expire_le = excluded.expire_le
  `
}

export async function supprimerEphemere(cle: string, db: Sql = base()): Promise<void> {
  await db`delete from ephemere where cle = ${cle}`
}

/** Récupère la place des valeurs périmées. Appelé par le planificateur. */
export async function balayerEphemeres(db: Sql = base()): Promise<number> {
  const efface = await db`delete from ephemere where expire_le <= now()`
  return efface.count
}
