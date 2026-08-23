/**
 * Espace comptes : authentification par courriel + mot de passe, à capacités.
 *
 * Même esprit que `/commune` — un jeton de session signé, revérifié à chaque route —
 * mais l'identifiant est un vrai compte réutilisable, et le `role` figé cède la place à
 * un ensemble de CAPACITÉS. Chaque route d'édition (au lot 25) exigera une capacité
 * nommée ; ici, on ne pose que l'authentification et la gestion des comptes.
 *
 * Trois principes, comme partout ailleurs dans ce serveur :
 *  — le mot de passe n'est jamais stocké ni journalisé en clair, seulement son
 *    empreinte argon2id, vérifiée à temps constant par la bibliothèque ;
 *  — la charge est REVALIDÉE ici quoi que fasse le navigateur : un `curl` parle à ces
 *    routes comme le ferait notre client ;
 *  — l'autorisation lit les capacités DANS LA BASE à chaque requête, pas dans le jeton :
 *    désactiver un compte ou retirer une capacité prend effet tout de suite, sans
 *    attendre l'expiration du jeton.
 */
import type { Context, Hono } from 'hono'
import { corpsJson, ipDeLaRequete } from '../http.ts'
import { jetonAleatoire, signerJeton, verifierJeton } from '../crypto.ts'
import {
  hacherMotDePasse,
  verifierMotDePasse,
  LONGUEUR_MDP_MIN,
} from '../comptes/argon.ts'
import { capacitesPropres, type Capacite } from '../comptes/capacites.ts'
import {
  changerMotDePasse,
  creerUtilisateur,
  lireUtilisateur,
  listerUtilisateurs,
  majUtilisateur,
  marquerVerifie,
  noterAccesUtilisateur,
  normaliserCourriel,
  type Utilisateur,
} from '../stockage/utilisateurs.ts'
import { ecrireEphemere, lireEphemere, supprimerEphemere } from '../stockage/ephemeres.ts'
import { debitDepasse, FENETRE_DEBIT_S, reussite } from '../stockage/debit.ts'
import { journaliser } from '../stockage/journal.ts'
import {
  courrielConfigure,
  courrielReinitialisation,
  courrielVerification,
  envoyerCourriel,
} from '../courriel.ts'

const DUREE_SESSION_S = 8 * 3600
/** « Rester connecté » : le seul réglage qui change la durée signée dans le jeton. */
const DUREE_SESSION_LONGUE_S = 30 * 24 * 3600

/** Activation d'un compte neuf : le lien vit une semaine, le temps qu'on relève ses courriels. */
const DUREE_ACTIVATION_S = 7 * 24 * 3600
/** Mot de passe oublié : une heure, pas plus — un lien de reprise est une clé. */
const DUREE_REINIT_S = 3600

const PREFIXE_REINIT = 'reinit-mdp:'

const enConfigure = () => Boolean(process.env.SECRET_SESSION)
const nonConfigure = (c: Context) => c.json({ erreur: 'comptes-non-configures' }, 503)

/**
 * Le compte porteur d'une session valide, relu dans la base, ou `null`.
 *
 * Relu et non déduit du jeton : un compte désactivé, ou dont les capacités ont changé,
 * doit l'être immédiatement. Le jeton ne sert qu'à prouver l'identité ; les droits
 * viennent de la base.
 */
async function compteDeLaRequete(c: Context): Promise<Utilisateur | null> {
  const entete = c.req.header('authorization') ?? ''
  if (!entete.startsWith('Bearer ')) return null
  const charge = await verifierJeton(entete.slice(7), process.env.SECRET_SESSION ?? '')
  if (!charge?.courriel) return null
  const compte = await lireUtilisateur(charge.courriel)
  if (!compte || compte.desactive) return null
  return compte
}

/** Exige une session valide, et la capacité nommée. Renvoie le compte ou une réponse de refus. */
export async function exigerCapacite(
  c: Context,
  capacite: Capacite,
): Promise<{ compte: Utilisateur } | { refus: Response }> {
  if (!enConfigure()) return { refus: nonConfigure(c) }
  const compte = await compteDeLaRequete(c)
  if (!compte) return { refus: c.json({ erreur: 'session-expiree' }, 401) }
  if (!compte.capacites.includes(capacite)) return { refus: c.json({ erreur: 'capacite-refusee' }, 403) }
  return { compte }
}

