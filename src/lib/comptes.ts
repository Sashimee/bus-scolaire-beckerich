/**
 * Client de l'espace comptes (lot 24).
 *
 * Un compte — courriel + mot de passe — échangé contre un jeton de session signé, qui
 * porte les CAPACITÉS accordées. Même esprit que `lib/commune.ts`, mais l'identité est
 * réutilisable et les droits ne sont plus un rôle figé.
 *
 * La session vit en `sessionStorage` par défaut : fermer l'onglet déconnecte d'un poste
 * partagé. « Rester connecté » la range en `localStorage`, où elle survit à la fermeture
 * — le serveur ayant alors signé un jeton de trente jours et non de huit heures.
 */
import { URL_API } from '../config'
import { relireCredits, type Credits } from './credits'
import type { CorrectionArret } from './urgences'

export type Capacite = 'perturbations' | 'arrets' | 'horaires' | 'traductions' | 'credits' | 'comptes'

export interface SessionCompte {
  jeton: string
  courriel: string
  nom: string
  capacites: Capacite[]
  service: string
  langue: string
  /** Secondes depuis l'époque, telles que le serveur les a signées. */
  expire: number
}

const CLE_SESSION = 'bus-beckerich.session-compte'

/** L'espace comptes n'existe que si un serveur est configuré à la construction. */
export const comptesConfigures = (): boolean => Boolean(URL_API)

const stockages = (): Storage[] => {
  const dispo: Storage[] = []
  try {
    dispo.push(sessionStorage)
  } catch {
    /* indisponible */
  }
  try {
    dispo.push(localStorage)
  } catch {
    /* indisponible */
  }
  return dispo
}

export function chargerSession(): SessionCompte | null {
  for (const s of stockages()) {
    try {
      const brut = s.getItem(CLE_SESSION)
      if (!brut) continue
      const session = JSON.parse(brut) as SessionCompte
      // Une session expirée vaut une absence : mieux vaut redemander le mot de passe que
      // laisser croire à une connexion qui sera refusée à la première action.
      if (!session?.jeton || session.expire * 1000 < Date.now()) continue
      return session
    } catch {
      /* entrée illisible : on l'ignore */
    }
  }
  return null
}

function enregistrerSession(session: SessionCompte, seSouvenir: boolean): void {
  // On efface des DEUX stockages d'abord : sans cela, une ancienne session en
  // `sessionStorage` masquerait une nouvelle « rester connecté » rangée en `localStorage`.
  oublierSession()
  try {
    ;(seSouvenir ? localStorage : sessionStorage).setItem(CLE_SESSION, JSON.stringify(session))
  } catch {
    /* stockage indisponible : la session vaudra pour cette page seulement */
  }
}

export function oublierSession(): void {
  for (const s of stockages()) {
    try {
      s.removeItem(CLE_SESSION)
    } catch {
      /* rien à oublier */
    }
  }
}

/** Motifs d'échec, traduits à l'écran sous `comptes.erreur.`. */
export type MotifCompte =
  | 'identifiants-invalides'
  | 'courriel-non-verifie'
  | 'trop-de-tentatives'
  | 'session-expiree'
  | 'capacite-refusee'
  | 'non-configure'
  | 'courriel-non-configure'
  | 'mot-de-passe-trop-court'
  | 'ancien-mot-de-passe-invalide'
  | 'courriel-deja-pris'
  | 'lien-invalide-ou-expire'
  | 'auto-verrouillage-refuse'
  | 'charge-invalide'
  | 'reseau'
  | 'inconnu'

export class ErreurCompte extends Error {
  motif: MotifCompte
  detail?: unknown
  constructor(motif: MotifCompte, detail?: unknown) {
    super(motif)
    this.motif = motif
    this.detail = detail
  }
}

/** Le serveur répond en identifiants ; l'interface décide de la phrase, dans les 5 langues. */
const MOTIFS: Record<string, MotifCompte> = {
  'identifiants-invalides': 'identifiants-invalides',
  'courriel-non-verifie': 'courriel-non-verifie',
  'trop-de-tentatives': 'trop-de-tentatives',
  'session-expiree': 'session-expiree',
  'capacite-refusee': 'capacite-refusee',
  'comptes-non-configures': 'non-configure',
  'courriel-non-configure': 'courriel-non-configure',
  'mot-de-passe-trop-court': 'mot-de-passe-trop-court',
  'ancien-mot-de-passe-invalide': 'ancien-mot-de-passe-invalide',
  'courriel-deja-pris': 'courriel-deja-pris',
  'lien-invalide-ou-expire': 'lien-invalide-ou-expire',
  'auto-verrouillage-refuse': 'auto-verrouillage-refuse',
  'charge-invalide': 'charge-invalide',
}

