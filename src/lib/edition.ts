/**
 * Client de l'édition gardée par capacité.
 *
 * Ce que faisaient les espaces `/commune` (perturbations, horaires) et `/traductions`
 * par un code personnel passe désormais par un COMPTE à capacités : la session est celle
 * de `lib/comptes`, et chaque publication frappe `/edition/*`. Le serveur revérifie la
 * capacité (`perturbations`, `horaires`, `traductions`) en base à chaque requête — le
 * client, lui, n'a qu'à porter le jeton.
 *
 * Ce module ne connaît donc ni code, ni stockage de session : il ne fait que porter un
 * jeton déjà obtenu (voir `lib/comptes`) vers les routes d'édition, et traduire les
 * refus du serveur en motifs affichables.
 */
import { URL_API } from '../config'
import type { SessionCompte } from './comptes'
import type { Modifications, Surcouche } from './traductions'
import type { Perturbation } from './urgences'

export interface EntreeJournal {
  quand: string
  qui: string
  service: string
  action: string
  detail: string
}

/**
 * Motifs d'échec d'une publication, tels qu'ils seront traduits à l'écran.
 *
 * Le serveur répond en identifiants, pas en phrases : c'est l'interface qui décide de la
 * formulation, et la même erreur doit se lire de la même façon dans les cinq langues.
 */
export type MotifEdition =
  | 'session-expiree'
  | 'capacite-refusee'
  /** Le serveur tourne, mais ses secrets ne sont pas posés : l'édition n'existe pas encore. */
  | 'non-activee'
  | 'charge-invalide'
  | 'plan-invalide'
  | 'conflit'
  | 'reseau'
  | 'inconnu'

/**
 * Suffixe i18n d'un motif, sous `commune.erreur.` — les mêmes clés que du temps des
 * espaces à code, puisque ce sont les mêmes situations vues par le même éditeur.
 */
export function cleErreur(motif: MotifEdition): string {
  switch (motif) {
    case 'session-expiree':
      return 'sessionExpiree'
    case 'capacite-refusee':
      return 'capaciteRefusee'
    case 'non-activee':
      return 'nonActivee'
    case 'conflit':
      return 'conflit'
    case 'reseau':
      return 'reseau'
    default:
      return 'inconnu'
  }
}

export class ErreurEdition extends Error {
  motif: MotifEdition
  /** Détail exploitable : liste de problèmes du plan, motifs de validation… */
  detail?: unknown

  constructor(motif: MotifEdition, detail?: unknown) {
    super(motif)
    this.motif = motif
    this.detail = detail
  }
}

async function appeler<T>(
  chemin: string,
  session: SessionCompte,
  options: { methode?: string; corps?: unknown } = {},
): Promise<T> {
  let reponse: Response
  try {
    reponse = await fetch(`${URL_API}${chemin}`, {
      method: options.methode ?? 'GET',
      headers: {
        ...(options.corps ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${session.jeton}`,
      },
      ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
    })
  } catch {
    throw new ErreurEdition('reseau')
  }

  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  if (reponse.ok) return donnees as T

  const motif = String(donnees.erreur ?? '')
  if (motif === 'session-expiree') throw new ErreurEdition('session-expiree')
  if (motif === 'capacite-refusee') throw new ErreurEdition('capacite-refusee')
  // Sans `SECRET_SESSION`, le serveur répond 503 à toute l'édition. Le dire franchement
  // vaut mieux qu'une « erreur inconnue » devant laquelle personne ne sait quoi faire.
  if (motif === 'comptes-non-configures') throw new ErreurEdition('non-activee')
  if (motif === 'charge-invalide') throw new ErreurEdition('charge-invalide', donnees.motifs)
  if (motif === 'plan-invalide') throw new ErreurEdition('plan-invalide', donnees.problemes)
  if (reponse.status === 409) throw new ErreurEdition('conflit')
  throw new ErreurEdition('inconnu', motif)
}

export async function publierPerturbation(
  session: SessionCompte,
  perturbation: Perturbation,
): Promise<void> {
  await appeler('/edition/perturbations', session, {
    methode: 'POST',
    corps: { perturbation },
  })
}

export async function retirerPerturbation(session: SessionCompte, id: string): Promise<void> {
  await appeler(`/edition/perturbations/${encodeURIComponent(id)}`, session, {
    methode: 'DELETE',
  })
}

export async function publierPlan(
  session: SessionCompte,
  plan: unknown,
  resume: string,
): Promise<void> {
  await appeler('/edition/horaires', session, {
    methode: 'POST',
    corps: { plan, resume },
  })
}

/**
 * Publie des corrections pour UNE langue.
 *
 * On n'envoie que ce qui change, pas la surcouche entière : le serveur relit l'état en
 * ligne et fusionne clé par clé, sous verrou. Deux traducteurs connectés en même temps
 * ne se recouvrent donc plus. Renvoie l'état fusionné, qui devient la nouvelle base.
 */
export async function publierTraductions(
  session: SessionCompte,
  langue: string,
  modifications: Modifications,
): Promise<Surcouche> {
  const { surcouche } = await appeler<{ surcouche: Surcouche }>('/edition/traductions', session, {
    methode: 'POST',
    corps: { langue, modifications },
  })
  return surcouche ?? {}
}

export async function lireJournal(session: SessionCompte): Promise<EntreeJournal[]> {
  const { entrees } = await appeler<{ entrees: EntreeJournal[] }>('/edition/journal', session)
  return entrees ?? []
}

export interface Mesures {
  total: number
  parJour: { jour: string; vues: number }[]
  parChemin: { chemin: string; vues: number }[]
}

/** La fréquentation agrégée des `jours` derniers jours (mesure auto-hébergée, lots 27-28). */
export async function lireMesures(session: SessionCompte, jours = 30): Promise<Mesures> {
  return appeler<Mesures>(`/edition/mesure?jours=${jours}`, session)
}