/** La forme publique d'un compte : jamais l'empreinte du mot de passe. */
const vue = (u: Utilisateur) => ({
  courriel: u.courriel,
  nom: u.nom,
  capacites: u.capacites,
  service: u.service,
  langue: u.langue,
})

async function connexion(c: Context) {
  const ip = ipDeLaRequete(c.req.raw.headers)
  if (await debitDepasse(ip)) {
    return c.json({ erreur: 'trop-de-tentatives', minutes: Math.ceil(FENETRE_DEBIT_S / 60) }, 429)
  }

  let corps: { courriel?: unknown; motDePasse?: unknown; seSouvenir?: unknown }
  try {
    corps = await corpsJson(c, 4 * 1024)
  } catch (e) {
    return c.json({ erreur: String((e as Error).message) }, 400)
  }

  const courriel = normaliserCourriel(corps.courriel)
  const motDePasse = typeof corps.motDePasse === 'string' ? corps.motDePasse : ''
  const compte = courriel ? await lireUtilisateur(courriel) : null

  // Un mot de passe est TOUJOURS vérifié, même quand le compte n'existe pas : sans cela,
  // le temps de réponse dirait quels courriels sont enregistrés. On vérifie alors contre
  // une empreinte leurre — un VRAI haché argon2id, pour que la vérification dure autant
  // que celle d'un compte réel, et non le temps d'un parse raté.
  const hash = compte?.motDePasseHash ?? (await empreinteLeurre())
  const bon = await verifierMotDePasse(hash, motDePasse)

  // Message unique pour « inconnu », « mauvais mot de passe » et « désactivé » : révéler
  // lequel des trois aiderait à énumérer les comptes.
  if (!compte || compte.desactive || !bon) {
    return c.json({ erreur: 'identifiants-invalides' }, 401)
  }
  // La non-vérification, elle, se dit : l'utilisateur légitime doit savoir quoi faire.
  if (!compte.courrielVerifie) {
    return c.json({ erreur: 'courriel-non-verifie' }, 403)
  }

  await reussite(ip)
  await noterAccesUtilisateur(courriel)

  const duree = corps.seSouvenir === true ? DUREE_SESSION_LONGUE_S : DUREE_SESSION_S
  const expire = Math.floor(Date.now() / 1000) + duree
  const jeton = await signerJeton(
    { nom: compte.nom, service: compte.service, role: 'utilisateur', courriel, capacites: compte.capacites, expire },
    process.env.SECRET_SESSION ?? '',
  )
  return c.json({ jeton, expire, ...vue(compte) })
}

/**
 * Une empreinte argon2id leurre, contre laquelle vérifier quand le compte n'existe pas.
 * Sa seule raison d'être est de faire durer la vérification aussi longtemps qu'un vrai
 * compte, pour ne pas trahir l'existence par le temps de réponse. Calculée une fois, à
 * la première connexion ratée, sur une chaîne qui n'est le mot de passe de personne.
 */
let hashLeurre: string | null = null
async function empreinteLeurre(): Promise<string> {
  if (!hashLeurre) hashLeurre = await hacherMotDePasse('leurre-de-synchronisation')
  return hashLeurre
}

async function moi(c: Context) {
  const r = await exigerSession(c)
  if ('refus' in r) return r.refus
  return c.json(vue(r.compte))
}

/** Session valide, sans exiger de capacité — pour « mon compte » et le changement de mot de passe. */
async function exigerSession(c: Context): Promise<{ compte: Utilisateur } | { refus: Response }> {
  if (!enConfigure()) return { refus: nonConfigure(c) }
  const compte = await compteDeLaRequete(c)
  if (!compte) return { refus: c.json({ erreur: 'session-expiree' }, 401) }
  return { compte }
}

async function changerSonMotDePasse(c: Context) {
  const r = await exigerSession(c)
  if ('refus' in r) return r.refus
  const corps = await corpsJson<{ ancien?: unknown; nouveau?: unknown }>(c, 4 * 1024).catch(() => null)
  const ancien = typeof corps?.ancien === 'string' ? corps.ancien : ''
  const nouveau = typeof corps?.nouveau === 'string' ? corps.nouveau : ''
  if (!(await verifierMotDePasse(r.compte.motDePasseHash, ancien))) {
    return c.json({ erreur: 'ancien-mot-de-passe-invalide' }, 403)
  }
  if (nouveau.length < LONGUEUR_MDP_MIN) {
    return c.json({ erreur: 'mot-de-passe-trop-court', minimum: LONGUEUR_MDP_MIN }, 400)
  }
  await changerMotDePasse(r.compte.courriel, await hacherMotDePasse(nouveau))
  return c.json({ ok: true })
}

