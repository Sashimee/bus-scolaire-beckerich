// @vitest-environment node
/**
 * Le chiffrement push est la seule partie du projet qu'on ne peut pas vérifier en la
 * regardant : une dérivation fausse produit un corps parfaitement bien formé, que le
 * téléphone jettera en silence. C'est exactement ainsi que le bogue précédent a survécu.
 *
 * On rejoue donc le vecteur de test de l'annexe A de la RFC 8291, octet pour octet.
 */
import { describe, expect, it } from 'vitest'
import {
  base64urlDecode,
  base64urlEncode,
  chiffrerAes128gcm,
  construireJwtVapid,
  genererRequetePush,
  importerClesVapid,
} from './push.js'

/** Vecteur de l'annexe A de la RFC 8291. */
const VECTEUR = {
  texteClair: 'When I grow up, I want to be a watermelon',
  uaPublique: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivee: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPublique: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivee: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  sel: 'DGv6ra1nlYgDCS1FRnbzlw',
  corpsAttendu:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

/** Reconstruit une paire ECDH P-256 à partir des composantes brutes du vecteur. */
async function paireEcdh(publiqueB64, priveeB64) {
  const publique = base64urlDecode(publiqueB64)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64urlEncode(publique.slice(1, 33)),
    y: base64urlEncode(publique.slice(33, 65)),
    ext: true,
  }
  return {
    publicKey: await crypto.subtle.importKey(
      'jwk',
      { ...jwk, key_ops: [] },
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    ),
    privateKey: await crypto.subtle.importKey(
      'jwk',
      { ...jwk, d: priveeB64, key_ops: ['deriveBits'] },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    ),
  }
}

describe('chiffrerAes128gcm', () => {
  it('reproduit le vecteur de la RFC 8291 octet pour octet', async () => {
    const corps = await chiffrerAes128gcm(
      { keys: { p256dh: VECTEUR.uaPublique, auth: VECTEUR.auth } },
      VECTEUR.texteClair,
      {
        sel: base64urlDecode(VECTEUR.sel),
        paireLocale: await paireEcdh(VECTEUR.asPublique, VECTEUR.asPrivee),
      },
    )

    expect(base64urlEncode(corps)).toBe(VECTEUR.corpsAttendu)
  })

  it('se relit : ce qui est chiffré se déchiffre avec la clé privée de l’abonné', async () => {
    const charge = JSON.stringify({ titre: 'Bus annulé', corps: 'Ligne 1 supprimée' })
    const corps = await chiffrerAes128gcm(
      { keys: { p256dh: VECTEUR.uaPublique, auth: VECTEUR.auth } },
      charge,
    )

    // On rejoue le travail du navigateur : lire l'en-tête, refaire l'ECDH, déchiffrer.
    const sel = corps.slice(0, 16)
    const longueurId = corps[20]
    const asPublique = corps.slice(21, 21 + longueurId)
    const chiffre = corps.slice(21 + longueurId)

    const paireUa = await paireEcdh(VECTEUR.uaPublique, VECTEUR.uaPrivee)
    const asCrypto = await crypto.subtle.importKey(
      'raw',
      asPublique,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    )
    const secret = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'ECDH', public: asCrypto }, paireUa.privateKey, 256),
    )

    const enc = new TextEncoder()
    const concat = (parties) => {
      const sortie = new Uint8Array(parties.reduce((s, p) => s + p.byteLength, 0))
      let i = 0
      for (const p of parties) {
        sortie.set(p, i)
        i += p.byteLength
      }
      return sortie
    }
    const hkdf = async (selHk, materiel, info, octets) => {
      const cle = await crypto.subtle.importKey('raw', materiel, 'HKDF', false, ['deriveBits'])
      return new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: 'HKDF', hash: 'SHA-256', salt: selHk, info },
          cle,
          octets * 8,
        ),
      )
    }

    const materiel = await hkdf(
      base64urlDecode(VECTEUR.auth),
      secret,
      concat([enc.encode('WebPush: info\0'), base64urlDecode(VECTEUR.uaPublique), asPublique]),
      32,
    )
    const cek = await hkdf(sel, materiel, enc.encode('Content-Encoding: aes128gcm\0'), 16)
    const nonce = await hkdf(sel, materiel, enc.encode('Content-Encoding: nonce\0'), 12)

    const clair = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce },
        await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']),
        chiffre,
      ),
    )

    // Le dernier octet est le délimiteur d'enregistrement RFC 8188.
    expect(clair[clair.length - 1]).toBe(0x02)
    expect(new TextDecoder().decode(clair.slice(0, -1))).toBe(charge)
  })

  it('refuse un secret d’authentification de mauvaise taille plutôt que d’envoyer du vide', async () => {
    await expect(
      chiffrerAes128gcm({ keys: { p256dh: VECTEUR.uaPublique, auth: 'trop-court' } }, 'coucou'),
    ).rejects.toThrow(/16 attendus/)
  })
})

