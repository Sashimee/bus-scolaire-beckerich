/**
 * Empreintes, comparaison à temps constant, jetons de session signés.
 *
 * Repris du Worker sans changer un seul choix : ce sont des primitives WebCrypto,
 * disponibles telles quelles sous Node 22. Seul le typage est ajouté.
 */

const encodeur = new TextEncoder()

const hex = (tampon: ArrayBuffer) =>
  [...new Uint8Array(tampon)].map((o) => o.toString(16).padStart(2, '0')).join('')

export async function empreinte(texte: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encodeur.encode(texte)))
}

/**
 * Un jeton opaque, imprévisible : 32 octets tirés au hasard, en base64url. Sert aux
 * liens de vérification d'adresse et de réinitialisation, qui ne sont devinables par
 * personne — c'est leur seule protection, puisque les connaître suffit à s'en servir.
 */
export function jetonAleatoire(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

/**
 * Comparaison à temps constant.
 *
 * Un `===` sur deux chaînes s'arrête au premier caractère différent : le temps de
 * réponse trahit alors combien de caractères sont justes, et un code se devine
 * lettre par lettre. On compare donc toujours la totalité.
 */
export function egalConstant(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let ecart = 0
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return ecart === 0
}

const base64url = (octets: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(octets)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const depuisBase64url = (texte: string) => {
  const base64 = texte.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
    c.charCodeAt(0),
  )
}

async function cleHmac(secret: string) {
  return crypto.subtle.importKey('raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

export interface ChargeJeton {
  nom: string
  service: string
  role: string
  expire: number
  // Comptes utilisateurs (lot 24). Absents sur les jetons des espaces à code personnel,
  // qui n'ont qu'un `role` ; présents sur les jetons de compte, qui portent un courriel
  // et un ensemble de capacités signé — donc non modifiable par le porteur.
  courriel?: string
  capacites?: string[]
}

/** Jeton de session signé : `charge.signature`, tous deux en base64url. */
export async function signerJeton(charge: ChargeJeton, secret: string): Promise<string> {
  const corps = base64url(encodeur.encode(JSON.stringify(charge)))
  const signature = await crypto.subtle.sign('HMAC', await cleHmac(secret), encodeur.encode(corps))
  return `${corps}.${base64url(signature)}`
}

/** Relit un jeton de session. `null` si la signature ne colle pas ou si l'heure est passée. */
export async function verifierJeton(jeton: unknown, secret: string): Promise<ChargeJeton | null> {
  if (typeof jeton !== 'string' || !jeton.includes('.')) return null
  const [corps, signature] = jeton.split('.')
  if (!corps || !signature) return null
  try {
    const valide = await crypto.subtle.verify(
      'HMAC',
      await cleHmac(secret),
      depuisBase64url(signature),
      encodeur.encode(corps),
    )
    if (!valide) return null
    const charge = JSON.parse(new TextDecoder().decode(depuisBase64url(corps)))
    // L'expiration est DANS la charge signée : elle ne peut donc pas être repoussée
    // par le porteur du jeton.
    if (typeof charge?.expire !== 'number' || charge.expire < Date.now() / 1000) return null
    return charge as ChargeJeton
  } catch {
    return null
  }
}