async function appeler<T>(
  chemin: string,
  options: { methode?: string; corps?: unknown; jeton?: string } = {},
): Promise<T> {
  let reponse: Response
  try {
    reponse = await fetch(`${URL_API}${chemin}`, {
      method: options.methode ?? 'GET',
      headers: {
        ...(options.corps ? { 'Content-Type': 'application/json' } : {}),
        ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
      },
      ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
    })
  } catch {
    throw new ErreurCompte('reseau')
  }

  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  if (reponse.ok) return donnees as T

  const brut = String(donnees.erreur ?? '')
  const motif = MOTIFS[brut] ?? 'inconnu'
  throw new ErreurCompte(motif, motif === 'trop-de-tentatives' ? donnees.minutes : donnees)
}

export interface Compte {
  courriel: string
  nom: string
  capacites: Capacite[]
  service: string
  langue: string
  courrielVerifie: boolean
  desactive: boolean
  creeLe: string
  dernierAcces: string | null
}

export async function seConnecter(
  courriel: string,
  motDePasse: string,
  seSouvenir: boolean,
): Promise<SessionCompte> {
  const s = await appeler<SessionCompte>('/comptes/connexion', {
    methode: 'POST',
    corps: { courriel, motDePasse, seSouvenir },
  })
  enregistrerSession(s, seSouvenir)
  return s
}

export const demanderReinitialisation = (courriel: string): Promise<unknown> =>
  appeler('/comptes/mot-de-passe-oublie', { methode: 'POST', corps: { courriel } })

export const reinitialiser = (jeton: string, motDePasse: string): Promise<unknown> =>
  appeler('/comptes/reinitialiser', { methode: 'POST', corps: { jeton, motDePasse } })

export const changerMotDePasse = (
  session: SessionCompte,
  ancien: string,
  nouveau: string,
): Promise<unknown> =>
  appeler('/comptes/changer-mot-de-passe', {
    methode: 'POST',
    corps: { ancien, nouveau },
    jeton: session.jeton,
  })

export const listerComptes = (session: SessionCompte): Promise<{ comptes: Compte[] }> =>
  appeler('/comptes/lister', { jeton: session.jeton })

export const creerCompte = (
  session: SessionCompte,
  compte: { courriel: string; nom: string; capacites: Capacite[]; service?: string; langue?: string },
): Promise<unknown> => appeler('/comptes/creer', { methode: 'POST', corps: compte, jeton: session.jeton })

export const modifierCompte = (
  session: SessionCompte,
  courriel: string,
  champs: { nom?: string; capacites?: Capacite[]; service?: string; langue?: string; desactive?: boolean },
): Promise<unknown> =>
  appeler(`/comptes/${encodeURIComponent(courriel)}/modifier`, {
    methode: 'POST',
    corps: champs,
    jeton: session.jeton,
  })

export const CAPACITES: Capacite[] = [
  'perturbations',
  'arrets',
  'horaires',
  'traductions',
  'credits',
  'comptes',
]

// — Édition gardée par capacité (remplace l'ancien /admin par jeton GitHub) —————

/** Ce que l'éditeur de crédits reçoit et republie. Sans `sha` : l'API écrase en dernier. */
export interface CreditsEnLigne {
  credits: Credits
}

/** Lit les crédits courants (lecture publique), pour partir de l'état en ligne et non du bundle. */
export const lireCreditsEnLigne = async (): Promise<CreditsEnLigne> => {
  const r = await appeler<{ credits: unknown }>('/credits')
  return { credits: relireCredits(r.credits) }
}

export const publierCredits = async (
  session: SessionCompte,
  credits: Credits,
): Promise<CreditsEnLigne> => {
  const r = await appeler<{ credits: unknown }>('/edition/credits', {
    methode: 'POST',
    corps: { credits },
    jeton: session.jeton,
  })
  return { credits: relireCredits(r.credits) }
}

export const publierCorrection = (
  session: SessionCompte,
  correction: Pick<CorrectionArret, 'arret' | 'coord'> & { jusqua?: string; note?: string },
): Promise<unknown> =>
  appeler('/edition/corrections', {
    methode: 'POST',
    corps: { correction },
    jeton: session.jeton,
  })

export const retirerCorrection = (session: SessionCompte, arret: string): Promise<unknown> =>
  appeler(`/edition/corrections/${encodeURIComponent(arret)}`, {
    methode: 'DELETE',
    jeton: session.jeton,
  })
