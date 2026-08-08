/**
 * Espace commune : publication sans compte GitHub et sans voir de JSON.
 *
 * Un agent communal se connecte avec un code personnel. Le Worker vérifie ce code,
 * lui remet un jeton de session, et publie ensuite EN SON NOM avec un jeton machine
 * qu'il est seul à détenir. C'est ce qui permet de donner l'accès à quelqu'un du
 * service technique sans lui créer de compte GitHub ni lui confier un jeton.
 *
 * Deux principes de sécurité tiennent tout le reste :
 *  — le code n'est jamais stocké, seulement son empreinte SHA-256, comparée à temps
 *    constant ;
 *  — chaque charge est REVALIDÉE ici, quelle que soit la validation faite côté
 *    navigateur. Le client, même le nôtre, n'est pas digne de confiance : il suffit
 *    d'un `curl` pour parler à cette route.
 */
import { validerPlan } from '../../src/lib/validation.ts'
import { ecrireFichier, lireFichier } from './github.js'

const PREFIXE_AGENT = 'agent:'
const PREFIXE_JOURNAL = 'journal:'
const PREFIXE_DEBIT = 'debit:'

const CHEMIN_URGENCES = 'public/urgences.json'
const CHEMIN_PLAN = 'src/data/plan-2025-2026.json'

const DUREE_SESSION_S = 8 * 3600
/** Un code de huit caractères se force en quelques heures sans cette limite. */
const TENTATIVES_MAX = 5
const FENETRE_DEBIT_S = 15 * 60
/** Le journal se purge tout seul : personne ne viendra faire le ménage. */
const DUREE_JOURNAL_S = 90 * 24 * 3600
const JOURNAL_MAX = 50

/** Au-delà, ce n'est plus une perturbation, c'est une tentative de saturation. */
const TAILLE_CORPS_MAX = 64 * 1024
const TAILLE_PLAN_MAX = 512 * 1024

const TYPES = ['annulation', 'retard', 'arret-deplace', 'information']
const GRAVITES = ['info', 'attention', 'alerte']
const LANGUES = ['fr', 'de', 'lb', 'pt', 'en']
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/

// — Outils cryptographiques ————————————————————————————————————

const encodeur = new TextEncoder()

const hex = (tampon) =>
  [...new Uint8Array(tampon)].map((o) => o.toString(16).padStart(2, '0')).join('')

export async function empreinte(texte) {
  return hex(await crypto.subtle.digest('SHA-256', encodeur.encode(texte)))
}

/**
 * Comparaison à temps constant.
 *
 * Un `===` sur deux chaînes s'arrête au premier caractère différent : le temps de
 * réponse trahit alors combien de caractères sont justes, et un code se devine
 * lettre par lettre. On compare donc toujours la totalité.
 */
export function egalConstant(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let ecart = 0
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return ecart === 0
}

