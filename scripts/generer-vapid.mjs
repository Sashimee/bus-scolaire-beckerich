#!/usr/bin/env node
/**
 * Génère une paire de clés VAPID pour les notifications push.
 *
 *   node scripts/generer-vapid.mjs
 *
 * Affiche deux valeurs :
 *  — la clé PUBLIQUE, à mettre dans la variable de build VITE_CLE_VAPID ;
 *  — la clé PRIVÉE au format JWK, à mettre dans le secret Cloudflare VAPID_JWK.
 *
 * La clé privée ne doit jamais être commitée ni quitter le Worker.
 */
import { webcrypto } from 'node:crypto'

const { subtle } = webcrypto

const paire = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])

const publiqueBrute = new Uint8Array(await subtle.exportKey('raw', paire.publicKey))
const priveeJwk = await subtle.exportKey('jwk', paire.privateKey)
const publiqueJwk = await subtle.exportKey('jwk', paire.publicKey)

/** Base64url sans remplissage, seul format accepté par l'API Push. */
const base64url = (octets) =>
  Buffer.from(octets).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const clePublique = base64url(publiqueBrute)

// Le Worker a besoin des deux moitiés dans un seul JWK.
const jwkComplet = {
  ...priveeJwk,
  x: publiqueJwk.x,
  y: publiqueJwk.y,
  key_ops: ['sign'],
}

console.log('\n──────────────────────────────────────────────────────────────')
console.log('Clé PUBLIQUE — variable de build VITE_CLE_VAPID')
console.log('──────────────────────────────────────────────────────────────')
console.log(clePublique)
console.log('\n──────────────────────────────────────────────────────────────')
console.log('Clé PRIVÉE (JWK) — secret Cloudflare VAPID_JWK')
console.log('À ne jamais commiter.')
console.log('──────────────────────────────────────────────────────────────')
console.log(JSON.stringify(jwkComplet))
console.log()
