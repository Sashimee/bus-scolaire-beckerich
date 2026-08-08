/**
 * Web Push, aux normes définitives : RFC 8291 (chiffrement `aes128gcm`) et RFC 8292
 * (autorisation VAPID `vapid t=…,k=…`).
 *
 * Ce fichier a remplacé la dépendance `webpush-webcrypto`, qui n'implémentait que le
 * brouillon antérieur — `Content-Encoding: aesgcm`, en-têtes `Encryption` et `Crypto-Key`,
 * `Authorization: WebPush …`. Chrome et Firefox acceptent encore ce brouillon ; le service
 * d'Apple, lui, n'a jamais implémenté que les RFC finales et rejetait donc chaque envoi.
 * Comme les abonnés iPhone sont précisément ceux qu'on cherche à joindre, la seule issue
 * était d'émettre le format normalisé.
 *
 * Tout tient dans WebCrypto, disponible tel quel dans le runtime Cloudflare : le Worker
 * n'a plus aucune dépendance.
 */

const encodeur = new TextEncoder()

/** Base64url sans remplissage — le seul format accepté par l'API Push. */
export function base64urlEncode(source) {
  const octets = new Uint8Array(typeof source === 'string' ? encodeur.encode(source) : source)
  let brut = ''
  for (const octet of octets) brut += String.fromCharCode(octet)
  return btoa(brut).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** Réciproque de `base64urlEncode`. Retourne un Uint8Array. */
export function base64urlDecode(texte) {
  let base64 = texte.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  const brut = atob(base64)
  const octets = new Uint8Array(brut.length)
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i)
  return octets
}

/** `Buffer.concat` n'existe pas ici. */
function concatener(morceaux) {
  const total = morceaux.reduce((somme, m) => somme + m.byteLength, 0)
  const sortie = new Uint8Array(total)
  let position = 0
  for (const morceau of morceaux) {
    sortie.set(morceau, position)
    position += morceau.byteLength
  }
  return sortie
}

/**
 * Importe la paire VAPID telle que `scripts/generer-vapid.mjs` la produit : un JWK
 * standard `{kty, crv, x, y, d}`.
 *
 * C'était le point de rupture précédent — l'ancienne bibliothèque attendait
 * `{publicKey, privateKey}` en base64url raw/pkcs8, et levait `Invalid keyData` sur ce
 * JWK. Aucune notification n'était alors même construite. On consomme donc ici le JWK
 * sans conversion, pour qu'il n'y ait plus deux formats à tenir accordés.
 */
export async function importerClesVapid(jwkBrut) {
  const jwk = typeof jwkBrut === 'string' ? JSON.parse(jwkBrut) : jwkBrut

  const cleSignature = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d, ext: true, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  // La moitié publique repart telle quelle dans l'en-tête `k=` : on la réimporte sans `d`
  // pour pouvoir l'exporter en format brut (65 octets, point non compressé).
  const clePubliqueCrypto = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true, key_ops: [] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    [],
  )
  const clePublique = new Uint8Array(await crypto.subtle.exportKey('raw', clePubliqueCrypto))

  return { cleSignature, clePublique }
}

/**
 * Jeton VAPID (RFC 8292) : prouve au service de push que l'envoi vient bien du détenteur
 * de la clé annoncée par le navigateur au moment de l'abonnement.
 *
 * `aud` doit être l'ORIGINE du endpoint, pas son URL complète — un chemin en trop et le
 * service refuse la signature.
 */