const base64url = (octets) =>
  btoa(String.fromCharCode(...new Uint8Array(octets)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const depuisBase64url = (texte) => {
  const base64 = texte.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
    c.charCodeAt(0),
  )
}

async function cleHmac(secret) {
  return crypto.subtle.importKey(
    'raw',
    encodeur.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** Jeton de session signé : `charge.signature`, tous deux en base64url. */
export async function signerJeton(charge, secret) {
  const corps = base64url(encodeur.encode(JSON.stringify(charge)))
  const signature = await crypto.subtle.sign('HMAC', await cleHmac(secret), encodeur.encode(corps))
  return `${corps}.${base64url(signature)}`
}

/** Relit un jeton de session. `null` si la signature ne colle pas ou si l'heure est passée. */
export async function verifierJeton(jeton, secret) {
  if (typeof jeton !== 'string' || !jeton.includes('.')) return null
  const [corps, signature] = jeton.split('.')
  if (!corps || !signature) return null
  try {
    const valide = await crypto.subtle.verify(
      'HMAC',
      await cleHmac(secret),
      depuisBase64url(signature),
      encodeur.encode(corps),
    )
    if (!valide) return null
    const charge = JSON.parse(new TextDecoder().decode(depuisBase64url(corps)))
    // L'expiration est DANS la charge signée : elle ne peut donc pas être repoussée
    // par le porteur du jeton.
    if (typeof charge?.expire !== 'number' || charge.expire < Date.now() / 1000) return null
    return charge
  } catch {
    return null
  }
}

// — Validation des charges ——————————————————————————————————————

const texteSur = (valeur, max) =>
  typeof valeur === 'string' && valeur.trim().length > 0 && valeur.length <= max

/**
 * Vérifie une perturbation de bout en bout.
 *
 * Renvoie la liste des motifs de refus, vide si tout va bien. On refuse la charge
 * entière plutôt que d'en publier une version amputée : une annulation de bus à
 * moitié écrite vaut moins que pas d'annulation du tout.
 */
export function validerPerturbation(p) {
  const motifs = []
  if (typeof p !== 'object' || p === null) return ['perturbation-absente']

  if (!texteSur(p.id, 64)) motifs.push('id')
  if (!TYPES.includes(p.type)) motifs.push('type')
  if (!GRAVITES.includes(p.gravite)) motifs.push('gravite')
  if (!DATE_ISO.test(p.du ?? '')) motifs.push('du')
  if (!DATE_ISO.test(p.au ?? '')) motifs.push('au')
  if (DATE_ISO.test(p.du ?? '') && DATE_ISO.test(p.au ?? '') && p.au < p.du) motifs.push('ordre-dates')

  if (typeof p.message !== 'object' || p.message === null || !texteSur(p.message.fr, 200)) {
    motifs.push('message')
  } else {
    for (const [langue, texte] of Object.entries(p.message)) {
      if (!LANGUES.includes(langue)) motifs.push(`langue-${langue}`)
      else if (texte !== undefined && !texteSur(texte, 200)) motifs.push(`message-${langue}`)
    }
  }

  // Un retard de 300 minutes n'est plus un retard : c'est une annulation mal saisie.
  if (p.minutes !== undefined) {
    if (!Number.isInteger(p.minutes) || p.minutes < 1 || p.minutes > 120) motifs.push('minutes')
  }
  if (p.type === 'retard' && p.minutes === undefined) motifs.push('minutes-obligatoires')

  for (const champ of ['ligne', 'service', 'arret', 'arretRemplacement']) {
    if (p[champ] !== undefined && !texteSur(p[champ], 64)) motifs.push(champ)
  }
  if (p.type === 'arret-deplace' && !texteSur(p.arret, 64)) motifs.push('arret-obligatoire')

  return motifs
}

// — Limitation de débit ——————————————————————————————————————————

/**
 * Cinq tentatives par quart d'heure et par adresse.
 *
 * Le compteur vit en KV avec une expiration : pas de tâche de nettoyage, et une
 * fenêtre qui se referme d'elle-même. La cohérence différée de KV autorise quelques
 * tentatives de plus en cas de course, ce qui reste sans commune mesure avec les
 * milliers qu'exigerait une attaque par force brute.
 */
async function debitDepasse(env, ip) {
  const cle = PREFIXE_DEBIT + (await empreinte(ip))
  const brut = await env.ABONNEMENTS.get(cle)
  const compte = Number(brut ?? 0)
  if (compte >= TENTATIVES_MAX) return true
  await env.ABONNEMENTS.put(cle, String(compte + 1), { expirationTtl: FENETRE_DEBIT_S })
  return false
}

async function reussite(env, ip) {
  await env.ABONNEMENTS.delete(PREFIXE_DEBIT + (await empreinte(ip)))
}

// — Journal ————————————————————————————————————————————————————

async function journaliser(env, agent, action, detail) {
  const cle = `${PREFIXE_JOURNAL}${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  await env.ABONNEMENTS.put(
    cle,
    JSON.stringify({
      quand: new Date().toISOString(),
      qui: agent?.nom ?? '?',
      service: agent?.service ?? '',
      action,
      detail: String(detail ?? '').slice(0, 200),
    }),
    { expirationTtl: DUREE_JOURNAL_S },
  )
}

// — Routes ——————————————————————————————————————————————————————

const json = (donnees, statut = 200, entetes = {}) =>
  new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'Content-Type': 'application/json', ...entetes },
  })

/** Lit un corps JSON en refusant ce qui est trop gros ou mal typé. */
async function corpsJson(requete, maxOctets) {
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

/** L'agent porteur d'une session valide, ou `null`. */
export async function agentDeLaRequete(requete, env) {
  const entete = requete.headers.get('Authorization') ?? ''
  if (!entete.startsWith('Bearer ')) return null
  return verifierJeton(entete.slice(7), env.SECRET_SESSION)
}

async function connexion(requete, env, entetesCors) {
  const ip = requete.headers.get('CF-Connecting-IP') ?? 'inconnue'
  if (await debitDepasse(env, ip)) {
    return json(
      { erreur: 'trop-de-tentatives', minutes: Math.ceil(FENETRE_DEBIT_S / 60) },
      429,
      entetesCors,
    )
  }

  const { code } = await corpsJson(requete, 1024)
  if (typeof code !== 'string' || code.length < 4 || code.length > 64) {
    return json({ erreur: 'code-inconnu' }, 401, entetesCors)
  }

  const cle = PREFIXE_AGENT + (await empreinte(code.trim().toLowerCase()))
  const brut = await env.ABONNEMENTS.get(cle)
  // Le `get` par clé est déjà une comparaison d'empreintes : la comparaison à temps
  // constant ci-dessous couvre le cas où l'enregistrement porterait sa propre copie.
  if (!brut) return json({ erreur: 'code-inconnu' }, 401, entetesCors)

  let agent
  try {
    agent = JSON.parse(brut)
  } catch {
    return json({ erreur: 'code-inconnu' }, 401, entetesCors)
  }
  if (agent.empreinte && !egalConstant(agent.empreinte, cle.slice(PREFIXE_AGENT.length))) {
    return json({ erreur: 'code-inconnu' }, 401, entetesCors)
  }

  await reussite(env, ip)
  await env.ABONNEMENTS.put(cle, JSON.stringify({ ...agent, dernierAcces: new Date().toISOString() }))

  const expire = Math.floor(Date.now() / 1000) + DUREE_SESSION_S
  const jeton = await signerJeton(
    { nom: agent.nom, service: agent.service ?? '', expire },
    env.SECRET_SESSION,
  )
  return json({ jeton, nom: agent.nom, service: agent.service ?? '', expire }, 200, entetesCors)
}

/** Relit les urgences, applique une transformation, republie. */
async function majUrgences(env, agent, transformer, resume) {
  const { contenu, sha } = await lireFichier(env, CHEMIN_URGENCES)
  const perturbations = transformer(contenu.perturbations ?? [])
  const nouveau = {
    ...contenu,
    perturbations,
    misAJour: new Date().toISOString(),
  }
  await ecrireFichier(
    env,
    CHEMIN_URGENCES,
    JSON.stringify(nouveau, null, 2) + '\n',
    sha,
    // Le message de commit porte l'auteur réel : l'historique du dépôt doit dire qui
    // a annulé un bus, pas « le Worker ».
    `${resume} — publié par ${agent.nom}${agent.service ? ` (${agent.service})` : ''}`,
  )
  return perturbations.length
}

async function publierPerturbation(requete, env, agent, entetesCors) {
  const charge = await corpsJson(requete, TAILLE_CORPS_MAX)
  const motifs = validerPerturbation(charge?.perturbation)
  if (motifs.length) return json({ erreur: 'charge-invalide', motifs }, 400, entetesCors)

  const p = {
    ...charge.perturbation,
    publieLe: new Date().toISOString(),
    // Jamais celui que le client prétend : c'est la session qui fait foi.
    publiePar: agent.nom,
  }

  const total = await majUrgences(
    env,
    agent,
    (liste) => [...liste.filter((x) => x.id !== p.id), p],
    `Urgence : ${p.type}`,
  )
  await journaliser(env, agent, 'publication', `${p.type} ${p.du}→${p.au} (${p.id})`)
  return json({ ok: true, total }, 200, entetesCors)
}

async function retirerPerturbation(id, env, agent, entetesCors) {
  if (!texteSur(id, 64)) return json({ erreur: 'id-invalide' }, 400, entetesCors)
  const total = await majUrgences(
    env,
    agent,
    (liste) => liste.filter((x) => x.id !== id),
    `Retrait de l'urgence ${id}`,
  )
  await journaliser(env, agent, 'retrait', id)
  return json({ ok: true, total }, 200, entetesCors)
}

/**
 * Remplacement du plan complet.
 *
 * Le Worker revalide le plan avec le MÊME `validerPlan()` que l'application, importé
 * depuis `src/lib/` : une seconde implémentation aurait divergé au premier ajout de
 * règle, et c'est justement ici qu'une divergence coûterait le plus cher.
 */
async function publierHoraires(requete, env, agent, entetesCors) {
  const charge = await corpsJson(requete, TAILLE_PLAN_MAX)
  const plan = charge?.plan
  const problemes = validerPlan(plan)
  const erreurs = problemes.filter((x) => x.gravite === 'erreur')
  if (erreurs.length) {
    return json({ erreur: 'plan-invalide', problemes: erreurs.slice(0, 30) }, 400, entetesCors)
  }

  const { sha } = await lireFichier(env, CHEMIN_PLAN)
  await ecrireFichier(
    env,
    CHEMIN_PLAN,
    JSON.stringify(plan, null, 2) + '\n',
    sha,
    `Horaires : mise à jour du plan — publié par ${agent.nom}${
      agent.service ? ` (${agent.service})` : ''
    }`,
  )
  await journaliser(env, agent, 'horaires', charge?.resume ?? '')
  return json(
    { ok: true, avertissements: problemes.filter((x) => x.gravite === 'avertissement') },
    200,
    entetesCors,
  )
}

async function journal(env, entetesCors) {
  const liste = await env.ABONNEMENTS.list({ prefix: PREFIXE_JOURNAL })
  // Les clés sont préfixées d'un horodatage : l'ordre alphabétique décroissant est
  // l'ordre chronologique inverse.
  const noms = liste.keys
    .map((k) => k.name)
    .sort()
    .reverse()
    .slice(0, JOURNAL_MAX)
  const entrees = []
  for (const nom of noms) {
    const brut = await env.ABONNEMENTS.get(nom)
    if (!brut) continue
    try {
      entrees.push(JSON.parse(brut))
    } catch {
      /* une entrée illisible ne doit pas rendre tout le journal inaccessible */
    }
  }
  return json({ entrees }, 200, entetesCors)
}

/**
 * Routeur de l'espace commune. Renvoie `null` si le chemin ne le concerne pas, pour
 * que `index.js` poursuive avec ses propres routes.
 */
export async function routerCommune(requete, env, url, entetesCors) {
  if (!url.pathname.startsWith('/commune/')) return null

  if (!env.SECRET_SESSION) {
    return json({ erreur: 'espace-commune-non-configure' }, 503, entetesCors)
  }

  const cle = `${requete.method} ${url.pathname}`

  if (cle === 'POST /commune/connexion') return connexion(requete, env, entetesCors)

  // Tout le reste exige une session valide.
  const agent = await agentDeLaRequete(requete, env)
  if (!agent) return json({ erreur: 'session-expiree' }, 401, entetesCors)

  if (cle === 'GET /commune/journal') return journal(env, entetesCors)
  if (cle === 'POST /commune/perturbations') {
    return publierPerturbation(requete, env, agent, entetesCors)
  }
  if (cle === 'POST /commune/horaires') return publierHoraires(requete, env, agent, entetesCors)

  if (requete.method === 'DELETE' && url.pathname.startsWith('/commune/perturbations/')) {
    const id = decodeURIComponent(url.pathname.slice('/commune/perturbations/'.length))
    return retirerPerturbation(id, env, agent, entetesCors)
  }

  return json({ erreur: 'route-inconnue' }, 404, entetesCors)
}
