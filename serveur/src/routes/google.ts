/**
 * Relais OAuth Google, pour l'écriture dans Google Agenda.
 *
 * Google n'accepte l'échange d'un client « Application Web » qu'avec son
 * `client_secret` — PKCE seul ne suffit que pour un client public. Le navigateur ne
 * peut donc pas le faire lui-même, et mettre un secret dans du code servi aux parents
 * n'aurait aucun sens.
 *
 * Le serveur relaie et **ne retient rien** : ni le jeton reçu, ni celui qu'il rend.
 * Le `code_verifier` de PKCE reste fourni par le navigateur, si bien que le serveur
 * ne peut pas fabriquer un jeton pour quelqu'un qui n'a pas commencé la connexion.
 */
import type { Hono } from 'hono'
import { corpsJson, retourAutorise } from '../http.ts'

const configure = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

export function monterGoogle(app: Hono): void {
  app.post('/google/jeton', async (c) => {
    if (!configure()) return c.json({ erreur: 'google-non-configure' }, 503)

    let corps: { code?: string; verificateur?: string; redirection?: string }
    try {
      corps = await corpsJson(c, 8 * 1024)
    } catch (e) {
      return c.json({ erreur: String((e as Error).message) }, 400)
    }
    if (!corps?.code || !corps?.verificateur || !corps?.redirection) {
      return c.json({ erreur: 'charge-invalide' }, 400)
    }

    // La redirection doit être une des nôtres : sans ce contrôle, n'importe qui
    // pourrait faire échanger un code contre un jeton au profit d'un autre site.
    if (!retourAutorise(corps.redirection)) {
      return c.json({ erreur: 'redirection-non-autorisee' }, 400)
    }

    const rep = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        code: corps.code,
        code_verifier: corps.verificateur,
        grant_type: 'authorization_code',
        redirect_uri: corps.redirection,
      }),
    })

    const donnees = (await rep.json().catch(() => ({}))) as Record<string, string>
    if (!rep.ok || !donnees.access_token) {
      // Le motif de Google est renvoyé tel quel : sans lui, une connexion refusée
      // reste indiagnosticable, ce qui a déjà coûté une demi-journée.
      return c.json(
        {
          erreur: 'echange-refuse',
          detail: donnees.error_description ?? donnees.error ?? rep.status,
        },
        502,
      )
    }

    // `scope` est ce que Google a RÉELLEMENT accordé, qui peut être plus étroit que ce
    // qui a été demandé. Le taire ferait découvrir le manque à la première écriture,
    // avec un « 403 insufficient authentication scopes » que personne ne sait
    // interpréter.
    return c.json({
      access_token: donnees.access_token,
      // Sans lui, la session mourait avec l'onglet : le parent devait se reconnecter
      // à chaque ouverture, alors que l'autorisation restait accordée chez Google.
      refresh_token: donnees.refresh_token,
      expires_in: donnees.expires_in ?? 3600,
      scope: donnees.scope ?? '',
    })
  })

  /**
   * Le motif de refus est renvoyé tel quel : `invalid_grant` distingue le seul cas où
   * il faut vraiment se reconnecter (accès retiré depuis le compte Google, ou jeton
   * périmé faute d'usage) d'une panne passagère, qui ne doit rien jeter.
   */
  app.post('/google/rafraichir', async (c) => {
    if (!configure()) return c.json({ erreur: 'google-non-configure' }, 503)

    let corps: { rafraichissement?: unknown }
    try {
      corps = await corpsJson(c, 8 * 1024)
    } catch (e) {
      return c.json({ erreur: String((e as Error).message) }, 400)
    }
    if (typeof corps?.rafraichissement !== 'string' || !corps.rafraichissement) {
      return c.json({ erreur: 'charge-invalide' }, 400)
    }

    const rep = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        refresh_token: corps.rafraichissement,
        grant_type: 'refresh_token',
      }),
    })

    const donnees = (await rep.json().catch(() => ({}))) as Record<string, string>
    if (!rep.ok || !donnees.access_token) {
      return c.json({ erreur: 'rafraichissement-refuse', detail: donnees.error ?? rep.status }, 502)
    }

    return c.json({ access_token: donnees.access_token, expires_in: donnees.expires_in ?? 3600 })
  })
}
