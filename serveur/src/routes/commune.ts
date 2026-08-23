/**
 * Espace commune : publication sans compte GitHub et sans voir de JSON.
 *
 * Un agent communal se connecte avec un code personnel. Le serveur vérifie ce code,
 * lui remet un jeton de session, et publie ensuite EN SON NOM avec un jeton machine
 * qu'il est seul à détenir. C'est ce qui permet de donner l'accès à quelqu'un du
 * service technique sans lui créer de compte GitHub ni lui confier un jeton.
 *
 * Deux principes de sécurité tiennent tout le reste, et ne bougent pas d'un pouce
 * avec le changement d'hébergement :
 *  — le code n'est jamais stocké, seulement son empreinte SHA-256, comparée à temps
 *    constant ;
 *  — chaque charge est REVALIDÉE ici, quelle que soit la validation faite côté
 *    navigateur. Le client, même le nôtre, n'est pas digne de confiance : il suffit
 *    d'un `curl` pour parler à cette route.
 */
import type { Context, Hono } from 'hono'
// Mêmes règles que le navigateur, importées et non réécrites : une seconde
// implémentation aurait divergé au premier ajustement.
import { validerPlan } from '../../../src/lib/validation.ts'
import { appliquerModifications, relireSurcouche } from '../../../src/lib/traductions.ts'
import { corpsJson, ipDeLaRequete } from '../http.ts'
import { empreinte, signerJeton, verifierJeton, type ChargeJeton } from '../crypto.ts'
import { ecrireFichier, lireFichier } from '../github.ts'
import {
  ecrireDocument,
  enregistrerPerturbation,
  lireDocument,
  listerPerturbations,
  supprimerPerturbation,
} from '../stockage/publications.ts'
import { base, type Sql } from '../stockage/client.ts'
import { envoyerATous } from '../envois.ts'
import { debitDepasse, FENETRE_DEBIT_S, reussite } from '../stockage/debit.ts'
import { journaliser, lireJournal } from '../stockage/journal.ts'
import { lireAgent, noterAcces, type Role } from '../stockage/agents.ts'
import { LANGUES, perturbationPropre, texteSur, validerPerturbation } from '../validation-perturbation.ts'

const CHEMIN_PLAN = 'src/data/plan-2025-2026.json'

const DUREE_SESSION_S = 8 * 3600

/** Au-delà, ce n'est plus une perturbation, c'est une tentative de saturation. */
const TAILLE_CORPS_MAX = 64 * 1024
const TAILLE_PLAN_MAX = 512 * 1024

/**
 * L'agent porteur d'une session valide POUR CE RÔLE, ou `null`.
 *
 * Le rôle est vérifié ici et non chez l'appelant : un jeton de l'espace commune
 * présenté à `/traductions/` doit être refusé même si la route oublie de le tester.
 * C'est la seconde des deux barrières — la première étant que les deux espaces lisent
 * deux TABLES différentes, si bien qu'un code de l'un n'existe pas dans l'autre.
 */
export async function agentDeLaRequete(c: Context, role: Role): Promise<ChargeJeton | null> {
  const entete = c.req.header('authorization') ?? ''
  if (!entete.startsWith('Bearer ')) return null
  const charge = await verifierJeton(entete.slice(7), process.env.SECRET_SESSION ?? '')
  if (!charge) return null
  // Les jetons émis avant l'ouverture de l'espace traduction ne portaient pas de rôle :
  // ce sont des jetons de commune, et rien d'autre.
  return (charge.role ?? 'commune') === role ? charge : null
}

async function connexion(c: Context, role: Role) {
  const ip = ipDeLaRequete(c.req.raw.headers)
  if (await debitDepasse(ip)) {
    return c.json(
      { erreur: 'trop-de-tentatives', minutes: Math.ceil(FENETRE_DEBIT_S / 60) },
      429,
    )
  }

  let code: unknown
  try {
    ;({ code } = await corpsJson<{ code?: unknown }>(c, 1024))
  } catch (e) {
    return c.json({ erreur: String((e as Error).message) }, 400)
  }
  if (typeof code !== 'string' || code.length < 4 || code.length > 64) {
    return c.json({ erreur: 'code-inconnu' }, 401)
  }

  // La lecture est faite dans la table DU RÔLE : un code de l'autre espace n'y existe
  // littéralement pas. La recherche par empreinte est elle-même une comparaison
  // d'empreintes complètes, donc insensible au temps de réponse.
  const codeHash = await empreinte(code.trim().toLowerCase())
  const agent = await lireAgent(role, codeHash)
  if (!agent) return c.json({ erreur: 'code-inconnu' }, 401)

  await reussite(ip)
  await noterAcces(role, codeHash)

  const expire = Math.floor(Date.now() / 1000) + DUREE_SESSION_S
  const jeton = await signerJeton(
    { nom: agent.nom, service: agent.service ?? '', role, expire },
    process.env.SECRET_SESSION ?? '',
  )
  return c.json({ jeton, nom: agent.nom, service: agent.service ?? '', role, expire })
}

