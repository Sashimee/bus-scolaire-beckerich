/**
 * Client de l'espace commune.
 *
 * Un agent communal ne détient ni compte GitHub, ni jeton de dépôt : il échange un
 * code personnel contre un jeton de session, et c'est le Worker qui publie en son nom.
 * Ce module ne connaît donc que quatre routes et un jeton, jamais l'API GitHub.
 *
 * Le jeton vit en `sessionStorage` et pas en `localStorage` : il expire au bout de
 * huit heures côté serveur, et fermer l'onglet doit suffire à se déconnecter d'un
 * poste partagé — c'est la même politique que le jeton GitHub de `/admin`.
 */
import { URL_WORKER } from '../config'
import type { Modifications, Surcouche } from './traductions'
import type { Perturbation } from './urgences'

/**
 * Les deux espaces à code personnel, et la clé de session qui va avec.
 *
 * Deux clés distinctes, et non une seule portant un rôle : ouvrir les deux espaces
 * dans le même onglet doit rester possible, et surtout, se déconnecter de l'un ne doit
 * pas emporter l'autre.
 */
export type RoleCommune = 'commune' | 'traductions'

const CLES_SESSION: Record<RoleCommune, string> = {
  commune: 'bus-beckerich.session-commune',
  traductions: 'bus-beckerich.session-traductions',
}

export interface SessionCommune {
  jeton: string
  nom: string
  service: string
  /** Secondes depuis l'époque, telles que le Worker les a signées. */
  expire: number
}

export interface EntreeJournal {
  quand: string
  qui: string
  service: string
  action: string
  detail: string
}

/** L'espace commune n'existe que si un Worker est configuré à la construction. */
export const communeConfiguree = (): boolean => Boolean(URL_WORKER)

export function chargerSession(role: RoleCommune = 'commune'): SessionCommune | null {
  try {
    const brut = sessionStorage.getItem(CLES_SESSION[role])
    if (!brut) return null
    const s = JSON.parse(brut) as SessionCommune
    // Une session expirée vaut une absence de session : mieux vaut redemander le code
    // que laisser l'agent saisir une annulation pour se voir refuser à la publication.
    if (!s?.jeton || s.expire * 1000 < Date.now()) return null
    return s
  } catch {
    return null
  }
}

const enregistrerSession = (role: RoleCommune, s: SessionCommune) => {
  try {
    sessionStorage.setItem(CLES_SESSION[role], JSON.stringify(s))
  } catch {
    /* stockage indisponible : la session vaudra pour cette page seulement */
  }
}

export function oublierSession(role: RoleCommune = 'commune'): void {
  try {
    sessionStorage.removeItem(CLES_SESSION[role])
  } catch {
    /* rien à faire : il n'y avait rien à oublier */
  }
}

/**
 * Motifs d'échec, tels qu'ils seront traduits à l'écran.
 *
 * Le Worker répond en identifiants, pas en phrases : c'est l'interface qui décide de
 * la formulation, et la même erreur doit se lire de la même façon dans les cinq langues.
 */
export type MotifCommune =
  | 'code-inconnu'
  | 'trop-de-tentatives'
  | 'session-expiree'
  /** Le Worker tourne, mais ses secrets ne sont pas posés : l'espace n'existe pas encore. */
  | 'non-activee'
  | 'charge-invalide'
  | 'plan-invalide'
  | 'conflit'
  | 'reseau'
  | 'inconnu'

/**
 * Suffixe i18n d'un motif, sous `commune.erreur.`.
 *
 * Les deux écrans de connexion enchaînaient trois ternaires imbriqués pour retomber sur
 * « inconnu » : ajouter un motif obligeait à les corriger tous les deux, et l'un des
 * deux finissait par être oublié.
 */
