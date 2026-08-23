/**
 * Lecture et écriture dans le dépôt.
 *
 * Le jeton employé est `GITHUB_PAT`, un jeton machine *fine-grained* limité au contenu
 * de CE dépôt. Aucun agent communal ne le voit ni ne le manipule.
 *
 * **Ce module a une date de péremption : le lot 25.** Quand les perturbations, la
 * surcouche de traduction et les horaires vivront en base, plus rien n'aura besoin
 * d'écrire dans le dépôt, et `GITHUB_PAT` disparaîtra avec lui. Il est repris ici
 * parce que le lot 21 change d'hébergement et rien d'autre : mélanger les deux
 * rendrait impossible de dire laquelle des deux ruptures a cassé quoi.
 */

const API = 'https://api.github.com'

function entetes(jeton: string): Record<string, string> {
  return {
    Authorization: `Bearer ${jeton}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bus-scolaire-beckerich-serveur',
  }
}

export function depot() {
  return {
    proprietaire: process.env.DEPOT_PROPRIETAIRE ?? 'Sashimee',
    nom: process.env.DEPOT_NOM ?? 'bus-scolaire-beckerich',
    branche: process.env.DEPOT_BRANCHE ?? 'main',
  }
}

/**
 * `cache: 'no-store'` — et c'est un RETOUR, pas une nouveauté.
 *
 * Sous Cloudflare, ce champ n'était pas implémenté : le Worker levait « The 'cache'
 * field on 'RequestInitializerDict' is not implemented » et toute publication échouait
 * à sa première lecture. Il avait fallu deux jours pour le voir (réserve R3), et le
 * contournement était `cf: { cacheTtl: 0 }`, propre à Cloudflare. Sous Node, c'est
 * exactement l'inverse : `cf` n'existe pas et `cache` fonctionne. La règle s'inverse
 * avec le runtime — d'où la disparition de `worker/src/runtime.test.js`, qui refusait
 * `cache:` dans les sources.
 */
const SANS_CACHE: RequestInit = { cache: 'no-store' }

/** Relit un fichier du dépôt avec son empreinte, exigée pour toute écriture ultérieure. */
export async function lireFichier(chemin: string): Promise<{ contenu: any; sha: string }> {
  const d = depot()
  const rep = await fetch(
    `${API}/repos/${d.proprietaire}/${d.nom}/contents/${encodeURI(chemin)}?ref=${d.branche}`,
    { ...SANS_CACHE, headers: entetes(process.env.GITHUB_PAT ?? '') },
  )
  if (!rep.ok) throw new Error(`lecture-impossible-${rep.status}`)
  const donnees = (await rep.json()) as { content: string; sha: string }
  const texte = Buffer.from(donnees.content.replace(/\s/g, ''), 'base64').toString('utf8')
  return { contenu: JSON.parse(texte), sha: donnees.sha }
}

/**
 * Écrit un fichier. Le `sha` transmis garantit qu'on n'écrase pas une publication
 * faite entre-temps par quelqu'un d'autre : GitHub refuse alors avec un 409, et
 * l'appelant relit avant de réessayer. Deux agents communaux peuvent très bien
 * publier à la même minute.
 */
export async function ecrireFichier(
  chemin: string,
  contenu: string,
  sha: string,
  resume: string,
): Promise<void> {
  const d = depot()
  const rep = await fetch(`${API}/repos/${d.proprietaire}/${d.nom}/contents/${encodeURI(chemin)}`, {
    ...SANS_CACHE,
    method: 'PUT',
    headers: { ...entetes(process.env.GITHUB_PAT ?? ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: resume,
      content: Buffer.from(contenu, 'utf8').toString('base64'),
      sha,
      branch: d.branche,
    }),
  })
  if (rep.status === 409) throw new Error('conflit')
  if (!rep.ok) {
    const motif = (await rep.text().catch(() => '')).slice(0, 200)
    throw new Error(`ecriture-impossible-${rep.status}-${motif}`)
  }
}

/**
 * Le jeton machine peut-il écrire dans le dépôt ?
 *
 * Une lecture suffit à distinguer les trois cas qui comptent : pas de jeton, jeton
 * refusé, jeton sans droit d'écriture. On sonde EXACTEMENT ce que fait une
 * publication — lire un fichier — parce que lire les métadonnées du dépôt ne prouve
 * rien : un jeton peut voir le dépôt sans avoir la permission `Contents`, et c'est
 * elle qui compte ici.
 */
export async function etatDepot(): Promise<string | Record<string, string>> {
  if (!process.env.GITHUB_PAT) return 'absent'
  const sonder = async (chemin: string) => {
    try {
      await lireFichier(chemin)
      return 'ok'
    } catch (e) {
      return String((e as Error).message).replace('lecture-impossible-', '')
    }
  }
  return {
    urgences: await sonder('public/urgences.json'),
    traductions: await sonder('public/traductions.json'),
  }
}
