/**
 * Tests de bout en bout de l'espace commune, portés depuis
 * `worker/src/commune.test.js`.
 *
 * Ils ne rejouent plus contre un faux clé-valeur mais contre la VRAIE application
 * Hono et une VRAIE base : `app.request()` traverse le routage, les intergiciels
 * CORS, la limitation de débit et le stockage. Les anciens tests simulaient le
 * stockage, donc ne pouvaient rien dire du montage — or c'est exactement là que le
 * premier défaut du portage s'est logé (le préflight de `/commune/` n'ouvrait pas
 * `Authorization`).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'

const SCHEMA = 'essai_routes'
const SECRET = 'secret-de-test-assez-long-pour-hmac'
const avecBase = Boolean(process.env.DATABASE_URL_TEST)

let app: { request: (...a: any[]) => Promise<Response> }
let db: postgres.Sql
let empreinte: (t: string) => Promise<string>
let signerJeton: (c: any, s: string) => Promise<string>

beforeAll(async () => {
  if (!avecBase) return

  const brut = postgres(process.env.DATABASE_URL_TEST!, { onnotice: () => {} })
  await brut.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await brut.unsafe(`create schema ${SCHEMA}`)
  await brut.end({ timeout: 5 })

  // Le `search_path` passé dans l'URL : c'est ce qui fait que l'application, qui ne
  // connaît que `DATABASE_URL`, travaille dans le schéma de ce fichier de test.
  const url = new URL(process.env.DATABASE_URL_TEST!)
  url.searchParams.set('options', `-c search_path=${SCHEMA}`)
  process.env.DATABASE_URL = url.href
  process.env.SECRET_SESSION = SECRET
  process.env.ORIGINES_AUTORISEES = 'https://app.schoulbus.lu'
  process.env.BASE_API = '/api'

  const client = await import('../stockage/client.ts')
  await client.migrer()
  db = client.base()

  const crypto = await import('../crypto.ts')
  empreinte = crypto.empreinte
  signerJeton = crypto.signerJeton as never

  app = (await import('../index.ts')).creerApplication() as never
}, 30_000)

afterAll(async () => {
  if (!avecBase || !db) return
  await db.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  const client = await import('../stockage/client.ts')
  await client.fermerBase()
})

beforeEach(async () => {
  if (!avecBase) return
  await db`truncate agent_commune, agent_traduction, debit, journal, ephemere`
})

/** Chaque appel vient d'une adresse propre, sauf mention contraire. */
const poster = (chemin: string, corps: unknown, entetes: Record<string, string> = {}) =>
  app.request(`/api${chemin}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
      ...entetes,
    },
    body: JSON.stringify(corps),
  })

async function inscrire(code: string, role = 'commune', nom = 'Marie', service = 'service technique') {
  const table = role === 'commune' ? 'agent_commune' : 'agent_traduction'
  await db`
    insert into ${db(table)} (code_hash, nom, service)
    values (${await empreinte(code)}, ${nom}, ${service})
  `
}

describe.skipIf(!avecBase)('connexion par code', () => {
  it('remet un jeton de session à un code connu', async () => {
    await inscrire('abcd-2345')
    const rep = await poster('/commune/connexion', { code: 'abcd-2345' })
    expect(rep.status).toBe(200)
    const corps = (await rep.json()) as any
    expect(corps.jeton).toBeTruthy()
    expect(corps.nom).toBe('Marie')
    expect(corps.role).toBe('commune')
  })

  it('accepte le code quelle que soit la casse ou les espaces autour', async () => {
    await inscrire('abcd-2345')
    for (const saisi of ['ABCD-2345', '  abcd-2345  ', 'AbCd-2345']) {
      const rep = await poster('/commune/connexion', { code: saisi })
      expect(rep.status, saisi).toBe(200)
    }
  })

  it('refuse un code inconnu sans dire pourquoi', async () => {
    const rep = await poster('/commune/connexion', { code: 'zzzz-9999' })
    expect(rep.status).toBe(401)
    // Le motif est le même que pour un code mal formé : rien ne doit permettre de
    // distinguer « ce code n'existe pas » de « ce code existe mais... ».
    expect(await rep.json()).toEqual({ erreur: 'code-inconnu' })
  })

  it('ne stocke jamais le code lui-même, seulement son empreinte', async () => {
    await inscrire('abcd-2345')
    const lignes = await db`select * from agent_commune`
    expect(JSON.stringify(lignes)).not.toContain('abcd-2345')
    expect(lignes[0].code_hash).toBe(await empreinte('abcd-2345'))
  })

  it('note la date du dernier accès, pour repérer un code oublié', async () => {
    await inscrire('abcd-2345')
    expect((await db`select dernier_acces from agent_commune`)[0].dernier_acces).toBeNull()
    await poster('/commune/connexion', { code: 'abcd-2345' })
    expect((await db`select dernier_acces from agent_commune`)[0].dernier_acces).not.toBeNull()
  })
})

describe.skipIf(!avecBase)('limitation de débit', () => {
  const depuis = (ip: string, code: string) =>
    poster('/commune/connexion', { code }, { 'X-Forwarded-For': `faux, ${ip}` })

  it('bloque après cinq tentatives dans le quart d’heure', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await depuis('198.51.100.1', 'zzzz-0000')).status).toBe(401)
    }
    const rep = await depuis('198.51.100.1', 'zzzz-0000')
    expect(rep.status).toBe(429)
    expect((await rep.json()) as any).toMatchObject({ erreur: 'trop-de-tentatives', minutes: 15 })
  })

  it('compte les tentatives par adresse, pas globalement', async () => {
    for (let i = 0; i < 6; i++) await depuis('198.51.100.2', 'zzzz-0000')
    expect((await depuis('198.51.100.2', 'zzzz-0000')).status).toBe(429)
    // Une autre adresse ne doit pas hériter du compteur de la première : c'est la
    // réserve R40, et elle casse en silence si l'IP est mal extraite.
    expect((await depuis('198.51.100.3', 'zzzz-0000')).status).toBe(401)
  })

  it('remet le compteur à zéro après une connexion réussie', async () => {
    await inscrire('abcd-2345')
    for (let i = 0; i < 4; i++) await depuis('198.51.100.4', 'zzzz-0000')
    expect((await depuis('198.51.100.4', 'abcd-2345')).status).toBe(200)
    for (let i = 0; i < 5; i++) {
      expect((await depuis('198.51.100.4', 'zzzz-0000')).status).toBe(401)
    }
  })
})

describe.skipIf(!avecBase)('contrôle d’accès des routes', () => {
  const jetonPour = async (role: string, expire = Date.now() / 1000 + 60) =>
    signerJeton({ nom: 'Marie', service: 'technique', role, expire }, SECRET)

  it('refuse une publication sans jeton', async () => {
    const rep = await poster('/commune/perturbations', { perturbation: {} })
    expect(rep.status).toBe(401)
    expect(await rep.json()).toEqual({ erreur: 'session-expiree' })
  })

  it('refuse une publication avec un jeton expiré', async () => {
    const jeton = await jetonPour('commune', Date.now() / 1000 - 1)
    const rep = await poster(
      '/commune/perturbations',
      { perturbation: {} },
      { Authorization: `Bearer ${jeton}` },
    )
    expect(rep.status).toBe(401)
  })

  it('refuse un jeton signé avec un autre secret', async () => {
    const jeton = await signerJeton(
      { nom: 'Pirate', service: '', role: 'commune', expire: Date.now() / 1000 + 60 },
      'un-autre-secret-entierement',
    )
    const rep = await app.request('/api/commune/journal', {
      headers: { Authorization: `Bearer ${jeton}` },
    })
    expect(rep.status).toBe(401)
  })

  it('laisse passer les routes qui ne concernent pas la commune', async () => {
    expect((await app.request('/api/sante')).status).toBe(200)
  })

  it('ouvre le journal à une session valide', async () => {
    const jeton = await jetonPour('commune')
    const rep = await app.request('/api/commune/journal', {
      headers: { Authorization: `Bearer ${jeton}` },
    })
    expect(rep.status).toBe(200)
    expect((await rep.json()) as any).toHaveProperty('entrees')
  })
})

/**
 * La propriété de sécurité la plus facile à perdre en changeant de stockage. Elle
 * repose sur DEUX barrières indépendantes : deux tables, et le rôle réinscrit dans le
 * jeton. Chacune est testée séparément — si l'une cède, l'autre doit tenir.
 */
describe.skipIf(!avecBase)('séparation des espaces commune et traduction', () => {
  it('refuse un code de commune sur l’espace traduction, et l’inverse', async () => {
    await inscrire('cccc-2345', 'commune')
    await inscrire('tttt-2345', 'traductions', 'Jean', 'bénévole')

    expect((await poster('/traductions/connexion', { code: 'cccc-2345' })).status).toBe(401)
    expect((await poster('/commune/connexion', { code: 'tttt-2345' })).status).toBe(401)
    expect((await poster('/commune/connexion', { code: 'cccc-2345' })).status).toBe(200)
    expect((await poster('/traductions/connexion', { code: 'tttt-2345' })).status).toBe(200)
  })

  it('refuse un jeton de commune sur une route de traduction', async () => {
    const jeton = await signerJeton(
      { nom: 'Marie', service: '', role: 'commune', expire: Date.now() / 1000 + 60 },
      SECRET,
    )
    const rep = await poster(
      '/traductions/publier',
      { langue: 'de', modifications: {} },
      { Authorization: `Bearer ${jeton}` },
    )
    expect(rep.status).toBe(401)
  })

  it('applique la limitation de débit aux deux connexions', async () => {
    const depuis = (chemin: string) =>
      poster(chemin, { code: 'zzzz-0000' }, { 'X-Forwarded-For': 'faux, 198.51.100.9' })
    for (let i = 0; i < 5; i++) await depuis('/commune/connexion')
    // Le compteur est commun aux deux espaces : sinon le plus récent deviendrait la
    // porte d'entrée de l'autre.
    expect((await depuis('/traductions/connexion')).status).toBe(429)
  })
})

describe.skipIf(!avecBase)('espace non configuré', () => {
  it('répond 503, et non 401, quand SECRET_SESSION manque', async () => {
    const secret = process.env.SECRET_SESSION
    delete process.env.SECRET_SESSION
    try {
      const rep = await poster('/commune/connexion', { code: 'abcd-2345' })
      expect(rep.status).toBe(503)
      // « jamais prêt » et non « réessayez » : le client distingue les deux, et cette
      // distinction avait dû être ajoutée après coup.
      expect(await rep.json()).toEqual({ erreur: 'espace-commune-non-configure' })
      expect((await app.request('/api/commune/journal')).status).toBe(503)
    } finally {
      process.env.SECRET_SESSION = secret
    }
  })
})

/**
 * La publication de traductions et la publication de perturbations passent toutes
 * deux par une relecture-avant-écriture du dépôt. C'est ce qui empêche deux agents
 * connectés en même temps de se recouvrir — un incident réel, corrigé le 2026-08-09.
 *
 * Ces tests remplacent GitHub par un fichier en mémoire : ce qui est vérifié, c'est
 * la fusion, pas l'API de GitHub. Au lot 24, la même propriété devra être retenue
 * sous une transaction PostgreSQL, et ces tests devront continuer de passer.
 */
describe.skipIf(!avecBase)('relecture avant écriture', () => {
  const jetonTrad = (nom: string) =>
    signerJeton(
      { nom, service: '', role: 'traductions', expire: Date.now() / 1000 + 60 },
      SECRET,
    )

  /** Remplace le dépôt par un fichier en mémoire. */
  function depotSimule(initial: unknown) {
    let fichier: any = initial
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (entree: any, init: any) => {
      if (init?.method === 'PUT') {
        fichier = JSON.parse(
          Buffer.from(JSON.parse(init.body).content, 'base64').toString('utf8'),
        )
        return new Response(JSON.stringify({ content: {} }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          content: Buffer.from(JSON.stringify(fichier), 'utf8').toString('base64'),
          sha: 'abc',
        }),
        { status: 200 },
      )
    })
    return () => fichier
  }

  afterEach(() => vi.restoreAllMocks())

  it('fusionne deux publications concurrentes au lieu de les écraser', async () => {
    // Deux traducteurs ouvrent leur page au même moment, donc partent tous deux d'un
    // fichier vide. Publier la surcouche entière faisait disparaître le travail du
    // premier ; on envoie désormais les seules modifications, et le serveur relit le
    // fichier avant de fusionner.
    const lire = depotSimule({ langues: {} })
    process.env.GITHUB_PAT = 'jeton-de-test'

    const publier = (jeton: string, langue: string, modifications: unknown) =>
      poster('/traductions/publier', { langue, modifications }, { Authorization: `Bearer ${jeton}` })

    expect(
      (await publier(await jetonTrad('A'), 'de', { 'assistant.terminer': 'Fertig' })).status,
    ).toBe(200)
    const rep = await publier(await jetonTrad('B'), 'pt', { 'assistant.terminer': 'Terminado' })
    expect(rep.status).toBe(200)

    // Les deux corrections coexistent dans le fichier réellement écrit.
    expect(lire().langues.de).toEqual({ 'assistant.terminer': 'Fertig' })
    expect(lire().langues.pt).toEqual({ 'assistant.terminer': 'Terminado' })
    // Et le second reçoit l'état fusionné, pas le sien.
    expect(((await rep.json()) as any).surcouche.de).toEqual({ 'assistant.terminer': 'Fertig' })
  })

  it('refuse une publication sans langue reconnue', async () => {
    const jeton = await jetonTrad('A')
    const rep = await poster(
      '/traductions/publier',
      { langue: 'es', modifications: {} },
      { Authorization: `Bearer ${jeton}` },
    )
    expect(rep.status).toBe(400)
  })

  it("inscrit l'auteur réel de la publication au journal, pas celui que le client prétend", async () => {
    depotSimule({ perturbations: [] })
    process.env.GITHUB_PAT = 'jeton-de-test'
    const jeton = await signerJeton(
      { nom: 'Marie', service: 'technique', role: 'commune', expire: Date.now() / 1000 + 60 },
      SECRET,
    )
    const rep = await poster(
      '/commune/perturbations',
      {
        perturbation: {
          id: 'u-1',
          type: 'annulation',
          gravite: 'alerte',
          du: '2026-08-10',
          au: '2026-08-10',
          message: { fr: 'Le bus de 07:25 ne circule pas.' },
          publiePar: 'Pirate',
        },
      },
      { Authorization: `Bearer ${jeton}` },
    )
    expect(rep.status).toBe(200)
    const entrees = await db`select * from journal order by quand desc limit 1`
    expect(entrees[0].qui).toBe('Marie')
    expect(entrees[0].action).toBe('publication')
  })
})