export function cleErreur(motif: MotifCommune): string {
  switch (motif) {
    case 'code-inconnu':
      return 'codeInconnu'
    case 'trop-de-tentatives':
      return 'tropDeTentatives'
    case 'session-expiree':
      return 'sessionExpiree'
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

export class ErreurCommune extends Error {
  motif: MotifCommune
  /** Détail exploitable : minutes d'attente, liste de problèmes du plan… */
  detail?: unknown

  constructor(motif: MotifCommune, detail?: unknown) {
    super(motif)
    this.motif = motif
    this.detail = detail
  }
}

async function appeler<T>(
  chemin: string,
  options: { methode?: string; corps?: unknown; jeton?: string } = {},
): Promise<T> {
  let reponse: Response
  try {
    reponse = await fetch(`${URL_WORKER}${chemin}`, {
      method: options.methode ?? 'GET',
      headers: {
        ...(options.corps ? { 'Content-Type': 'application/json' } : {}),
        ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
      },
      ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
    })
  } catch {
    throw new ErreurCommune('reseau')
  }

  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  if (reponse.ok) return donnees as T

  const motif = String(donnees.erreur ?? '')
  if (motif === 'code-inconnu') throw new ErreurCommune('code-inconnu')
  if (motif === 'trop-de-tentatives') throw new ErreurCommune('trop-de-tentatives', donnees.minutes)
  if (motif === 'session-expiree') throw new ErreurCommune('session-expiree')
  // Sans `SECRET_SESSION`, le Worker répond 503 à tout l'espace. Le dire franchement
  // vaut mieux qu'une « erreur inconnue » devant laquelle personne ne sait quoi faire.
  if (motif === 'espace-commune-non-configure') throw new ErreurCommune('non-activee')
  if (motif === 'charge-invalide') throw new ErreurCommune('charge-invalide', donnees.motifs)
  if (motif === 'plan-invalide') throw new ErreurCommune('plan-invalide', donnees.problemes)
  if (reponse.status === 409) throw new ErreurCommune('conflit')
  throw new ErreurCommune('inconnu', motif)
}

/**
 * Échange un code contre un jeton de session, pour l'espace demandé.
 *
 * Un code de l'autre espace est refusé côté Worker : il n'y existe littéralement pas,
 * les deux vivant sous des préfixes distincts.
 */
export async function seConnecter(
  code: string,
  role: RoleCommune = 'commune',
): Promise<SessionCommune> {
  const s = await appeler<SessionCommune>(`/${role}/connexion`, {
    methode: 'POST',
    corps: { code },
  })
  enregistrerSession(role, s)
  return s
}

export async function publierPerturbation(
  session: SessionCommune,
  perturbation: Perturbation,
): Promise<void> {
  await appeler('/commune/perturbations', {
    methode: 'POST',
    corps: { perturbation },
    jeton: session.jeton,
  })
}

export async function retirerPerturbation(session: SessionCommune, id: string): Promise<void> {
  await appeler(`/commune/perturbations/${encodeURIComponent(id)}`, {
    methode: 'DELETE',
    jeton: session.jeton,
  })
}

export async function publierPlan(
  session: SessionCommune,
  plan: unknown,
  resume: string,
): Promise<void> {
  await appeler('/commune/horaires', {
    methode: 'POST',
    corps: { plan, resume },
    jeton: session.jeton,
  })
}

/**
 * Publie des corrections pour UNE langue.
 *
 * On n'envoie que ce qui change, pas la surcouche entière : le Worker relit l'état en
 * ligne et fusionne clé par clé. Deux traducteurs connectés en même temps ne se
 * recouvrent donc plus. Renvoie l'état fusionné, qui devient la nouvelle base.
 */
export async function publierTraductions(
  session: SessionCommune,
  langue: string,
  modifications: Modifications,
): Promise<Surcouche> {
  const { surcouche } = await appeler<{ surcouche: Surcouche }>('/traductions/publier', {
    methode: 'POST',
    corps: { langue, modifications },
    jeton: session.jeton,
  })
  return surcouche ?? {}
}

export async function lireJournal(session: SessionCommune): Promise<EntreeJournal[]> {
  const { entrees } = await appeler<{ entrees: EntreeJournal[] }>('/commune/journal', {
    jeton: session.jeton,
  })
  return entrees ?? []
}
