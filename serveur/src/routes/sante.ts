/**
 * `/sante` — le point de contrôle.
 *
 * Il ne se contente pas de constater qu'un secret existe : il l'exerce. C'est ce qui
 * manquait à l'origine — `VAPID_JWK` était bien présent mais illisible, et `/sante`
 * répondait pourtant `push: true`. Un contrôle qui ne peut pas échouer ne contrôle
 * rien.
 */
import type { Hono } from 'hono'
import { base64urlEncode, importerClesVapid } from '../push.js'
import { etatDepot } from '../github.ts'
import { courrielConfigure } from '../courriel.ts'
import { base, baseConfiguree } from '../stockage/client.ts'

async function santePush() {
  if (!process.env.VAPID_JWK) return { push: false, motifPush: 'secret VAPID_JWK absent' }
  try {
    // La clé publique renvoyée n'est pas un secret : elle est déjà dans le JavaScript
    // servi à tous. La publier ici permet de la comparer d'un coup d'œil à la variable
    // `CLE_VAPID` du site.
    const { clePublique } = await importerClesVapid(process.env.VAPID_JWK)
    return { push: true, clePubliqueVapid: base64urlEncode(clePublique) }
  } catch (e) {
    return { push: false, motifPush: `VAPID_JWK illisible : ${String(e).slice(0, 200)}` }
  }
}

/**
 * La base répond-elle ?
 *
 * Nouveau par rapport au Worker, et pas par goût du détail : tout l'état vit désormais
 * là. Un serveur qui démarre avec une base injoignable répondrait 500 sur chaque
 * route sans dire pourquoi.
 */
async function santeBase() {
  if (!baseConfiguree()) return { base: false, motifBase: 'DATABASE_URL absente' }
  try {
    await base()`select 1`
    return { base: true }
  } catch (e) {
    return { base: false, motifBase: String(e).slice(0, 200) }
  }
}

export function monterSante(app: Hono): void {
  app.get('/sante', async (c) => {
    return c.json({
      ok: true,
      oauth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      ...(await santePush()),
      ...(await santeBase()),
      commune: Boolean(process.env.SECRET_SESSION && process.env.GITHUB_PAT),
      // Comptes utilisateurs (lot 24) : le secret qui signe les jetons suffit à activer
      // l'espace ; `courriel` dit à part si vérification et réinitialisation peuvent
      // partir — un espace comptes sans relai ne peut créer aucun compte activable.
      comptes: Boolean(process.env.SECRET_SESSION),
      courriel: courrielConfigure(),
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      // Que le jeton machine soit POSÉ ne dit pas qu'il fonctionne. Sans cette ligne,
      // un jeton révoqué ou sans droit d'écriture ne se manifestait qu'au moment d'une
      // vraie publication, sous la forme d'une erreur illisible.
      depot: await etatDepot(),
      rappels: Boolean(process.env.URL_SITE),
      origines: process.env.ORIGINES_AUTORISEES ?? '',
    })
  })
}
