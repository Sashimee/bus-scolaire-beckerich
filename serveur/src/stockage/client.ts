/**
 * Connexion à PostgreSQL, et application des migrations au démarrage.
 */
import postgres from 'postgres'
import { MIGRATIONS } from '../migrations/index.ts'

export type Sql = postgres.Sql

let sql: Sql | null = null

/**
 * Le pool, créé une seule fois.
 *
 * `DATABASE_URL` absente n'est PAS une erreur au chargement du module : le serveur
 * doit pouvoir démarrer sans base pour répondre `/sante`, exactement comme le Worker
 * démarrait sans `SECRET_SESSION` et répondait 503 sur `/commune/*`. C'est ce qui
 * permet de diagnostiquer une panne de configuration en regardant `/sante`, plutôt
 * qu'en cherchant pourquoi le conteneur redémarre en boucle.
 */
export function base(): Sql {
  if (sql) return sql
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('base-non-configuree')
  sql = postgres(url, {
    max: Number(process.env.PG_POOL_MAX ?? 10),
    // Les identifiants sont en français dans les migrations ; sans cette option,
    // `postgres` convertirait `expire_le` en `expireLe` et l'inverse, ce qui rendrait
    // les requêtes écrites ici fausses à la lecture des résultats.
    transform: undefined,
    onnotice: () => {},
  })
  return sql
}

export const baseConfiguree = () => Boolean(process.env.DATABASE_URL)

/** Ferme le pool. Utile aux tests et à l'arrêt propre du conteneur. */
export async function fermerBase(): Promise<void> {
  if (!sql) return
  await sql.end({ timeout: 5 })
  sql = null
}

/**
 * Applique les migrations manquantes, dans une transaction chacune.
 *
 * Pas de bibliothèque : les fichiers sont numérotés, la table dit lesquels sont
 * passés, et un fichier déjà appliqué n'est jamais rejoué. Ajouter un outil pour
 * cela reviendrait à ajouter une dépendance de plus à un serveur qui en compte trois.
 */
export async function migrer(db: Sql = base()): Promise<string[]> {
  await db`
    create table if not exists migration (
      nom      text primary key,
      applique timestamptz not null default now()
    )
  `

  const deja = new Set((await db`select nom from migration`).map((l) => l.nom as string))
  const appliquees: string[] = []

  for (const { nom, sql: contenu } of MIGRATIONS) {
    if (deja.has(nom)) continue
    await db.begin(async (tx) => {
      await tx.unsafe(contenu)
      await tx`insert into migration ${tx({ nom })}`
    })
    appliquees.push(nom)
  }

  return appliquees
}