/**
 * Titres des notifications, par type de perturbation. Repris à l'identique du workflow
 * `notifier.yml` qu'ils remplacent — la publication et l'envoi étaient deux opérations
 * (écriture GitHub, puis Action déclenchée sur push) ; ils n'en font plus qu'une.
 */
const TITRES: Record<string, string> = {
  annulation: 'Bus annulé',
  retard: 'Bus en retard',
  'arret-deplace': 'Arrêt déplacé',
  message: 'Information bus scolaire',
}

async function publierPerturbation(c: Context, agent: ChargeJeton) {
  const charge = await corpsJson<{ perturbation?: Record<string, unknown> }>(c, TAILLE_CORPS_MAX)
  const motifs = validerPerturbation(charge?.perturbation)
  if (motifs.length) return c.json({ erreur: 'charge-invalide', motifs }, 400)

  const p: Record<string, any> = {
    ...perturbationPropre(charge.perturbation as Record<string, unknown>),
    publieLe: new Date().toISOString(),
    // Jamais celui que le client prétend : c'est la session qui fait foi.
    publiePar: agent.nom,
  }

  const { nouvelle } = await enregistrerPerturbation(p.id, p)
  await journaliser(agent, 'publication', `${p.type} ${p.du}→${p.au} (${p.id})`)

  // Notification : SEULEMENT à la première pose d'un identifiant, et seulement si un
  // message français existe — c'était la règle de `notifier.yml`. Republier une
  // perturbation corrigée ne re-réveille pas les téléphones. L'envoi ne doit pas faire
  // échouer la publication : le bandeau dans l'application reste, quoi qu'il arrive au
  // push. On journalise l'échec, on ne le propage pas.
  let notification: unknown = null
  const notifiee = Boolean(nouvelle && p.message?.fr)
  if (notifiee) {
    notification = await envoyerATous({
      id: p.id,
      titre: TITRES[p.type] ?? 'Bus scolaire Beckerich',
      corps: p.message.fr,
      gravite: p.gravite,
      url: './',
    }).catch((e) => {
      console.log(`notification perturbation ${p.id} : échec — ${e?.stack ?? e}`)
      return { erreur: String(e) }
    })
  }

  const total = (await listerPerturbations()).length
  return c.json({ ok: true, total, notifiee, notification })
}

async function retirerPerturbation(c: Context, agent: ChargeJeton, id: string) {
  if (!texteSur(id, 64)) return c.json({ erreur: 'id-invalide' }, 400)
  // Un retrait ne notifie personne : réveiller tout le monde pour dire qu'une alerte
  // n'a plus lieu d'être serait du bruit.
  await supprimerPerturbation(id)
  await journaliser(agent, 'retrait', id)
  const total = (await listerPerturbations()).length
  return c.json({ ok: true, total })
}

/**
 * Remplacement du plan complet.
 *
 * Le serveur revalide le plan avec le MÊME `validerPlan()` que l'application, importé
 * depuis `src/lib/` : une seconde implémentation aurait divergé au premier ajout de
 * règle, et c'est justement ici qu'une divergence coûterait le plus cher.
 */
async function publierHoraires(c: Context, agent: ChargeJeton) {
  const charge = await corpsJson<{ plan?: unknown; resume?: string }>(c, TAILLE_PLAN_MAX)
  const problemes = validerPlan(charge?.plan as never)
  const erreurs = problemes.filter((x) => x.gravite === 'erreur')
  if (erreurs.length) {
    return c.json({ erreur: 'plan-invalide', problemes: erreurs.slice(0, 30) }, 400)
  }

  const { sha } = await lireFichier(CHEMIN_PLAN)
  await ecrireFichier(
    CHEMIN_PLAN,
    JSON.stringify(charge.plan, null, 2) + '\n',
    sha,
    `Horaires : mise à jour du plan — publié par ${agent.nom}${
      agent.service ? ` (${agent.service})` : ''
    }`,
  )
  await journaliser(agent, 'horaires', charge?.resume ?? '')
  return c.json({
    ok: true,
    avertissements: problemes.filter((x) => x.gravite === 'avertissement'),
  })
}

/**
 * Publication des corrections de traduction.
 *
 * On relit l'état courant AVANT de fusionner : deux traducteurs connectés en même
 * temps ne doivent pas se recouvrir. On revalide entrée par entrée avec la MÊME règle
 * que le navigateur, importée de `src/lib/traductions.ts`. Une entrée refusée est
 * écartée, les autres passent — le fichier publié ne contient donc jamais que du
 * recevable.
 */
