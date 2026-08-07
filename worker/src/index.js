/**
 * Worker Cloudflare du site « Bus scolaire Beckerich ».
 *
 * Trois responsabilités, et rien d'autre :
 *  1. échanger le code OAuth GitHub contre un jeton (il détient le secret client) ;
 *  2. conserver les abonnements aux notifications ;
 *  3. envoyer les notifications, sur demande authentifiée de GitHub Actions.
 *
 * Il ne stocke aucune donnée personnelle : ni adresse, ni prénom, ni cycle. Seulement
 * des points de terminaison push, qui sont des identifiants d'appareil opaques.
 */
import { ApplicationServerKeys, generatePushHTTPRequest } from 'webpush-webcrypto'

const PREFIXE_ABONNEMENT = 'abonnement:'
const PREFIXE_ETAT = 'oauth:'
const DUREE_ETAT_S = 600

const cors = (origine) => ({
  'Access-Control-Allow-Origin': origine,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
})

const json = (donnees, statut = 200, entetes = {}) =>
  new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'Content-Type': 'application/json', ...entetes },
  })

/**
 * N'autorise la redirection que vers les origines déclarées.
 * Sans ce contrôle, le Worker serait une redirection ouverte : n'importe qui pourrait
 * forger un lien renvoyant un jeton GitHub vers un site tiers.
 */
function retourAutorise(retour, env) {
  const permises = (env.ORIGINES_AUTORISEES ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  try {
    const url = new URL(retour)
    return permises.includes(url.origin) ? url : null
  } catch {
    return null
  }
}

async function demarrerOAuth(requete, env) {
  const url = new URL(requete.url)
  const retour = retourAutorise(url.searchParams.get('retour') ?? '', env)
  if (!retour) return new Response('Origine de retour non autorisée', { status: 400 })

  const etat = crypto.randomUUID()
  await env.ABONNEMENTS.put(PREFIXE_ETAT + etat, retour.href, { expirationTtl: DUREE_ETAT_S })

  const autorisation = new URL('https://github.com/login/oauth/authorize')
  autorisation.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
  autorisation.searchParams.set('redirect_uri', `${url.origin}/auth/callback`)
  // `repo` est nécessaire pour écrire dans un dépôt ; GitHub n'offre pas de portée
  // plus étroite en OAuth classique. Le contrôle fin se fait ensuite côté application,
  // qui vérifie le droit d'écriture sur CE dépôt précis.
  autorisation.searchParams.set('scope', 'repo')
  autorisation.searchParams.set('state', etat)

  return Response.redirect(autorisation.href, 302)
}

async function terminerOAuth(requete, env) {
  const url = new URL(requete.url)
  const code = url.searchParams.get('code')
  const etat = url.searchParams.get('state')
  if (!code || !etat) return new Response('Requête incomplète', { status: 400 })

  const cle = PREFIXE_ETAT + etat
  const retour = await env.ABONNEMENTS.get(cle)
  if (!retour) return new Response('État inconnu ou expiré', { status: 400 })
  await env.ABONNEMENTS.delete(cle)

  const reponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  })

  const donnees = await reponse.json()
  if (!donnees.access_token) return new Response('Échange OAuth refusé', { status: 502 })

  // Le jeton repart dans le fragment : il n'apparaît ainsi ni dans les journaux
  // du serveur, ni dans l'en-tête Referer.
  return Response.redirect(`${retour}#jeton=${encodeURIComponent(donnees.access_token)}`, 302)
}

async function abonner(requete, env, origine) {
  const abonnement = await requete.json()
  if (!abonnement?.endpoint) return json({ erreur: 'abonnement-invalide' }, 400, cors(origine))

  // La clé est dérivée du endpoint : se réabonner ne crée pas de doublon.
  const cle = PREFIXE_ABONNEMENT + (await empreinte(abonnement.endpoint))
  await env.ABONNEMENTS.put(cle, JSON.stringify(abonnement))
  return json({ ok: true }, 200, cors(origine))
}

async function desabonner(requete, env, origine) {
  const { endpoint } = await requete.json()
  if (!endpoint) return json({ erreur: 'endpoint-manquant' }, 400, cors(origine))
  await env.ABONNEMENTS.delete(PREFIXE_ABONNEMENT + (await empreinte(endpoint)))
  return json({ ok: true }, 200, cors(origine))
}

async function empreinte(texte) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('')
}

/**
 * Répartit l'envoi entre plusieurs invocations.
 *
 * Le plan gratuit n'accorde que 10 ms de processeur par invocation, et le Web Push
 * impose un chiffrement AES-GCM plus une signature ECDSA PAR destinataire. Une boucle
 * sur tous les abonnés dépasserait ce budget dès quelques dizaines d'inscrits, et
 * Cloudflare interromprait l'invocation en silence : une partie des parents ne
 * recevrait rien, sans que personne s'en aperçoive.
 *
 * On découpe donc en lots, chaque lot étant une sous-requête vers `/notifier-lot`,
 * qui repart avec son propre budget. Le plan gratuit autorise 50 sous-requêtes.
 */
