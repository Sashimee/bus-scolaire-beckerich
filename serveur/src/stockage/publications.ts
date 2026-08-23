/**
 * Stockage des données publiées (lot 25) : perturbations, corrections d'arrêts, et les
 * documents à ligne unique (traductions, horaires, crédits).
 *
 * Ce que le dépôt GitHub tenait dans des fichiers, la base le tient dans trois tables.
 * L'écriture est REVALIDÉE en amont, dans les routes ; ici on ne fait que ranger et
 * relire.
 */
import { base, type Sql } from './client.ts'

// — Perturbations ————————————————————————————————————————————————

export async function listerPerturbations(db: Sql = base()): Promise<any[]> {
  const lignes = await db`select donnees from perturbation order by publie_le`
  return lignes.map((l) => l.donnees)
}

/**
 * Enregistre (ou remplace) une perturbation. Renvoie `nouvelle: true` seulement si son
 * identifiant n'existait pas encore — c'est ce qui décide s'il faut notifier : republier
 * une perturbation corrigée ne doit pas re-réveiller les téléphones.
 */
export async function enregistrerPerturbation(
  id: string,
  donnees: unknown,
  db: Sql = base(),
): Promise<{ nouvelle: boolean }> {
  const r = await db`
    insert into perturbation (id, donnees) values (${id}, ${db.json(donnees as never)})
    on conflict (id) do update set donnees = excluded.donnees, publie_le = now()
    returning (xmax = 0) as nouvelle
  `
  return { nouvelle: Boolean(r[0]?.nouvelle) }
}

export async function supprimerPerturbation(id: string, db: Sql = base()): Promise<boolean> {
  const r = await db`delete from perturbation where id = ${id}`
  return r.count > 0
}

// — Corrections d'arrêts ——————————————————————————————————————————

export async function listerCorrections(db: Sql = base()): Promise<any[]> {
  const lignes = await db`select donnees from correction_arret order by publie_le`
  return lignes.map((l) => l.donnees)
}

export async function enregistrerCorrection(
  arret: string,
  donnees: unknown,
  db: Sql = base(),
): Promise<void> {
  await db`
    insert into correction_arret (arret, donnees) values (${arret}, ${db.json(donnees as never)})
    on conflict (arret) do update set donnees = excluded.donnees, publie_le = now()
  `
}

export async function supprimerCorrection(arret: string, db: Sql = base()): Promise<boolean> {
  const r = await db`delete from correction_arret where arret = ${arret}`
  return r.count > 0
}

// — Documents à ligne unique ——————————————————————————————————————

export type NomDocument = 'traductions' | 'horaires' | 'credits'

export interface Document {
  contenu: unknown
  version: string
  misAJour: Date
}

export async function lireDocument(nom: NomDocument, db: Sql = base()): Promise<Document | null> {
  const lignes = await db`select contenu, version, mis_a_jour from document where nom = ${nom}`
  if (!lignes.length) return null
  return {
    contenu: lignes[0].contenu,
    version: lignes[0].version as string,
    misAJour: lignes[0].mis_a_jour as Date,
  }
}

export async function ecrireDocument(
  nom: NomDocument,
  contenu: unknown,
  version: string,
  db: Sql = base(),
): Promise<void> {
  await db`
    insert into document (nom, contenu, version, mis_a_jour)
    values (${nom}, ${db.json(contenu as never)}, ${version}, now())
    on conflict (nom) do update
      set contenu = excluded.contenu, version = excluded.version, mis_a_jour = now()
  `
}
