/**
 * `POST /abonner`, contre la vraie application Hono et une vraie base.
 *
 * Cette route n'exige aucun compte, et chaque notification fait ensuite un `fetch` sur
 * le point de terminaison enregistré. Elle ne contrôlait que `typeof === 'string'` : le
 * serveur émettait donc une requête vers l'adresse de son choix — y compris vers
 * l'intérieur de la VPS — et en renvoyait le début de la réponse dans le rapport
 * d'envoi. Le filtre lui-même est testé sans base dans `abonnement-endpoint.test.ts` ;
 * ici on vérifie que la ROUTE s'en sert. R58.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'

const SCHEMA = 'essai_abonnements'
const avecBase = Boolean(process.env.DATABASE_URL_TEST)

let app: { request: (...a: any[]) => Promise<Response> }
let db: postgres.Sql

beforeAll(async () => {
  if (!avecBase) return
  const brut = postgres(process.env.DATABASE_URL_TEST!, { onnotice: () => {} })
  await brut.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await brut.unsafe(`create schema ${SCHEMA}`)
  await brut.end({ timeout: 5 })

  const url = new URL(process.env.DATABASE_URL_TEST!)
  url.searchParams.set('options', `-c search_path=${SCHEMA}`)
  process.env.DATABASE_URL = url.href
  process.env.BASE_API = '/api'

  const client = await import('../stockage/client.ts')
  await client.migrer()
  db = client.base()
  app = (await import('../index.ts')).creerApplication() as never
}, 30_000)

afterAll(async () => {
  if (!avecBase || !db) return
  await db.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await (await import('../stockage/client.ts')).fermerBase()
})

beforeEach(async () => {
  if (!avecBase) return
  await db`truncate abonnement`
})

const abonner = (endpoint: string) =>
  app.request('/api/abonner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh: 'BCl0'.repeat(20), auth: 'aaaaaaaaaaaaaaaaaaaaaa' },
    }),
  })

describe.skipIf(!avecBase)('abonnement aux notifications', () => {
  it('accepte un point de terminaison d’un service de push connu', async () => {
    const rep = await abonner('https://fcm.googleapis.com/fcm/send/abc123')
    expect(rep.status).toBe(200)
    expect(await db`select 1 from abonnement`).toHaveLength(1)
  })

  it('refuse une adresse interne, et n’enregistre rien', async () => {
    for (const forge of [
      'http://127.0.0.1:3000/api/edition/credits',
      'https://169.254.169.254/latest/meta-data/',
      'https://bus-postgres:5432/',
      'https://fcm.googleapis.com.attaquant.example/x',
    ]) {
      const rep = await abonner(forge)
      expect(rep.status, forge).toBe(400)
      expect(await rep.json()).toEqual({ erreur: 'endpoint-refuse' })
    }
    expect(await db`select 1 from abonnement`).toHaveLength(0)
  })

  it('refuse encore ce qui n’est pas une chaîne', async () => {
    const rep = await app.request('/api/abonner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 42 }),
    })
    expect(rep.status).toBe(400)
  })
})
