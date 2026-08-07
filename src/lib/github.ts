/**
 * Publication des urgences via l'API GitHub.
 *
 * C'est GitHub qui fait autorité, pas l'application : la page d'administration n'est
 * qu'un formulaire. Sans jeton disposant du droit d'écriture sur le dépôt, aucune
 * publication n'est possible — et c'est très bien ainsi, puisqu'une fausse annonce
 * « bus annulé » laisserait des enfants dehors.
 */
import { CHEMIN_URGENCES, DEPOT } from '../config'
import type { Urgences } from './urgences'

const API = 'https://api.github.com'

export interface Identite {
  login: string
  nom: string | null
  avatar: string
  /** Vrai seulement si ce compte peut écrire dans le dépôt. */
  peutPublier: boolean
}

function entetes(jeton: string): HeadersInit {
  return {
    Authorization: `Bearer ${jeton}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function versBase64(texte: string): string {
  let binaire = ''
  for (const o of new TextEncoder().encode(texte)) binaire += String.fromCharCode(o)
  return btoa(binaire)
}

function depuisBase64(base64: string): string {
  const binaire = atob(base64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(binaire, (c) => c.charCodeAt(0)))
}

/**
 * Vérifie le jeton et, surtout, le droit d'écriture sur ce dépôt précis.
 * Un jeton valide mais sans droit ne doit pas déverrouiller le formulaire.
 */
export async function verifierAcces(jeton: string): Promise<Identite> {
  const [utilisateur, depot] = await Promise.all([
    fetch(`${API}/user`, { headers: entetes(jeton) }),
    fetch(`${API}/repos/${DEPOT.proprietaire}/${DEPOT.nom}`, { headers: entetes(jeton) }),
  ])

  if (!utilisateur.ok) throw new Error('jeton-invalide')

  const u = (await utilisateur.json()) as { login: string; name: string | null; avatar_url: string }
  const d = depot.ok
    ? ((await depot.json()) as { permissions?: { push?: boolean } })
    : { permissions: { push: false } }

  return {
    login: u.login,
    nom: u.name,
    avatar: u.avatar_url,
    peutPublier: Boolean(d.permissions?.push),
  }
}

export interface FichierUrgences {
  urgences: Urgences
  /** Empreinte du fichier, exigée par GitHub pour éviter d'écraser une écriture concurrente. */
  sha: string
}

/** Relit le fichier tel qu'il est dans le dépôt, avec son empreinte. */
export async function lireUrgencesDepot(jeton: string): Promise<FichierUrgences> {
  const rep = await fetch(
    `${API}/repos/${DEPOT.proprietaire}/${DEPOT.nom}/contents/${CHEMIN_URGENCES}?ref=${DEPOT.branche}`,
    { headers: entetes(jeton), cache: 'no-store' },
  )
  if (!rep.ok) throw new Error('lecture-impossible')
  const donnees = (await rep.json()) as { content: string; sha: string }
  return {
    urgences: JSON.parse(depuisBase64(donnees.content)) as Urgences,
    sha: donnees.sha,
  }
}

/**
 * Écrit le fichier. Le `sha` transmis garantit qu'on ne remplace pas une modification
 * publiée entre-temps par quelqu'un d'autre : GitHub refuse alors l'écriture.
 */
export async function publierUrgences(
  jeton: string,
  urgences: Urgences,
  sha: string,
  resume: string,
): Promise<void> {
  const contenu = JSON.stringify({ ...urgences, misAJour: new Date().toISOString() }, null, 2) + '\n'

  const rep = await fetch(
    `${API}/repos/${DEPOT.proprietaire}/${DEPOT.nom}/contents/${CHEMIN_URGENCES}`,
    {
      method: 'PUT',
      headers: { ...entetes(jeton), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: resume,
        content: versBase64(contenu),
        sha,
        branch: DEPOT.branche,
      }),
    },
  )

  if (rep.status === 409) throw new Error('conflit')
  if (!rep.ok) throw new Error(`publication-impossible-${rep.status}`)
}
