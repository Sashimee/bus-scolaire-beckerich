/**
 * Les codes d'accès des deux espaces à code personnel.
 *
 * Le code n'est jamais stocké : seulement son empreinte SHA-256. Il s'affiche une
 * seule fois, à la création, et personne — pas même le mainteneur — ne peut le
 * retrouver ensuite.
 *
 * **Deux tables, et non une table avec une colonne `role`.** La séparation entre
 * l'espace commune et l'espace traduction reposait sur deux barrières indépendantes :
 * deux préfixes de clés, et le rôle réinscrit dans le jeton signé. Fondre les deux
 * tables en une n'en laisserait qu'une seule, suspendue à un `where role = …` qu'un
 * jour quelqu'un oubliera d'écrire. Le coût de la duplication ici est de quatre
 * lignes ; celui de l'oubli serait un traducteur qui publie des horaires.
 */
import { base, type Sql } from './client.ts'

export type Role = 'commune' | 'traductions'

/** Le rôle décide de la TABLE, pas d'une clause de filtrage. */
const TABLES: Record<Role, string> = {
  commune: 'agent_commune',
  traductions: 'agent_traduction',
}

export interface Agent {
  nom: string
  service: string
}

export function tableDuRole(role: string): string | null {
  return Object.prototype.hasOwnProperty.call(TABLES, role) ? TABLES[role as Role] : null
}

export async function lireAgent(
  role: Role,
  codeHash: string,
  db: Sql = base(),
): Promise<Agent | null> {
  const table = tableDuRole(role)
  if (!table) return null
  const lignes = await db`
    select nom, service from ${db(table)} where code_hash = ${codeHash}
  `
  return lignes.length ? { nom: lignes[0].nom as string, service: lignes[0].service as string } : null
}

export async function noterAcces(role: Role, codeHash: string, db: Sql = base()): Promise<void> {
  const table = tableDuRole(role)
  if (!table) return
  await db`update ${db(table)} set dernier_acces = now() where code_hash = ${codeHash}`
}

export async function creerAgent(
  role: Role,
  codeHash: string,
  nom: string,
  service: string,
  db: Sql = base(),
): Promise<void> {
  const table = tableDuRole(role)
  if (!table) throw new Error('role-inconnu')
  await db`
    insert into ${db(table)} (code_hash, nom, service)
    values (${codeHash}, ${nom}, ${service})
    on conflict (code_hash) do nothing
  `
}

export async function listerAgents(
  role: Role,
  db: Sql = base(),
): Promise<{ nom: string; service: string; creeLe: Date; dernierAcces: Date | null }[]> {
  const table = tableDuRole(role)
  if (!table) return []
  const lignes = await db`
    select nom, service, cree_le, dernier_acces from ${db(table)} order by cree_le
  `
  return lignes.map((l) => ({
    nom: l.nom as string,
    service: l.service as string,
    creeLe: l.cree_le as Date,
    dernierAcces: l.dernier_acces as Date | null,
  }))
}

export async function supprimerAgent(
  role: Role,
  codeHash: string,
  db: Sql = base(),
): Promise<boolean> {
  const table = tableDuRole(role)
  if (!table) return false
  const efface = await db`delete from ${db(table)} where code_hash = ${codeHash}`
  return efface.count > 0
}
