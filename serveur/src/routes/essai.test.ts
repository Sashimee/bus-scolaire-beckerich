/**
 * Porté depuis `worker/src/essai.test.js`.
 *
 * La notification d'essai est authentifiée par la POSSESSION du endpoint : le
 * connaître ne permet que de se faire vibrer soi-même, une fois par minute au plus.
 * Ces tests sont ce qui garantit que cette phrase reste vraie.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'

const SCHEMA = 'essai_notification'
const avecBase = Boolean(process.env.DATABASE_URL_TEST)

let app: { request: (...a: any[]) => Promise<Response> }
let db: postgres.Sql
let enregistrer: (e: string, k: unknown, p: string) => Promise<void>

/** Paire de clés VAPID jetable, engendrée ici : aucun secret réel dans les tests. */
async function vapidJetable(): Promise<string> {
  const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const jwk = await crypto.subtle.exportKey('jwk', paire.privateKey)
  return JSON.stringify(jwk)
}

/** Clés d'abonnement plausibles : `push.js` exige un p256dh de 65 octets et un auth de 16. */
async function clesAbonne() {
  const paire = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const brut = new Uint8Array(await crypto.subtle.exportKey('raw', paire.publicKey))
  const b64 = (o: Uint8Array) =>
    btoa(String.fromCharCode(...o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { p256dh: b64(brut), auth: b64(crypto.getRandomValues(new Uint8Array(16))) }
}

beforeAll(async () => {
  if (!avecBase) return

  const brut = postgres(process.env.DATABASE_URL_TEST!, { onnotice: () => {} })
  await brut.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await brut.unsafe(`create schema ${SCHEMA}`)
  await brut.end({ timeout: 5 })

  const url = new URL(process.env.DATABASE_URL_TEST!)
  url.searchParams.set('options', `-c search_path=${SCHEMA}`)
  process.env.DATABASE_URL = url.href
  process.env.VAPID_JWK = await vapidJetable()
  process.env.CONTACT_VAPID = 'mailto:essai@example.org'
  process.env.ORIGINES_AUTORISEES = 'https://app.schoulbus.lu'
  process.env.BASE_API = '/api'

  const client = await import('../stockage/client.ts')
  await client.migrer()
  db = client.base()
  enregistrer = (await import('../stockage/abonnements.ts')).enregistrer as never
  app = (await import('../index.ts')).creerApplication() as never
}, 30_000)

afterAll(async () => {
  if (!avecBase || !db) return
  await db.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await (await import('../stockage/client.ts')).fermerBase()
})

beforeEach(async () => {
  if (!avecBase) return
  await db`truncate abonnement, ephemere`
  vi.restoreAllMocks()
})

const poster = (chemin: string, corps: unknown) =>
  app.request(`/api${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })

/** Intercepte les appels au service de push et retient ce qui lui a été envoyé. */
function espionnerPush() {
  const appels: { url: string; entetes: Record<string, string> }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (entree: any, init: any) => {
    appels.push({ url: String(entree), entetes: (init?.headers ?? {}) as Record<string, string> })
    return new Response('', { status: 201 })
  })
  return appels
}

describe.skipIf(!avecBase)('notification d’essai', () => {
  it('envoie à l’abonnement demandé, et à lui seul', async () => {
    await enregistrer('https://push.example/moi', await clesAbonne(), 'tout')
    await enregistrer('https://push.example/autre', await clesAbonne(), 'tout')
    const appels = espionnerPush()

    const rep = await poster('/essai', { endpoint: 'https://push.example/moi' })
    expect(rep.status).toBe(200)
    expect((await rep.json()) as any).toMatchObject({ envoyees: 1, echecs: 0 })
    expect(appels).toHaveLength(1)
    expect(appels[0].url).toBe('https://push.example/moi')
  })

  it('refuse un endpoint qui n’est pas déjà abonné', async () => {
    const rep = await poster('/essai', { endpoint: 'https://push.example/inconnu' })
    expect(rep.status).toBe(404)
    expect(await rep.json()).toEqual({ erreur: 'abonnement-inconnu' })
  })

  it('refuse un corps sans endpoint', async () => {
    expect((await poster('/essai', {})).status).toBe(400)
    expect((await poster('/essai', { endpoint: 42 })).status).toBe(400)
  })

  it('n’en laisse pas passer plus d’un par minute', async () => {
    await enregistrer('https://push.example/moi', await clesAbonne(), 'tout')
    espionnerPush()
    expect((await poster('/essai', { endpoint: 'https://push.example/moi' })).status).toBe(200)
    const rep = await poster('/essai', { endpoint: 'https://push.example/moi' })
    expect(rep.status).toBe(429)
    expect(await rep.json()).toEqual({ erreur: 'trop-frequent' })
  })

  it('compte la limite par abonnement, pas globalement', async () => {
    await enregistrer('https://push.example/a', await clesAbonne(), 'tout')
    await enregistrer('https://push.example/b', await clesAbonne(), 'tout')
    espionnerPush()
    expect((await poster('/essai', { endpoint: 'https://push.example/a' })).status).toBe(200)
    expect((await poster('/essai', { endpoint: 'https://push.example/b' })).status).toBe(200)
  })

  it('part malgré une préférence restrictive', async () => {
    // L'essai est demandé par l'abonné pour lui-même : le filtrer sur sa préférence
    // le laisserait sans réponse, exactement là où il cherche à vérifier que le
    // mécanisme fonctionne.
    await enregistrer('https://push.example/strict', await clesAbonne(), 'urgences')
    espionnerPush()
    const rep = await poster('/essai', { endpoint: 'https://push.example/strict' })
    expect((await rep.json()) as any).toMatchObject({ envoyees: 1 })
  })

  it('porte l’urgence ordinaire, pas celle d’une alerte', async () => {
    await enregistrer('https://push.example/moi', await clesAbonne(), 'tout')
    const appels = espionnerPush()
    await poster('/essai', { endpoint: 'https://push.example/moi' })
    expect(appels[0].entetes.Urgency ?? appels[0].entetes.urgency).toBe('normal')
  })
})