async function publierTraductions(c: Context, agent: ChargeJeton) {
  const charge = await corpsJson<{ langue?: string; modifications?: Record<string, unknown> }>(
    c,
    TAILLE_CORPS_MAX,
  )
  if (!LANGUES.includes(charge?.langue as string)) {
    return c.json({ erreur: 'charge-invalide', motifs: ['langue'] }, 400)
  }

  // Transaction avec verrou consultatif : deux traducteurs connectés en même temps ne
  // doivent pas se recouvrir. La surcouche est relue SOUS verrou, fusionnée, réécrite —
  // ce qui sérialise les publications concurrentes, là où GitHub offrait une concurrence
  // optimiste par `sha` (409, puis relecture et nouvel essai). Le verrou se libère à la
  // fin de la transaction, quoi qu'il arrive.
  const propre = await base().begin(async (tx) => {
    // `tx` (transaction) et `Sql` (pool) partagent l'interface de requête mais pas
    // toute la surface du type : le cast dit ce que le code fait déjà, appeler la même
    // fonction de stockage sous transaction.
    const sousTx = tx as unknown as Sql
    await tx`select pg_advisory_xact_lock(hashtext('document:traductions'))`
    const doc = await lireDocument('traductions', sousTx)
    const fusionnee = appliquerModifications(
      relireSurcouche(doc?.contenu ?? { langues: {} }),
      charge.langue as never,
      (charge.modifications ?? {}) as never,
    )
    await ecrireDocument('traductions', { langues: fusionnee }, new Date().toISOString(), sousTx)
    return fusionnee
  })

  const langues = Object.keys(propre)
  await journaliser(
    agent,
    'traductions',
    `${charge.langue} · ${Object.keys(charge.modifications ?? {}).length} clé(s)`,
  )

  // On renvoie l'état fusionné : le client s'en sert comme nouvelle base, plutôt que
  // de rester sur celui qu'il avait chargé à l'ouverture.
  const retenues = langues.reduce(
    (n, l) => n + Object.keys((propre as Record<string, object>)[l]).length,
    0,
  )
  return c.json({ ok: true, retenues, surcouche: propre })
}

/**
 * Sans `SECRET_SESSION`, les deux espaces répondent 503 et le reste du serveur
 * fonctionne normalement. C'est ce qui permet à l'application parent de tourner
 * intégralement sans espace commune configuré — et au client de dire « jamais
 * prête » plutôt que « réessayez ».
 */
const nonConfigure = (c: Context) =>
  c.json({ erreur: 'espace-commune-non-configure' }, 503)

/**
 * Exige une session valide de ce rôle, ou renvoie la réponse de refus.
 *
 * Écrit comme une fonction appelée en tête de chaque route, et non comme un
 * intergiciel monté sur `/commune/*`. Un intergiciel aurait marché, mais sa portée
 * aurait dépendu de l'ORDRE d'enregistrement par rapport à `/commune/connexion` —
 * exactement le genre de dépendance invisible qui se casse quand quelqu'un déplace
 * trois lignes. Ici, une route sans appel à `exigerAgent` est une route visiblement
 * ouverte.
 */
async function exigerAgent(
  c: Context,
  role: Role,
): Promise<{ agent: ChargeJeton } | { refus: Response }> {
  if (!process.env.SECRET_SESSION) return { refus: nonConfigure(c) }
  const agent = await agentDeLaRequete(c, role)
  if (!agent) return { refus: c.json({ erreur: 'session-expiree' }, 401) }
  return { agent }
}

export function monterCommune(app: Hono): void {
  app.post('/commune/connexion', async (c) =>
    process.env.SECRET_SESSION ? connexion(c, 'commune') : nonConfigure(c),
  )

  app.get('/commune/journal', async (c) => {
    const r = await exigerAgent(c, 'commune')
    if ('refus' in r) return r.refus
    return c.json({ entrees: await lireJournal() })
  })

  app.post('/commune/perturbations', async (c) => {
    const r = await exigerAgent(c, 'commune')
    if ('refus' in r) return r.refus
    return publierPerturbation(c, r.agent)
  })

  app.delete('/commune/perturbations/:id', async (c) => {
    const r = await exigerAgent(c, 'commune')
    if ('refus' in r) return r.refus
    return retirerPerturbation(c, r.agent, decodeURIComponent(c.req.param('id')))
  })

  app.post('/commune/horaires', async (c) => {
    const r = await exigerAgent(c, 'commune')
    if ('refus' in r) return r.refus
    return publierHoraires(c, r.agent)
  })
}

/**
 * Espace traduction. Même mécanique que la commune — code personnel, jeton signé,
 * publication au nom de l'agent — mais une TABLE et un rôle qui lui sont propres :
 * un code de l'un n'ouvre rien de l'autre.
 */
export function monterTraductions(app: Hono): void {
  app.post('/traductions/connexion', async (c) =>
    // Même limitation de débit que la commune : sans elle, l'espace le plus récent
    // deviendrait la porte d'entrée de tous les autres.
    process.env.SECRET_SESSION ? connexion(c, 'traductions') : nonConfigure(c),
  )

  app.post('/traductions/publier', async (c) => {
    const r = await exigerAgent(c, 'traductions')
    if ('refus' in r) return r.refus
    return publierTraductions(c, r.agent)
  })
}