/** Fabrique le lien d'un jeton, vers la page du site qui le consomme. */
function lien(chemin: string, jeton: string): string {
  const base = (process.env.URL_SITE ?? '').replace(/\/$/, '')
  return `${base}${chemin}?jeton=${encodeURIComponent(jeton)}`
}

/** Émet un jeton de reprise (activation ou réinitialisation) et envoie le courriel. */
async function envoyerLienReprise(
  compte: { courriel: string; nom: string; langue: string },
  dureeS: number,
  activation: boolean,
): Promise<void> {
  const jeton = jetonAleatoire()
  await ecrireEphemere(PREFIXE_REINIT + jeton, { courriel: compte.courriel }, dureeS)
  const url = lien('/reinitialiser', jeton)
  const message = activation
    ? courrielVerification(compte.courriel, compte.nom, url, compte.langue)
    : courrielReinitialisation(compte.courriel, compte.nom, url, compte.langue)
  await envoyerCourriel(message)
}

async function motDePasseOublie(c: Context) {
  const ip = ipDeLaRequete(c.req.raw.headers)
  if (await debitDepasse(ip)) {
    return c.json({ erreur: 'trop-de-tentatives', minutes: Math.ceil(FENETRE_DEBIT_S / 60) }, 429)
  }
  const corps = await corpsJson<{ courriel?: unknown }>(c, 4 * 1024).catch(() => ({}) as { courriel?: unknown })
  const courriel = normaliserCourriel(corps.courriel)
  const compte = courriel ? await lireUtilisateur(courriel) : null

  // On répond « ok » quoi qu'il arrive : dire « ce courriel n'existe pas » énumérerait
  // les comptes. Le lien ne part que si le compte existe, est actif, et si le relai est
  // là — mais l'appelant ne peut pas distinguer ces cas.
  if (compte && !compte.desactive && courrielConfigure()) {
    await envoyerLienReprise(compte, DUREE_REINIT_S, false)
  }
  await reussite(ip)
  return c.json({ ok: true })
}

async function reinitialiser(c: Context) {
  const corps = await corpsJson<{ jeton?: unknown; motDePasse?: unknown }>(c, 4 * 1024).catch(() => null)
  const jeton = typeof corps?.jeton === 'string' ? corps.jeton : ''
  const motDePasse = typeof corps?.motDePasse === 'string' ? corps.motDePasse : ''
  if (motDePasse.length < LONGUEUR_MDP_MIN) {
    return c.json({ erreur: 'mot-de-passe-trop-court', minimum: LONGUEUR_MDP_MIN }, 400)
  }
  const cible = jeton ? await lireEphemere<{ courriel: string }>(PREFIXE_REINIT + jeton) : null
  if (!cible) return c.json({ erreur: 'lien-invalide-ou-expire' }, 400)

  await changerMotDePasse(cible.courriel, await hacherMotDePasse(motDePasse))
  // Choisir son mot de passe depuis le lien reçu par courriel PROUVE le contrôle de la
  // boîte : l'adresse est donc vérifiée du même geste. C'est ce qui fait de l'activation
  // et de la vérification une seule opération.
  await marquerVerifie(cible.courriel)
  // Le jeton ne sert qu'une fois : on le retire, qu'un lien intercepté ne resserve pas.
  await supprimerEphemere(PREFIXE_REINIT + jeton)
  return c.json({ ok: true })
}

// — Gestion des comptes, sous la capacité `comptes` —————————————————

async function lister(c: Context) {
  const r = await exigerCapacite(c, 'comptes')
  if ('refus' in r) return r.refus
  return c.json({ comptes: await listerUtilisateurs() })
}