describe('importerClesVapid', () => {
  /** Exactement la forme produite par `scripts/generer-vapid.mjs`. */
  async function jwkVapid() {
    const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    const privee = await crypto.subtle.exportKey('jwk', paire.privateKey)
    const publique = await crypto.subtle.exportKey('jwk', paire.publicKey)
    const brute = new Uint8Array(await crypto.subtle.exportKey('raw', paire.publicKey))
    return {
      jwk: { ...privee, x: publique.x, y: publique.y, key_ops: ['sign'] },
      clePubliqueAttendue: brute,
    }
  }

  it('accepte le JWK produit par generer-vapid.mjs', async () => {
    const { jwk, clePubliqueAttendue } = await jwkVapid()
    const cles = await importerClesVapid(JSON.stringify(jwk))

    // C'est la régression à verrouiller : l'ancienne bibliothèque levait « Invalid keyData »
    // sur ce format, et plus aucune notification n'était construite.
    expect(cles.clePublique).toEqual(clePubliqueAttendue)
    expect(cles.clePublique.byteLength).toBe(65)
  })

  it('produit une clé publique identique à la variable CLE_VAPID du site', async () => {
    const { jwk, clePubliqueAttendue } = await jwkVapid()
    const cles = await importerClesVapid(jwk)
    // 87 caractères base64url : la forme qu'attend `pushManager.subscribe`.
    expect(base64urlEncode(cles.clePublique)).toBe(base64urlEncode(clePubliqueAttendue))
    expect(base64urlEncode(cles.clePublique)).toMatch(/^B[A-Za-z0-9_-]{85,87}$/)
  })
})

describe('construireJwtVapid', () => {
  it('signe un jeton vérifiable, visant l’origine et non l’URL complète', async () => {
    const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    const jwkPrivee = await crypto.subtle.exportKey('jwk', paire.privateKey)
    const jwkPublique = await crypto.subtle.exportKey('jwk', paire.publicKey)
    const cles = await importerClesVapid({ ...jwkPrivee, x: jwkPublique.x, y: jwkPublique.y })

    const jwt = await construireJwtVapid(cles, 'https://web.push.apple.com', 'mailto:a@b.org')
    const [entete, corps, signature] = jwt.split('.')

    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(entete)))).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    })

    const donnees = JSON.parse(new TextDecoder().decode(base64urlDecode(corps)))
    expect(donnees.aud).toBe('https://web.push.apple.com')
    expect(donnees.sub).toBe('mailto:a@b.org')
    // La RFC 8292 plafonne la validité à 24 h ; au-delà le service refuse le jeton.
    expect(donnees.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(24 * 60 * 60)
    expect(donnees.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))

    const valide = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      paire.publicKey,
      base64urlDecode(signature),
      new TextEncoder().encode(`${entete}.${corps}`),
    )
    expect(valide).toBe(true)
  })
})

describe('genererRequetePush', () => {
  it('émet les en-têtes normalisés, et aucun en-tête du brouillon abandonné', async () => {
    const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    const jwkPrivee = await crypto.subtle.exportKey('jwk', paire.privateKey)
    const jwkPublique = await crypto.subtle.exportKey('jwk', paire.publicKey)
    const cles = await importerClesVapid({ ...jwkPrivee, x: jwkPublique.x, y: jwkPublique.y })

    const requete = await genererRequetePush({
      cles,
      abonnement: {
        endpoint: 'https://web.push.apple.com/abc123',
        keys: { p256dh: VECTEUR.uaPublique, auth: VECTEUR.auth },
      },
      charge: JSON.stringify({ titre: 'Bus annulé' }),
      contact: 'mailto:a@b.org',
    })

    expect(requete.headers['Content-Encoding']).toBe('aes128gcm')
    expect(requete.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=B[\w-]+$/)
    expect(requete.headers.TTL).toBe('3600')

    // Les en-têtes du brouillon draft-04 : c'est leur présence qui faisait rejeter
    // chaque envoi par Apple. Ils ne doivent jamais réapparaître.
    expect(requete.headers.Encryption).toBeUndefined()
    expect(requete.headers['Crypto-Key']).toBeUndefined()
    expect(requete.headers.Authorization).not.toMatch(/^WebPush /)
  })
})
