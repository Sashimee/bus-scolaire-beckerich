/**
 * Outils HTTP partagés : CORS, lecture de corps JSON, adresse du client.
 */
import type { Context } from 'hono'

export const originesPermises = (): string[] =>
  (process.env.ORIGINES_AUTORISEES ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

/**
 * CORS.
 *
 * L'origine de la requête n'est renvoyée que si elle figure dans
 * `ORIGINES_AUTORISEES` ; sinon on renvoie la première de la liste. Renvoyer
 * l'origine TELLE QUELLE reviendrait à autoriser tout le monde sur `/abonner` et
 * `/desabonner` : n'importe quel site pourrait faire désabonner un parent depuis son
 * navigateur.
 *
 * Le jour où le site et l'API partagent l'origine `app.schoulbus.lu` (lot 23), tout
 * ceci ne sert plus qu'à l'ancienne origine, le temps de la transition.
 */
export function entetesCors(origine: string, avecJeton: boolean): Record<string, string> {
  const permises = originesPermises()
  return {
    'Access-Control-Allow-Origin': permises.includes(origine) ? origine : (permises[0] ?? 'null'),
    'Access-Control-Allow-Methods': avecJeton ? 'GET, POST, DELETE, OPTIONS' : 'POST, OPTIONS',
    'Access-Control-Allow-Headers': avecJeton ? 'Content-Type, Authorization' : 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/**
 * L'adresse du client, derrière le proxy inverse.
 *
 * **Le piège le plus silencieux de tout le portage.** Le Worker lisait
 * `CF-Connecting-IP`, que Cloudflare posait lui-même. Derrière Traefik, cet en-tête
 * n'existe pas : le lire renverrait `'inconnue'` pour tout le monde, et la limitation
 * à cinq tentatives deviendrait un seul seau partagé par la planète entière — cinq
 * essais au total, puis plus personne ne peut se connecter. Rien ne le signalerait.
 *
 * On prend l'entrée à `NB_PROXYS_FIABLES` rangs de la FIN, et non la première.
 * `X-Forwarded-For` est écrit par le client puis complété par chaque relais : un
 * client peut y mettre ce qu'il veut, mais il ne peut pas écrire APRÈS lui. Avec un
 * seul relais devant nous, la dernière entrée est celle que Traefik a constatée, donc
 * la seule digne de foi. Prendre la première laisserait n'importe qui se donner une
 * adresse neuve à chaque tentative.
 */
export function ipDeLaRequete(entetes: Headers, pair?: string): string {
  const brut = entetes.get('x-forwarded-for')
  if (brut) {
    const chaine = brut
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    const relais = Math.max(1, Number(process.env.NB_PROXYS_FIABLES ?? 1))
    const adresse = chaine[chaine.length - relais]
    if (adresse) return adresse
  }
  return pair || 'inconnue'
}

/**
 * Lit un corps JSON en refusant ce qui est trop gros ou mal typé.
 *
 * Sans plafond, un `POST` d'un mégaoctet consomme la mémoire de l'invocation. Et sans
 * `try`, un corps qui n'est pas du JSON remonte en exception 500 plutôt qu'en refus
 * explicite — ce qui rendait la panne illisible.
 */
export async function corpsJson<T = Record<string, unknown>>(
  c: Context,
  maxOctets = 8 * 1024,
): Promise<T> {
  if (!(c.req.header('content-type') ?? '').includes('application/json')) {
    throw new Error('type-attendu-json')
  }
  const texte = await c.req.text()
  if (texte.length > maxOctets) throw new Error('corps-trop-gros')
  try {
    return JSON.parse(texte) as T
  } catch {
    throw new Error('json-illisible')
  }
}

/**
 * L'origine publique du serveur.
 *
 * Elle sert à fabriquer le `redirect_uri` d'OAuth, que GitHub et Google comparent
 * caractère par caractère à ce qui est enregistré chez eux. Derrière un proxy,
 * l'URL vue par le serveur porte le nom du conteneur : la déduire de la requête
 * produirait `http://bus-api:3000/auth/callback` et l'échange serait refusé sans
 * qu'on comprenne pourquoi. On la déclare donc, et on ne la devine qu'à défaut.
 */
export function originePublique(c: Context): string {
  const declaree = (process.env.URL_API_PUBLIQUE ?? '').replace(/\/$/, '')
  if (declaree) return declaree

  const proto = c.req.header('x-forwarded-proto') ?? 'http'
  const hote = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? 'localhost'
  const base = (process.env.BASE_API ?? '/api').replace(/\/$/, '')
  return `${proto}://${hote}${base}`
}

/**
 * N'autorise la redirection que vers les origines déclarées.
 *
 * Sans ce contrôle, le serveur serait une redirection ouverte : n'importe qui
 * pourrait forger un lien renvoyant un jeton GitHub vers un site tiers.
 */
export function retourAutorise(retour: string): URL | null {
  const permises = originesPermises()
  try {
    const url = new URL(retour)
    return permises.includes(url.origin) ? url : null
  } catch {
    return null
  }
}