async function notifier(requete, env) {
  if (requete.headers.get('Authorization') !== `Bearer ${env.SECRET_NOTIFICATION}`) {
    return json({ erreur: 'non-autorise' }, 401)
  }

  const charge = await requete.json()
  if (!charge?.corps) return json({ erreur: 'corps-manquant' }, 400)

  const tailleLot = Number(env.TAILLE_LOT ?? 10)
  const maxSousRequetes = 45 // marge sous la limite de 50 du plan gratuit

  const liste = await env.ABONNEMENTS.list({ prefix: PREFIXE_ABONNEMENT })
  const noms = liste.keys.map((k) => k.name)

  const lots = []
  for (let i = 0; i < noms.length; i += tailleLot) lots.push(noms.slice(i, i + tailleLot))

  // Au-delà de la capacité d'un seul passage, on le dit franchement plutôt que
  // d'envoyer à une partie seulement des parents.
  if (lots.length > maxSousRequetes) {
    return json(
      {
        erreur: 'trop-abonnes',
        total: noms.length,
        capacite: tailleLot * maxSousRequetes,
        conseil:
          "Augmenter TAILLE_LOT si le processeur le permet, ou passer au plan Workers payant (5 $/mois) qui lève la limite de 10 ms.",
      },
      507,
    )
  }

  const origine = new URL(requete.url).origin
  const resultats = await Promise.all(
    lots.map((lot) =>
      fetch(`${origine}/notifier-lot`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SECRET_NOTIFICATION}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ charge, noms: lot }),
      })
        .then((r) => r.json())
        .catch(() => ({ envoyees: 0, purgees: 0, echecs: lot.length })),
    ),
  )

  const cumul = resultats.reduce(
    (a, r) => ({
      envoyees: a.envoyees + (r.envoyees ?? 0),
      purgees: a.purgees + (r.purgees ?? 0),
      echecs: a.echecs + (r.echecs ?? 0),
    }),
    { envoyees: 0, purgees: 0, echecs: 0 },
  )

  return json({ ...cumul, total: noms.length, lots: lots.length })
}

/** Envoie un lot d'abonnements. Une invocation, donc un budget processeur propre. */
async function notifierLot(requete, env) {
  if (requete.headers.get('Authorization') !== `Bearer ${env.SECRET_NOTIFICATION}`) {
    return json({ erreur: 'non-autorise' }, 401)
  }

  const { charge, noms } = await requete.json()
  const cles = await ApplicationServerKeys.fromJSON(JSON.parse(env.VAPID_JWK))

  let envoyees = 0
  let purgees = 0
  let echecs = 0

  for (const nom of noms ?? []) {
    const brut = await env.ABONNEMENTS.get(nom)
    if (!brut) continue

    try {
      const { headers, body, endpoint } = await generatePushHTTPRequest({
        applicationServerKeys: cles,
        payload: JSON.stringify(charge),
        target: JSON.parse(brut),
        adminContact: env.CONTACT_VAPID,
        ttl: 3600,
      })

      const reponse = await fetch(endpoint, { method: 'POST', headers, body })

      // 404 et 410 signifient que l'abonnement n'existe plus côté navigateur :
      // on le supprime plutôt que de le réessayer indéfiniment.
      if (reponse.status === 404 || reponse.status === 410) {
        await env.ABONNEMENTS.delete(nom)
        purgees++
      } else if (reponse.ok) {
        envoyees++
      } else {
        echecs++
      }
    } catch {
      // Un abonnement illisible ne doit pas empêcher les autres d'être servis.
      await env.ABONNEMENTS.delete(nom)
      purgees++
    }
  }

  return json({ envoyees, purgees, echecs })
}

export default {
  async fetch(requete, env) {
    const url = new URL(requete.url)
    const origine = requete.headers.get('Origin') ?? '*'

    if (requete.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origine) })
    }

    try {
      switch (`${requete.method} ${url.pathname}`) {
        case 'GET /sante':
          return json({
            ok: true,
            oauth: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
            push: Boolean(env.VAPID_JWK),
            origines: env.ORIGINES_AUTORISEES ?? '',
          })
        case 'GET /auth/start':
          return demarrerOAuth(requete, env)
        case 'GET /auth/callback':
          return terminerOAuth(requete, env)
        case 'POST /abonner':
          return abonner(requete, env, origine)
        case 'POST /desabonner':
          return desabonner(requete, env, origine)
        case 'POST /notifier':
          return notifier(requete, env)
        case 'POST /notifier-lot':
          return notifierLot(requete, env)
        default:
          return json({ erreur: 'route-inconnue' }, 404)
      }
    } catch (e) {
      return json({ erreur: 'exception', detail: String(e) }, 500)
    }
  },
}
