/**
 * Écriture dans le dépôt, côté Worker.
 *
 * Volontairement distinct de `src/lib/github.ts`, qui fait le même travail côté
 * navigateur : ce dernier importe `src/config.ts`, lequel lit `import.meta.env` et
 * n'existe donc pas hors de Vite. Le dépôt visé est ici une variable d'environnement
 * du Worker, ce qui vaut mieux qu'une constante compilée : le même Worker peut servir
 * un dépôt de test sans recompilation.
 *
 * Le jeton employé est `GITHUB_PAT`, un jeton machine *fine-grained* limité au contenu
 * de CE dépôt. Aucun agent communal ne le voit ni ne le manipule.
 */

const API = 'https://api.github.com'

function entetes(jeton) {
  return {
    Authorization: `Bearer ${jeton}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bus-scolaire-beckerich-worker',
  }
}

function versBase64(texte) {
  let binaire = ''
  for (const o of new TextEncoder().encode(texte)) binaire += String.fromCharCode(o)
  return btoa(binaire)
}

function depuisBase64(base64) {
  const binaire = atob(base64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(binaire, (c) => c.charCodeAt(0)))
}

export function depot(env) {
  return {
    proprietaire: env.DEPOT_PROPRIETAIRE ?? 'Sashimee',
    nom: env.DEPOT_NOM ?? 'bus-scolaire-beckerich',
    branche: env.DEPOT_BRANCHE ?? 'main',
  }
}

/** Relit un fichier du dépôt avec son empreinte, exigée pour toute écriture ultérieure. */
export async function lireFichier(env, chemin) {
  const d = depot(env)
  const rep = await fetch(
    `${API}/repos/${d.proprietaire}/${d.nom}/contents/${chemin}?ref=${d.branche}`,
    // `cache: 'no-store'` n'existe PAS dans le runtime Cloudflare : le Worker lève
    // « The 'cache' field on 'RequestInitializerDict' is not implemented » et toute
    // publication échouait à sa première lecture. `cf.cacheTtl` est l'équivalent ici.
    { headers: entetes(env.GITHUB_PAT), cf: { cacheTtl: 0 } },
  )
  if (!rep.ok) throw new Error(`lecture-impossible-${rep.status}`)
  const donnees = await rep.json()
  return { contenu: JSON.parse(depuisBase64(donnees.content)), sha: donnees.sha }
}

/**
 * Écrit un fichier. Le `sha` transmis garantit qu'on n'écrase pas une publication
 * faite entre-temps par quelqu'un d'autre : GitHub refuse alors avec un 409, et
 * l'appelant relit avant de réessayer. C'est la même précaution que côté navigateur —
 * deux agents communaux peuvent très bien publier à la même minute.
 */
export async function ecrireFichier(env, chemin, contenu, sha, resume) {
  const d = depot(env)
  const rep = await fetch(`${API}/repos/${d.proprietaire}/${d.nom}/contents/${chemin}`, {
    method: 'PUT',
    headers: { ...entetes(env.GITHUB_PAT), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: resume,
      content: versBase64(contenu),
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
