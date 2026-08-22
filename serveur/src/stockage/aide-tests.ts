/**
 * Socle des tests de stockage.
 *
 * Ils exigent un vrai PostgreSQL — `pg-mem` et consorts ne rejouent ni
 * `on conflict … returning`, ni `make_interval`, ni le typage `jsonb`, et c'est
 * précisément ce qu'on veut vérifier ici. Sans `DATABASE_URL_TEST`, les tests se
 * SAUTENT plutôt que d'échouer : `npm test` doit rester lançable sans Docker, sinon
 * personne ne le lance.
 *
 *   docker compose up -d bus-postgres
 *   DATABASE_URL_TEST=postgres://bus:bus@localhost:5433/bus npm test
 *
 * Chaque fichier de test travaille dans son propre schéma, créé puis détruit : deux
 * fichiers lancés en parallèle ne se marchent pas dessus.
 */
import postgres from 'postgres'
import { migrer, type Sql } from './client.ts'

export const urlTest = () => process.env.DATABASE_URL_TEST ?? ''
export const avecBase = Boolean(process.env.DATABASE_URL_TEST)

export async function ouvrirSchema(nom: string): Promise<Sql> {
  const db = postgres(urlTest(), { max: 2, onnotice: () => {} })
  await db.unsafe(`drop schema if exists ${nom} cascade`)
  await db.unsafe(`create schema ${nom}`)
  await db.unsafe(`set search_path to ${nom}`)
  await db.end({ timeout: 5 })

  const schema = postgres(urlTest(), {
    max: 2,
    onnotice: () => {},
    connection: { search_path: nom },
  })
  await migrer(schema)
  return schema
}

export async function fermerSchema(db: Sql, nom: string): Promise<void> {
  await db.unsafe(`drop schema if exists ${nom} cascade`)
  await db.end({ timeout: 5 })
}
