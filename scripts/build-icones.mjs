#!/usr/bin/env node
/**
 * Génère les icônes PNG de la webapp à partir d'un SVG.
 *
 *   npm run donnees:icones
 *
 * Les fichiers produits sont commités : la construction en intégration continue ne
 * doit pas dépendre de sharp.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const SORTIE = resolve(import.meta.dirname, '../public/icones')
mkdirSync(SORTIE, { recursive: true })

const FOND = '#1a1b26'
const ACCENT = '#7aa2f7'
const CLAIR = '#c0caf5'

/** Un bus stylisé, lisible jusqu'en 48 px. `marge` réserve la zone sûre des icônes maskable. */
const svg = (marge) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${FOND}"/>
  <g transform="translate(256 256) scale(${1 - marge}) translate(-256 -256)">
    <rect x="116" y="112" width="280" height="248" rx="44" fill="${ACCENT}"/>
    <rect x="152" y="152" width="208" height="104" rx="20" fill="${FOND}"/>
    <circle cx="180" cy="306" r="24" fill="${FOND}"/>
    <circle cx="332" cy="306" r="24" fill="${FOND}"/>
    <rect x="150" y="360" width="52" height="46" rx="16" fill="${CLAIR}"/>
    <rect x="310" y="360" width="52" height="46" rx="16" fill="${CLAIR}"/>
  </g>
</svg>`

const cibles = [
  ['icone-192.png', 192, 0],
  ['icone-512.png', 512, 0],
  // Une icône « maskable » est rognée par le système : on rentre le dessin de 20 %.
  ['icone-maskable-512.png', 512, 0.2],
]

for (const [nom, taille, marge] of cibles) {
  await sharp(Buffer.from(svg(marge))).resize(taille, taille).png().toFile(resolve(SORTIE, nom))
  console.log(`${nom} (${taille}px)`)
}

writeFileSync(resolve(import.meta.dirname, '../public/favicon.svg'), svg(0).trim() + '\n')
console.log('favicon.svg')
