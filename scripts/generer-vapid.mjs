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
 * Avec --json, sort une seule ligne { "publique": "…", "jwk": {…} } et rien
 * d'autre. C'est ce que consomme installer.sh : extraire les clés en découpant
 * l'affichage décoré ci-dessous s'était révélé fragile — un séparateur avait été
 * pris pour la clé publique, et la variable GitHub s'en était retrouvée remplie
 * de tirets sans que rien ne le signale.
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

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ publique: clePublique, jwk: jwkComplet }))
  process.exit(0)
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
