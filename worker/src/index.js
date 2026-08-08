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
import { base64urlEncode, genererRequetePush, importerClesVapid } from './push.js'
import { routerCommune } from './commune.js'
import { rappelsDus } from './rappels.js'
import { etatDuJour } from '../../src/lib/calendrier.ts'
import { plan } from '../../src/lib/donnees.ts'

const PREFIXE_ABONNEMENT = 'abonnement:'
const PREFIXE_ETAT = 'oauth:'
const PREFIXE_RAPPEL = 'rappel:'

/**
 * Ce que chaque abonné accepte de recevoir.
 *
 * `urgences-rappels` est le défaut, y compris pour les abonnements enregistrés avant
 * ce réglage : c'est le compromis que la plupart des parents choisiraient, et il vaut
 * mieux qu'une absence de valeur ne veuille dire « tout » par accident.
 */
const PREFERENCES = ['urgences', 'urgences-rappels', 'tout']
const PREFERENCE_DEFAUT = 'urgences-rappels'

/**
 * Cet abonné doit-il recevoir cette notification ?
 *
 * Conséquence assumée : avec le défaut, une perturbation d'information ou d'attention
 * ne fait plus sonner les téléphones. Le bandeau dans l'application la montre déjà à
 * la prochaine ouverture, et réserver la sonnerie aux alertes est ce qui lui garde son
 * sens.
 */
function accepte(preference, charge) {
  const p = PREFERENCES.includes(preference) ? preference : PREFERENCE_DEFAUT
  if (charge?.rappel) return p !== 'urgences'
  if (p === 'tout') return true
  return charge?.gravite === 'alerte'
}
const DUREE_ETAT_S = 600

/**
 * Origines déclarées, une fois pour toutes.
 */
