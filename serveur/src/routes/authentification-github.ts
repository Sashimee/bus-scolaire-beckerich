/**
 * Connexion GitHub du mainteneur, pour `/admin`.
 *
 * Le serveur détient le secret client : le navigateur ne peut pas faire l'échange
 * lui-même. Il ne conserve rien — le jeton traverse et repart.
 */
import type { Hono } from 'hono'
import { originePublique, retourAutorise } from '../http.ts'
import { ecrireEphemere, lireEphemere, supprimerEphemere } from '../stockage/ephemeres.ts'

const PREFIXE_ETAT = 'oauth:'
const DUREE_ETAT_S = 600

export function monterAuthGithub(app: Hono): void {
  app.get('/auth/start', async (c) => {
    const retour = retourAutorise(c.req.query('retour') ?? '')
    if (!retour) return c.text('Origine de retour non autorisée', 400)

    const etat = crypto.randomUUID()
    await ecrireEphemere(PREFIXE_ETAT + etat, retour.href, DUREE_ETAT_S)

    const autorisation = new URL('https://github.com/login/oauth/authorize')
    autorisation.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID ?? '')
    autorisation.searchParams.set('redirect_uri', `${originePublique(c)}/auth/callback`)
    // `repo` est nécessaire pour écrire dans un dépôt ; GitHub n'offre pas de portée
    // plus étroite en OAuth classique. Le contrôle fin se fait ensuite côté
    // application, qui vérifie le droit d'écriture sur CE dépôt précis.
    autorisation.searchParams.set('scope', 'repo')
    autorisation.searchParams.set('state', etat)

    return c.redirect(autorisation.href, 302)
  })

  app.get('/auth/callback', async (c) => {
    const code = c.req.query('code')
    const etat = c.req.query('state')
    if (!code || !etat) return c.text('Requête incomplète', 400)

    const cle = PREFIXE_ETAT + etat
    const retour = await lireEphemere<string>(cle)
    if (!retour) return c.text('État inconnu ou expiré', 400)
    // Consommé : un `state` ne sert qu'une fois, sinon il devient rejouable.
    await supprimerEphemere(cle)

    const reponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${originePublique(c)}/auth/callback`,
      }),
    })

    const donnees = (await reponse.json().catch(() => ({}))) as { access_token?: string }
    if (!donnees.access_token) return c.text('Échange OAuth refusé', 502)

    // Le jeton repart dans le FRAGMENT : il n'apparaît ainsi ni dans les journaux du
    // serveur, ni dans l'en-tête Referer. C'est le même raisonnement que le partage
    // de foyer côté navigateur, et il ne doit pas se perdre au passage sur la VPS —
    // ici, contrairement à Cloudflare, c'est nous qui tenons les journaux.
    return c.redirect(`${retour}#jeton=${encodeURIComponent(donnees.access_token)}`, 302)
  })
}
