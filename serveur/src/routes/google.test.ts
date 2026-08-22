/**
 * Porté depuis `worker/src/google.test.js`.
 *
 * Le serveur n'est qu'un relais : Google exige le `client_secret`, que le navigateur
 * ne peut pas détenir. Ce que ces tests vérifient, c'est qu'il ne retient rien et
 * qu'il ne relaie pas au profit de n'importe qui.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let app: { request: (...a: any[]) => Promise<Response> }

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'client-de-test'
  process.env.GOOGLE_CLIENT_SECRET = 'secret-de-test'
  process.env.ORIGINES_AUTORISEES = 'https://app.schoulbus.lu'
  process.env.BASE_API = '/api'
  app = (await import('../index.ts')).creerApplication() as never
})

beforeEach(() => vi.restoreAllMocks())

const poster = (chemin: string, corps: unknown) =>
  app.request(`/api${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })

const repondGoogle = (statut: number, corps: unknown) => {
  const appels: { url: string; corps: URLSearchParams }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (entree: any, init: any) => {
    appels.push({ url: String(entree), corps: new URLSearchParams(String(init?.body ?? '')) })
    return new Response(JSON.stringify(corps), {
      status: statut,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return appels
}

describe('échange du code Google', () => {
  it('rend le jeton de rafraîchissement au navigateur', async () => {
    // Sans lui, la session mourait avec l'onglet : le parent devait se reconnecter à
    // chaque ouverture alors que l'autorisation restait accordée chez Google.
    const appels = repondGoogle(200, {
      access_token: 'jeton-acces',
      refresh_token: 'jeton-rafraichissement',
      expires_in: 3599,
      scope: 'https://www.googleapis.com/auth/calendar.app.created',
    })

    const rep = await poster('/google/jeton', {
      code: 'code-google',
      verificateur: 'verificateur-pkce',
      redirection: 'https://app.schoulbus.lu/agenda',
    })

    expect(rep.status).toBe(200)
    const corps = (await rep.json()) as any
    expect(corps.refresh_token).toBe('jeton-rafraichissement')
    // La portée RÉELLEMENT accordée est renvoyée : la taire ferait découvrir le manque
    // à la première écriture, avec un « 403 insufficient authentication scopes ».
    expect(corps.scope).toContain('calendar.app.created')
    // Le secret client part chez Google, jamais vers le navigateur.
    expect(appels[0].corps.get('client_secret')).toBe('secret-de-test')
    expect(JSON.stringify(corps)).not.toContain('secret-de-test')
  })

  it('refuse d’échanger au profit d’un autre site', async () => {
    repondGoogle(200, { access_token: 'x' })
    const rep = await poster('/google/jeton', {
      code: 'code-google',
      verificateur: 'verificateur-pkce',
      redirection: 'https://mechant.example/vol',
    })
    expect(rep.status).toBe(400)
    expect(await rep.json()).toEqual({ erreur: 'redirection-non-autorisee' })
  })

  it('refuse une charge incomplète', async () => {
    expect((await poster('/google/jeton', { code: 'x' })).status).toBe(400)
  })
})

describe('rafraîchissement du jeton Google', () => {
  it('redonne un jeton d’accès sans rien demander au parent', async () => {
    const appels = repondGoogle(200, { access_token: 'jeton-neuf', expires_in: 3599 })
    const rep = await poster('/google/rafraichir', { rafraichissement: 'jeton-rafraichissement' })
    expect(rep.status).toBe(200)
    expect((await rep.json()) as any).toMatchObject({ access_token: 'jeton-neuf' })
    expect(appels[0].corps.get('grant_type')).toBe('refresh_token')
  })

  it('remonte `invalid_grant` tel quel', async () => {
    // C'est le SEUL cas où il faut vraiment se reconnecter : accès retiré depuis le
    // compte Google, ou jeton périmé faute d'usage. Le confondre avec une panne
    // passagère ferait jeter une session encore valable, ou l'inverse.
    repondGoogle(400, { error: 'invalid_grant' })
    const rep = await poster('/google/rafraichir', { rafraichissement: 'jeton-mort' })
    expect(rep.status).toBe(502)
    expect((await rep.json()) as any).toMatchObject({
      erreur: 'rafraichissement-refuse',
      detail: 'invalid_grant',
    })
  })

  it('refuse un corps sans jeton de rafraîchissement', async () => {
    expect((await poster('/google/rafraichir', {})).status).toBe(400)
    expect((await poster('/google/rafraichir', { rafraichissement: '' })).status).toBe(400)
  })
})

describe('sans configuration Google', () => {
  it('se tait tant que Google n’est pas configuré', async () => {
    const id = process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_ID
    try {
      // 503 et non 400 : l'intégration n'est pas cassée, elle n'existe pas encore.
      // Le client en fait « non activée » plutôt que « réessayez ».
      const rep = await poster('/google/jeton', {
        code: 'x',
        verificateur: 'y',
        redirection: 'https://app.schoulbus.lu/agenda',
      })
      expect(rep.status).toBe(503)
      expect(await rep.json()).toEqual({ erreur: 'google-non-configure' })
    } finally {
      process.env.GOOGLE_CLIENT_ID = id
    }
  })
})