async function creer(c: Context) {
  const r = await exigerCapacite(c, 'comptes')
  if ('refus' in r) return r.refus
  // Créer un compte suppose de pouvoir l'activer : sans relai, la création est refusée
  // net plutôt que de laisser un compte inactivable.
  if (!courrielConfigure()) return c.json({ erreur: 'courriel-non-configure' }, 503)

  const corps = await corpsJson<{
    courriel?: unknown
    nom?: unknown
    capacites?: unknown
    service?: unknown
    langue?: unknown
  }>(c, 8 * 1024).catch(() => null)

  const courriel = normaliserCourriel(corps?.courriel)
  const nom = typeof corps?.nom === 'string' ? corps.nom.trim() : ''
  const capacites = capacitesPropres(corps?.capacites)
  if (!courrielValide(courriel) || !nom) return c.json({ erreur: 'charge-invalide' }, 400)

  // Un mot de passe aléatoire, inutilisable, en attendant que l'activation en pose un
  // vrai : le compte naît sans mot de passe connu de personne.
  const hashProvisoire = await hacherMotDePasse(jetonAleatoire())
  const cree = await creerUtilisateur({
    courriel,
    motDePasseHash: hashProvisoire,
    nom,
    capacites,
    service: typeof corps?.service === 'string' ? corps.service.trim() : '',
    langue: typeof corps?.langue === 'string' ? corps.langue : 'fr',
    courrielVerifie: false,
  })
  if (!cree) return c.json({ erreur: 'courriel-deja-pris' }, 409)

  await envoyerLienReprise(
    { courriel, nom, langue: typeof corps?.langue === 'string' ? corps.langue : 'fr' },
    DUREE_ACTIVATION_S,
    true,
  )
  await journaliser(r.compte, 'compte-cree', `${courriel} [${capacites.join(', ')}]`)
  return c.json({ ok: true })
}

async function modifier(c: Context) {
  const r = await exigerCapacite(c, 'comptes')
  if ('refus' in r) return r.refus
  const cibleCourriel = normaliserCourriel(decodeURIComponent(c.req.param('courriel') ?? ''))
  const compte = await lireUtilisateur(cibleCourriel)
  if (!compte) return c.json({ erreur: 'compte-inconnu' }, 404)

  const corps = await corpsJson<{
    nom?: unknown
    capacites?: unknown
    service?: unknown
    langue?: unknown
    desactive?: unknown
  }>(c, 8 * 1024).catch(() => null)

  const nom = typeof corps?.nom === 'string' && corps.nom.trim() ? corps.nom.trim() : compte.nom
  const capacites = Array.isArray(corps?.capacites) ? capacitesPropres(corps.capacites) : compte.capacites
  const desactive = typeof corps?.desactive === 'boolean' ? corps.desactive : compte.desactive

  // On ne se retire pas à soi-même la capacité `comptes`, et on ne se désactive pas :
  // sinon la dernière personne à pouvoir gérer les comptes pourrait se verrouiller
  // dehors, et plus personne ne rouvrirait la porte.
  if (cibleCourriel === r.compte.courriel && (!capacites.includes('comptes') || desactive)) {
    return c.json({ erreur: 'auto-verrouillage-refuse' }, 400)
  }

  await majUtilisateur(cibleCourriel, {
    nom,
    capacites,
    service: typeof corps?.service === 'string' ? corps.service.trim() : compte.service,
    langue: typeof corps?.langue === 'string' ? corps.langue : compte.langue,
    desactive,
  })
  await journaliser(r.compte, 'compte-modifie', `${cibleCourriel} [${capacites.join(', ')}]${desactive ? ' désactivé' : ''}`)
  return c.json({ ok: true })
}

/** Un courriel « assez valide » pour ne pas accepter n'importe quoi : une @, un point après. */
function courrielValide(courriel: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel) && courriel.length <= 254
}

export function monterComptes(app: Hono): void {
  app.post('/comptes/connexion', async (c) => (enConfigure() ? connexion(c) : nonConfigure(c)))
  // Les jetons sont sans état : la déconnexion n'a rien à révoquer côté serveur, le
  // client jette le sien. La route existe pour que le client ait une intention à nommer.
  app.post('/comptes/deconnexion', (c) => c.json({ ok: true }))
  app.get('/comptes/moi', moi)
  app.post('/comptes/changer-mot-de-passe', changerSonMotDePasse)
  app.post('/comptes/mot-de-passe-oublie', async (c) => (enConfigure() ? motDePasseOublie(c) : nonConfigure(c)))
  app.post('/comptes/reinitialiser', async (c) => (enConfigure() ? reinitialiser(c) : nonConfigure(c)))

  app.get('/comptes/lister', lister)
  app.post('/comptes/creer', creer)
  app.post('/comptes/:courriel/modifier', modifier)
}
