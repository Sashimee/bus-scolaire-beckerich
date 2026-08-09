/**
 * Publication des urgences via l'API GitHub.
 *
 * C'est GitHub qui fait autorité, pas l'application : la page d'administration n'est
 * qu'un formulaire. Sans jeton disposant du droit d'écriture sur le dépôt, aucune
 * publication n'est possible — et c'est très bien ainsi, puisqu'une fausse annonce
 * « bus annulé » laisserait des enfants dehors.
 */
import { CHEMIN_CREDITS, CHEMIN_TRADUCTIONS, CHEMIN_URGENCES, DEPOT } from '../config'
import { relireCredits, type Credits } from './credits'
import { appliquerModifications, relireSurcouche, type Modifications, type Surcouche } from './traductions'
import type { Langue } from '../i18n/langues'
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

export interface FichierDepot<T> {
  contenu: T
  /** Empreinte du fichier, exigée par GitHub pour éviter d'écraser une écriture concurrente. */
  sha: string
}

/** Relit n'importe quel fichier JSON du dépôt, avec son empreinte. */
export async function lireFichier<T>(jeton: string, chemin: string): Promise<FichierDepot<T>> {
  const rep = await fetch(
    `${API}/repos/${DEPOT.proprietaire}/${DEPOT.nom}/contents/${chemin}?ref=${DEPOT.branche}`,
    { headers: entetes(jeton), cache: 'no-store' },
  )
  if (!rep.ok) throw new Error('lecture-impossible')
  const donnees = (await rep.json()) as { content: string; sha: string }
  return { contenu: JSON.parse(depuisBase64(donnees.content)) as T, sha: donnees.sha }
}

/**
 * Écrit n'importe quel fichier JSON du dépôt.
 * Le `sha` garantit qu'on n'écrase pas une modification publiée entre-temps.
 */
export async function ecrireFichier(
  jeton: string,
  chemin: string,
  contenu: unknown,
  sha: string,
  resume: string,
): Promise<void> {
  const rep = await fetch(`${API}/repos/${DEPOT.proprietaire}/${DEPOT.nom}/contents/${chemin}`, {
    method: 'PUT',
    headers: { ...entetes(jeton), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: resume,
      content: versBase64(JSON.stringify(contenu, null, 2) + '\n'),
      sha,
      branch: DEPOT.branche,
    }),
  })

  if (rep.status === 409) throw new Error('conflit')
  if (!rep.ok) throw new Error(`publication-impossible-${rep.status}`)
}

/**
 * Publie la surcouche de traduction depuis `/admin`, avec le jeton de l'utilisateur.
 *
 * Pendant du `publierTraductions` de l'espace `/traductions`, qui passe lui par le
 * Worker. La validation est la même des deux côtés — `relireSurcouche` — pour qu'un
 * fichier publié par l'un soit toujours lisible par l'autre.
 */
export async function publierSurcoucheGithub(
  jeton: string,
  langue: string,
  modifications: Modifications,
): Promise<Surcouche> {
  // Relire avant de fusionner, comme le Worker : /admin et /traductions écrivent dans
  // le même fichier, et rien n'empêche les deux d'être ouverts en même temps.
  const { contenu, sha } = await lireFichier<unknown>(jeton, CHEMIN_TRADUCTIONS)
  const propre = appliquerModifications(relireSurcouche(contenu), langue as Langue, modifications)
  await ecrireFichier(
    jeton,
    CHEMIN_TRADUCTIONS,
    {
      $commentaire:
        "Corrections de traduction, relues par l'application À CHAQUE OUVERTURE, sans " +
        'reconstruction du bundle. Publié depuis /traductions ou /admin.',
      misAJour: new Date().toISOString(),
      langues: propre,
    },
    sha,
    `Traductions (${langue})`,
  )
  return propre
}

/**
 * Publie les crédits.
 *
 * Contrairement aux traductions, ce fichier est DANS le bundle : sa publication
 * déclenche une reconstruction du site. C'est acceptable pour une page qui change
 * quelques fois par an, et cela lui évite un aller-réseau à chaque ouverture.
 */
export async function publierCreditsGithub(jeton: string, credits: Credits): Promise<void> {
  const { contenu, sha } = await lireFichier<Record<string, unknown>>(jeton, CHEMIN_CREDITS)
  const propre = relireCredits(credits)
  await ecrireFichier(
    jeton,
    CHEMIN_CREDITS,
    // Le `$commentaire` du fichier porte la règle sur les noms de tiers : le perdre à
    // la première publication depuis /admin serait dommage.
    { $commentaire: contenu.$commentaire, ...propre },
    sha,
    'Crédits : mise à jour',
  )
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