const originesPermises = (env) =>
  (env.ORIGINES_AUTORISEES ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

/**
 * CORS.
 *
 * Renvoyait auparavant l'origine de la requête TELLE QUELLE, ce qui revenait à
 * autoriser tout le monde sur `/abonner` et `/desabonner` : n'importe quel site
 * pouvait faire désabonner un parent depuis son navigateur. On compare désormais à
 * `ORIGINES_AUTORISEES`, la même liste que celle qui protège déjà la redirection OAuth.
 */
const cors = (origine, env) => {
  const permises = originesPermises(env)
  return {
    'Access-Control-Allow-Origin': permises.includes(origine) ? origine : (permises[0] ?? 'null'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/**
 * CORS de l'espace commune : l'origine n'est renvoyée que si elle figure dans
 * `ORIGINES_AUTORISEES`.
 *
 * `cors()` ci-dessus renvoie l'origine de la requête telle quelle, ce qui autorise de
 * fait tout le monde — c'est un point relevé pour le lot 11, qui reprendra les routes
 * existantes. Les routes ajoutées ici ne doivent pas hériter du défaut.
 */
const corsCommune = (origine, env) => {
  const permises = originesPermises(env)
  return {
    'Access-Control-Allow-Origin': permises.includes(origine) ? origine : permises[0] ?? 'null',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

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

/**
 * Lit un corps JSON en refusant ce qui est trop gros ou mal typé.
 *
 * Sans plafond, un `POST` d'un mégaoctet sur `/abonner` consomme le budget processeur
 * de l'invocation et fait tomber la requête sans trace. Et sans `try`, un corps qui
 * n'est pas du JSON remonte en exception 500 plutôt qu'en refus explicite.
 */
async function corpsJson(requete, maxOctets = 8 * 1024) {
  if (!(requete.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new Error('type-attendu-json')
  }
  const texte = await requete.text()
  if (texte.length > maxOctets) throw new Error('corps-trop-gros')
  try {
    return JSON.parse(texte)
  } catch {
    throw new Error('json-illisible')
  }
}

async function abonner(requete, env, origine) {
  let abonnement
  try {
    abonnement = await corpsJson(requete)
  } catch (e) {
    return json({ erreur: String(e.message) }, 400, cors(origine, env))
  }
  if (!abonnement?.endpoint || typeof abonnement.endpoint !== 'string') {
    return json({ erreur: 'abonnement-invalide' }, 400, cors(origine, env))
  }

  const preference = PREFERENCES.includes(abonnement.preference)
    ? abonnement.preference
    : PREFERENCE_DEFAUT

  // La clé est dérivée du endpoint : se réabonner ne crée pas de doublon, et
  // rechanger de préférence remplace simplement l'enregistrement.
  const cle = PREFIXE_ABONNEMENT + (await empreinte(abonnement.endpoint))
  await env.ABONNEMENTS.put(cle, JSON.stringify({ ...abonnement, preference }))
  return json({ ok: true, preference }, 200, cors(origine, env))
}

async function desabonner(requete, env, origine) {
  let endpoint
  try {
    ;({ endpoint } = await corpsJson(requete))
  } catch (e) {
    return json({ erreur: String(e.message) }, 400, cors(origine, env))
  }
  if (!endpoint || typeof endpoint !== 'string') {
    return json({ erreur: 'endpoint-manquant' }, 400, cors(origine, env))
  }
  await env.ABONNEMENTS.delete(PREFIXE_ABONNEMENT + (await empreinte(endpoint)))
  return json({ ok: true }, 200, cors(origine, env))
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

  let charge
  try {
    charge = await corpsJson(requete, 16 * 1024)
  } catch (e) {
    return json({ erreur: String(e.message) }, 400)
  }
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

  // Un seul lot — le cas courant tant que la commune compte quelques dizaines d'abonnés —
  // n'a rien à gagner à sortir sur le réseau : on l'envoie dans cette invocation-ci. Le
  // budget processeur est le même, et ça épargne l'aller-retour public.
  if (lots.length <= 1) {
    const resultat = await envoyerLot(charge, lots[0] ?? [], env)
    return json({ ...resultat, total: noms.length, lots: lots.length })
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
        .then(async (r) => {
          // Si le lot a échoué avant de pouvoir répondre en JSON, la réponse est une page
          // d'erreur : on garde son texte plutôt que de le jeter.
          const texte = await r.text()
          try {
            return JSON.parse(texte)
          } catch {
            return {
              envoyees: 0,
              purgees: 0,
              echecs: lot.length,
              details: [{ service: 'lot', statut: r.status, motif: texte.slice(0, 200) }],
            }
          }
        })
        .catch((e) => ({
          envoyees: 0,
          purgees: 0,
          echecs: lot.length,
          details: [{ service: 'lot', statut: 0, motif: String(e).slice(0, 200) }],
        })),
    ),
  )

  const cumul = resultats.reduce(
    (a, r) => ({
      envoyees: a.envoyees + (r.envoyees ?? 0),
      purgees: a.purgees + (r.purgees ?? 0),
      echecs: a.echecs + (r.echecs ?? 0),
      details: [...a.details, ...(r.details ?? [])],
    }),
    { envoyees: 0, purgees: 0, echecs: 0, details: [] },
  )

  return json({ ...cumul, total: noms.length, lots: lots.length })
}

/** Point d'entrée HTTP d'un lot : une invocation, donc un budget processeur propre. */
async function notifierLot(requete, env) {
  if (requete.headers.get('Authorization') !== `Bearer ${env.SECRET_NOTIFICATION}`) {
    return json({ erreur: 'non-autorise' }, 401)
  }

  let corps
  try {
    corps = await corpsJson(requete, 64 * 1024)
  } catch (e) {
    return json({ erreur: String(e.message) }, 400)
  }
  return json(await envoyerLot(corps.charge, corps.noms, env))
}

/**
 * Le travail proprement dit, séparé du transport pour que `notifier` puisse l'appeler
 * directement quand il n'y a qu'un seul lot — sans sous-requête, donc sans dépendre du
 * détour par la porte d'entrée publique.
 */
async function envoyerLot(charge, noms, env) {
  const cles = await importerClesVapid(env.VAPID_JWK)

  let envoyees = 0
  let purgees = 0
  let echecs = 0
  // Le motif de chaque échec, remonté jusqu'à l'appelant. Sans cela, un envoi raté se
  // résume à un compteur muet — et c'est précisément ce qui avait rendu la panne
  // précédente si longue à diagnostiquer.
  const details = []

  for (const nom of noms ?? []) {
    const brut = await env.ABONNEMENTS.get(nom)
    if (!brut) continue

    let abonnement
    try {
      abonnement = JSON.parse(brut)
      if (!abonnement?.endpoint || !abonnement?.keys) throw new Error('champs manquants')
    } catch (e) {
      // Un enregistrement illisible ne redeviendra jamais valide : là, purger a du sens.
      await env.ABONNEMENTS.delete(nom)
      purgees++
      console.log(`abonnement illisible, purgé : ${nom} (${e})`)
      continue
    }

    // Un abonné qui n'a pas demandé ce type d'envoi n'est pas un échec : il est
    // simplement hors du périmètre, et ne doit apparaître dans aucun compteur d'erreur.
    if (!accepte(abonnement.preference, charge)) continue

    try {
      const { headers, body, endpoint } = await genererRequetePush({
        cles,
        abonnement,
        charge: JSON.stringify(charge),
        contact: env.CONTACT_VAPID,
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
        // Les services de push expliquent leur refus dans le corps : on le garde. Apple
        // renvoie par exemple {"reason":"BadJwtToken"}.
        const motif = (await reponse.text().catch(() => '')).slice(0, 200)
        echecs++
        details.push({ service: new URL(endpoint).host, statut: reponse.status, motif })
        console.log(`push refusé par ${new URL(endpoint).host} : ${reponse.status} ${motif}`)
      }
    } catch (e) {
      // Une panne de chiffrement ou de réseau est passagère : surtout ne pas supprimer un
      // abonné valide à cause d'elle. On la compte en échec et on la journalise.
      echecs++
      details.push({ service: 'exception', statut: 0, motif: String(e).slice(0, 200) })
      console.log(`échec d'envoi pour ${nom} : ${e}`)
    }
  }

  return { envoyees, purgees, echecs, details }
}

/**
 * État des notifications, pour `/sante`.
 *
 * On ne se contente pas de constater que le secret existe : on l'importe réellement et on
 * en dérive la clé publique. C'est ce qui manquait — le secret était bien présent mais
 * inutilisable, et `/sante` répondait pourtant `push: true`.
 *
 * La clé publique renvoyée n'est pas un secret : elle est déjà dans le JavaScript servi à
 * tous. La publier ici permet de la comparer d'un coup d'œil à la variable `CLE_VAPID`.
 */
async function santePush(env) {
  if (!env.VAPID_JWK) return { push: false, motifPush: 'secret VAPID_JWK absent' }
  try {
    const { clePublique } = await importerClesVapid(env.VAPID_JWK)
    return { push: true, clePubliqueVapid: base64urlEncode(clePublique) }
  } catch (e) {
    return { push: false, motifPush: `VAPID_JWK illisible : ${String(e).slice(0, 200)}` }
  }
}

/**
 * Relit les perturbations publiées.
 *
 * On lit le fichier tel qu'il est servi aux parents, et non le dépôt : c'est
 * exactement ce qu'ils voient, et cela n'exige aucun jeton.
 */
async function lireUrgencesPubliees(env) {
  const base = (env.URL_SITE ?? '').replace(/\/$/, '')
  if (!base) return []
  const rep = await fetch(`${base}/urgences.json`, { cache: 'no-store' })
  if (!rep.ok) throw new Error(`urgences-illisibles-${rep.status}`)
  const donnees = await rep.json()
  return donnees?.perturbations ?? []
}

/**
 * Envoi des rappels, déclenché par le cron.
 *
 * Le corps diffère du premier envoi — « Rappel : … » — sans quoi les téléphones
 * regroupent les deux notifications et la seconde passe inaperçue, ce qui vide le
 * rappel de son seul intérêt.
 */
async function envoyerRappels(env) {
  const maintenant = new Date()
  const perturbations = await lireUrgencesPubliees(env)
  if (!perturbations.length) return { rappels: 0 }

  // Les états sont relus un par un : il y a au plus une poignée d'alertes actives.
  const etats = {}
  for (const p of perturbations) {
    const brut = await env.ABONNEMENTS.get(PREFIXE_RAPPEL + p.id)
    if (brut) {
      try {
        etats[p.id] = JSON.parse(brut)
      } catch {
        /* état illisible : on repart de zéro plutôt que de ne rien envoyer */
      }
    }
  }

  const dus = rappelsDus({
    perturbations,
    maintenant,
    etats,
    plan,
    // `etatDuJour` connaît vacances et fériés : un rappel un jour de congé n'aurait
    // aucun sens, et c'est la même table que celle affichée aux parents.
    jourEcole: etatDuJour(maintenant).ecole,
  })

  const titres = {
    annulation: 'Bus annulé',
    retard: 'Bus en retard',
    'arret-deplace': 'Arrêt déplacé',
    message: 'Information bus scolaire',
  }

  const liste = await env.ABONNEMENTS.list({ prefix: PREFIXE_ABONNEMENT })
  const noms = liste.keys.map((k) => k.name)

  let envoyes = 0
  for (const du of dus) {
    const p = du.perturbation
    const charge = {
      id: `${p.id}-rappel-${du.numero}`,
      titre: `Rappel : ${titres[p.type] ?? 'Bus scolaire Beckerich'}`,
      corps: `Toujours d'actualité — ${p.message?.fr ?? ''}`.trim(),
      gravite: p.gravite,
      rappel: true,
      url: './',
    }

    const resultat = await envoyerLot(charge, noms, env)

    // L'état est écrit APRÈS l'envoi : si le Worker tombe entre les deux, le rappel
    // repartira au prochain cron plutôt que d'être perdu en silence.
    const etat = etats[p.id] ?? { compte: 0, creneaux: [] }
    await env.ABONNEMENTS.put(
      PREFIXE_RAPPEL + p.id,
      JSON.stringify({
        compte: etat.compte + 1,
        creneaux: [...new Set([...etat.creneaux, ...du.consommes])],
        dernier: maintenant.toISOString(),
      }),
      // L'état survit à la perturbation le temps qu'elle expire, puis disparaît seul.
      { expirationTtl: 30 * 24 * 3600 },
    )

    envoyes++
    console.log(
      `rappel ${du.numero}/${du.total} pour ${p.id} au créneau ${du.creneau} : ` +
        `${resultat.envoyees} envoyée(s), ${resultat.echecs} échec(s)`,
    )
  }

  return { rappels: envoyes }
}

export default {
  /**
   * Cron. La fenêtre est large — 4 h à 14 h UTC — parce que les créneaux sont écrits
   * en heure locale et que le Luxembourg passe de UTC+1 à UTC+2 : une fenêtre calée
   * sur l'UTC raterait le rappel de 6 h 45 la moitié de l'année. C'est `rappels.js`
   * qui décide, à chaque réveil, s'il y a lieu d'envoyer quoi que ce soit.
   */
  async scheduled(_evenement, env, contexte) {
    contexte.waitUntil(
      envoyerRappels(env).catch((e) => console.log(`rappels : échec — ${e?.stack ?? e}`)),
    )
  },

  async fetch(requete, env) {
    const url = new URL(requete.url)
    const origine = requete.headers.get('Origin') ?? '*'

    if (requete.method === 'OPTIONS') {
      const entetes = url.pathname.startsWith('/commune/')
        ? corsCommune(origine, env)
        : cors(origine, env)
      return new Response(null, { status: 204, headers: entetes })
    }

    // `return await` et non `return` : sans l'attente, la promesse s'échappe du `try` et
    // le `catch` ci-dessous ne voit jamais rien. Cloudflare renvoyait alors sa page
    // d'erreur HTML 1101 en lieu et place du JSON, ce qui rendait toute panne illisible
    // depuis GitHub Actions.
    try {
      const commune = await routerCommune(requete, env, url, corsCommune(origine, env))
      if (commune) return commune

      switch (`${requete.method} ${url.pathname}`) {
        case 'GET /sante':
          return json({
            ok: true,
            oauth: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
            ...(await santePush(env)),
            commune: Boolean(env.SECRET_SESSION && env.GITHUB_PAT),
            rappels: Boolean(env.URL_SITE),
            origines: env.ORIGINES_AUTORISEES ?? '',
          })
        case 'GET /auth/start':
          return await demarrerOAuth(requete, env)
        case 'GET /auth/callback':
          return await terminerOAuth(requete, env)
        case 'POST /abonner':
          return await abonner(requete, env, origine)
        case 'POST /desabonner':
          return await desabonner(requete, env, origine)
        case 'POST /notifier':
          return await notifier(requete, env)
        case 'POST /notifier-lot':
          return await notifierLot(requete, env)
        default:
          return json({ erreur: 'route-inconnue' }, 404)
      }
    } catch (e) {
      console.log(`exception sur ${requete.method} ${url.pathname} : ${e?.stack ?? e}`)
      return json({ erreur: 'exception', detail: String(e) }, 500)
    }
  },
}
