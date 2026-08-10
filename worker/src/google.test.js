/**
 * L'échange et le rafraîchissement des jetons Google.
 *
 * Le Worker n'est là que parce que Google exige le `client_secret` d'un client
 * « Application Web » : il relaie, et ne retient rien. Ce qui compte ici est donc qu'il
 * relaie tout ce qui sert — le `refresh_token` en particulier, dont l'absence faisait
 * redemander une connexion à chaque ouverture de l'application — et qu'il ne relaie
 * pour personne d'autre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index.js'

let env
let appels

beforeEach(() => {
  env = {
    ORIGINES_AUTORISEES: 'https://exemple.lu',
    RETOURS_AUTORISES: 'https://exemple.lu',
    GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'secret',
  }
  appels = []
})

afterEach(() => vi.unstubAllGlobals())

/** Un Google simulé : on retient le corps envoyé et on rend ce qu'on veut. */
function googleRepond(statut, corps) {
  vi.stubGlobal('fetch', async (url, options) => {
    appels.push({ url: String(url), corps: Object.fromEntries(new URLSearchParams(options.body)) })
    return new Response(JSON.stringify(corps), { status: statut })
  })
}

const poster = (chemin, corps) =>
  worker.fetch(
    new Request(`https://worker.test${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://exemple.lu' },
      body: JSON.stringify(corps),
    }),
    env,
  )

const echanger = (corps = {}) =>
  poster('/google/jeton', {
    code: 'code-de-retour',
    verificateur: 'pkce',
    redirection: 'https://exemple.lu/agenda',
    ...corps,
  })

describe('échange du code Google', () => {
  it('rend le jeton de rafraîchissement au navigateur', async () => {
    // Sans lui, la session mourait avec l'onglet : le parent revoyait « Connecter mon
    // compte Google » sur un compte que Google, lui, considérait toujours connecté.
    googleRepond(200, {
      access_token: 'acces',
      refresh_token: 'rafraichissement',
      expires_in: 3599,
      scope: 'https://www.googleapis.com/auth/calendar.app.created',
    })

    const rep = await echanger()
    expect(rep.status).toBe(200)
    expect(await rep.json()).toMatchObject({
      access_token: 'acces',
      refresh_token: 'rafraichissement',
      expires_in: 3599,
    })
  })

  it('refuse d’échanger au profit d’un autre site', async () => {
    googleRepond(200, { access_token: 'acces' })
    const rep = await echanger({ redirection: 'https://ailleurs.example/agenda' })
    expect(rep.status).toBe(400)
    expect((await rep.json()).erreur).toBe('redirection-non-autorisee')
    expect(appels).toHaveLength(0)
  })
})

describe('rafraîchissement du jeton Google', () => {
  const rafraichir = (corps = { rafraichissement: 'rafraichissement' }) =>
    poster('/google/rafraichir', corps)

  it('redonne un jeton d’accès sans rien demander au parent', async () => {
    googleRepond(200, { access_token: 'acces-neuf', expires_in: 3599 })

    const rep = await rafraichir()
    expect(rep.status).toBe(200)
    expect(await rep.json()).toEqual({ access_token: 'acces-neuf', expires_in: 3599 })

    // Le secret vient du Worker, jamais du navigateur : c'est toute sa raison d'être.
    expect(appels[0].url).toBe('https://oauth2.googleapis.com/token')
    expect(appels[0].corps).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'rafraichissement',
      client_secret: 'secret',
    })
  })

  it('remonte `invalid_grant` tel quel', async () => {
    // C'est le seul motif qui distingue « l'accès a été retiré, il faut se reconnecter »
    // d'une panne passagère, qui ne doit surtout rien jeter.
    googleRepond(400, { error: 'invalid_grant', error_description: 'Token has been revoked.' })

    const rep = await rafraichir()
    expect(rep.status).toBe(502)
    expect((await rep.json()).detail).toBe('invalid_grant')
  })

  it('refuse un corps sans jeton de rafraîchissement', async () => {
    googleRepond(200, { access_token: 'acces' })
    expect((await rafraichir({})).status).toBe(400)
    expect((await rafraichir({ rafraichissement: 42 })).status).toBe(400)
    expect(appels).toHaveLength(0)
  })

  it('se tait tant que Google n’est pas configuré', async () => {
    delete env.GOOGLE_CLIENT_SECRET
    const rep = await rafraichir()
    expect(rep.status).toBe(503)
    expect((await rep.json()).erreur).toBe('google-non-configure')
  })
})
