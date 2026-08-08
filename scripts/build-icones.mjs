#!/usr/bin/env node
/**
 * Génère les icônes PNG de la webapp et l'image de partage, à partir d'un SVG.
 *
 *   npm run donnees:icones
 *
 * Les fichiers produits sont commités : la construction en intégration continue ne
 * doit pas dépendre de sharp.
 *
 * Les couleurs suivent la couche `tokens` de `src/index.css`. Elles y sont recopiées
 * à la main, sharp ne sachant pas lire une variable CSS : à réaligner si la palette
 * change — c'est ce qui avait été oublié lors de la refonte visuelle.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const SORTIE = resolve(import.meta.dirname, '../public/icones')
mkdirSync(SORTIE, { recursive: true })

const FOND = '#14161f'
const ACCENT = '#82a9ff'
const CLAIR = '#dfe3f2'
const DOUX = '#9aa3c2'

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

/**
 * Image de partage (Open Graph), 1200 × 630.
 *
 * Elle porte la mention d'indépendance. Un lien partagé dans un groupe de parents
 * s'affiche avec cette vignette et rien d'autre : si elle avait l'air d'une
 * communication de la commune, elle contredirait le premier principe du projet avant
 * même qu'on ait ouvert le site.
 */
const partage = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${FOND}"/>
  <g transform="translate(96 175) scale(0.55)">
    <rect x="116" y="112" width="280" height="248" rx="44" fill="${ACCENT}"/>
    <rect x="152" y="152" width="208" height="104" rx="20" fill="${FOND}"/>
    <circle cx="180" cy="306" r="24" fill="${FOND}"/>
    <circle cx="332" cy="306" r="24" fill="${FOND}"/>
    <rect x="150" y="360" width="52" height="46" rx="16" fill="${CLAIR}"/>
    <rect x="310" y="360" width="52" height="46" rx="16" fill="${CLAIR}"/>
  </g>
  <text x="404" y="284" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="72" font-weight="700" fill="${CLAIR}">Bus scolaire</text>
  <text x="404" y="356" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="52" font-weight="600" fill="${ACCENT}">Beckerich</text>
  <text x="404" y="424" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="30" fill="${DOUX}">Les horaires de vos enfants, arrêt par arrêt.</text>
  <rect x="96" y="500" width="1008" height="2" fill="${DOUX}" opacity="0.35"/>
  <text x="96" y="556" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="26" fill="${DOUX}">Site indépendant, sans lien avec la commune ni avec l'école.</text>
</svg>`

await sharp(Buffer.from(partage)).resize(1200, 630).png().toFile(resolve(SORTIE, 'partage.png'))
console.log('partage.png (1200×630)')
