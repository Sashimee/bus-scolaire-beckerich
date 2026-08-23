/**
 * Lectures publiques (lot 25) : ce que le site lit à chaque ouverture, servi depuis la
 * base et non plus depuis des fichiers du dépôt. Contre la vraie application Hono et une
 * vraie base, par `app.request()`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'

const SCHEMA = 'essai_publiques'
const avecBase = Boolean(process.env.DATABASE_URL_TEST)

let app: { request: (...a: any[]) => Promise<Response> }
let db: postgres.Sql
let pub: typeof import('../stockage/publications.ts')

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
  process.env.ORIGINES_AUTORISEES = 'https://app.schoulbus.lu'

  const client = await import('../stockage/client.ts')
  await client.migrer()
  db = client.base()
  pub = await import('../stockage/publications.ts')
  app = (await import('../index.ts')).creerApplication() as never
}, 30_000)

afterAll(async () => {
  if (!avecBase || !db) return
  await db.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await (await import('../stockage/client.ts')).fermerBase()
})

beforeEach(async () => {
  if (!avecBase) return
  await db`truncate perturbation, correction_arret, document`
})

const lire = async (chemin: string) => (await app.request(`/api${chemin}`)) as Response
const json = async (chemin: string) => (await (await lire(chemin)).json()) as any

describe.skipIf(!avecBase)('lectures publiques', () => {
  describe('/urgences', () => {
    it('vides par défaut, mais dans la bonne forme', async () => {
      const u = await json('/urgences')
      expect(u).toMatchObject({ version: 1, perturbations: [], correctionsArrets: [] })
    })

    it('rend les perturbations et corrections publiées', async () => {
      await pub.enregistrerPerturbation('p1', { id: 'p1', type: 'annulation', message: { fr: 'x' } })
      await pub.enregistrerCorrection('a1', { arret: 'a1', coord: [6, 49] })
      const u = await json('/urgences')
      expect(u.perturbations).toHaveLength(1)
      expect(u.perturbations[0].id).toBe('p1')
      expect(u.correctionsArrets).toHaveLength(1)
      expect(u.correctionsArrets[0].arret).toBe('a1')
    })
  })

  describe('/horaires', () => {
    it('retombe sur le plan embarqué quand rien n\'est publié', async () => {
      const h = await json('/horaires')
      expect(h.version).toBe('embarque')
      expect(h.plan?.lignes?.length ?? 0).toBeGreaterThan(0)
    })

    it('sert le plan publié, avec sa version', async () => {
      await pub.ecrireDocument('horaires', { lignes: [{ id: 'test' }] }, 'v2')
      const h = await json('/horaires')
      expect(h.version).toBe('v2')
      expect(h.plan.lignes[0].id).toBe('test')
    })
  })

  describe('/credits', () => {
    it('retombe sur les crédits embarqués', async () => {
      const c = await json('/credits')
      expect(c.version).toBe('embarque')
      expect(c.credits.developpement?.length ?? 0).toBeGreaterThan(0)
    })

    it('sert les crédits publiés', async () => {
      await pub.ecrireDocument('credits', { developpement: [{ nom: 'X' }] }, 'v1')
      const c = await json('/credits')
      expect(c.credits.developpement[0].nom).toBe('X')
    })
  })

  describe('/traductions', () => {
    it('langues vides par défaut', async () => {
      const t = await json('/traductions')
      expect(t.langues).toEqual({})
    })

    it('sert la surcouche publiée', async () => {
      await pub.ecrireDocument('traductions', { langues: { de: { 'nav.limites': 'X' } } }, 'v1')
      const t = await json('/traductions')
      expect(t.langues.de['nav.limites']).toBe('X')
    })
  })

  describe('détection nouvelle / mise à jour', () => {
    it('enregistrerPerturbation dit `nouvelle` à la première pose, pas à la reprise', async () => {
      const a = await pub.enregistrerPerturbation('p1', { id: 'p1', v: 1 })
      expect(a.nouvelle).toBe(true)
      const b = await pub.enregistrerPerturbation('p1', { id: 'p1', v: 2 })
      expect(b.nouvelle).toBe(false)
      // La reprise a bien remplacé le contenu.
      const liste = await pub.listerPerturbations(db)
      expect(liste[0].v).toBe(2)
    })

    it('supprimer une perturbation la retire', async () => {
      await pub.enregistrerPerturbation('p1', { id: 'p1' })
      expect(await pub.supprimerPerturbation('p1')).toBe(true)
      expect(await pub.listerPerturbations(db)).toHaveLength(0)
    })
  })
})