export async function construireJwtVapid(cles, origine, contact) {
  const entete = { typ: 'JWT', alg: 'ES256' }
  // 12 h : confortablement sous le maximum de 24 h imposé par la RFC.
  const corps = {
    aud: origine,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: contact,
  }

  const nonSigne = `${base64urlEncode(JSON.stringify(entete))}.${base64urlEncode(JSON.stringify(corps))}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    cles.cleSignature,
    encodeur.encode(nonSigne),
  )

  return `${nonSigne}.${base64urlEncode(signature)}`
}

/** HKDF complet (extraction + expansion) en une passe, ce que fait `deriveBits`. */
async function hkdf(sel, materiel, info, octets) {
  const cle = await crypto.subtle.importKey('raw', materiel, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sel, info },
    cle,
    octets * 8,
  )
  return new Uint8Array(bits)
}

const INFO_CEK = encodeur.encode('Content-Encoding: aes128gcm\0')
const INFO_NONCE = encodeur.encode('Content-Encoding: nonce\0')
const INFO_WEBPUSH = encodeur.encode('WebPush: info\0')

// Taille d'enregistrement annoncée dans l'en-tête. Une notification tient toujours dans
// un seul enregistrement ; 4096 est la valeur usuelle.
const TAILLE_ENREGISTREMENT = 4096

/**
 * Chiffre la charge utile selon la RFC 8291.
 *
 * `options` n'existe que pour les tests : il permet d'imposer le sel et la paire éphémère
 * afin de rejouer le vecteur de l'annexe A de la RFC. En production, les deux sont tirés
 * au hasard à chaque envoi.
 */
export async function chiffrerAes128gcm(abonnement, charge, options = {}) {
  const clesClient = abonnement.keys
  const auth = base64urlDecode(clesClient.auth)
  if (auth.byteLength !== 16) {
    throw new Error(`secret d'authentification de ${auth.byteLength} octets, 16 attendus`)
  }

  const uaPublique = base64urlDecode(clesClient.p256dh)
  const uaCrypto = await crypto.subtle.importKey(
    'raw',
    uaPublique,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )

  // Paire éphémère, propre à cet envoi : sa moitié publique voyage dans l'en-tête du
  // corps (`keyid`), ce qui permet au navigateur de refaire le même calcul ECDH.
  const paireLocale =
    options.paireLocale ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']))
  const localePublique = new Uint8Array(
    await crypto.subtle.exportKey('raw', paireLocale.publicKey),
  )

  const secretPartage = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaCrypto },
      paireLocale.privateKey,
      256,
    ),
  )

  const sel = options.sel ?? crypto.getRandomValues(new Uint8Array(16))

  // RFC 8291 § 3.4. Attention : contrairement au brouillon `aesgcm`, il n'y a pas de
  // « contexte » préfixé par `P-256\0` — c'est exactement ce détail qui rendait les
  // anciens envois indéchiffrables pour un service conforme.
  const infoCle = concatener([INFO_WEBPUSH, uaPublique, localePublique])
  const materiel = await hkdf(auth, secretPartage, infoCle, 32)

  const cek = await hkdf(sel, materiel, INFO_CEK, 16)
  const nonce = await hkdf(sel, materiel, INFO_NONCE, 12)

  const cleChiffrement = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])

  // RFC 8188 : le texte clair est suivi d'un délimiteur. 0x02 marque le dernier
  // enregistrement — il n'y en a qu'un ici.
  const texteClair = concatener([
    typeof charge === 'string' ? encodeur.encode(charge) : new Uint8Array(charge),
    new Uint8Array([0x02]),
  ])

  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cleChiffrement, texteClair),
  )

  // En-tête du corps : sel(16) | rs(4, gros-boutiste) | idlen(1) | clé publique locale(65)
  const enTete = new Uint8Array(16 + 4 + 1 + localePublique.byteLength)
  enTete.set(sel, 0)
  new DataView(enTete.buffer).setUint32(16, TAILLE_ENREGISTREMENT)
  enTete[20] = localePublique.byteLength
  enTete.set(localePublique, 21)

  return concatener([enTete, chiffre])
}

/**
 * Prépare la requête HTTP complète vers le service de push.
 * Renvoie de quoi appeler `fetch` directement.
 */
export async function genererRequetePush({ cles, abonnement, charge, contact, ttl = 3600 }) {
  const origine = new URL(abonnement.endpoint).origin
  const jwt = await construireJwtVapid(cles, origine, contact)
  const corps = await chiffrerAes128gcm(abonnement, charge)

  return {
    endpoint: abonnement.endpoint,
    headers: {
      Authorization: `vapid t=${jwt}, k=${base64urlEncode(cles.clePublique)}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
    },
    body: corps,
  }
}
