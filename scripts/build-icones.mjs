#!/usr/bin/env node
/**
 * Génère les icônes PNG de la webapp et l'image de partage, à partir d'un SVG.
 *
 *   npm run donnees:icones
 *
 * Les fichiers produits sont commités : la construction en intégration continue ne
 * doit pas dépendre de sharp.
 *
 * Les couleurs suivent la couche `tokens` de `src/index.css`, qui tient désormais la
 * charte de la vitrine `schoulbus.lu`. Elles sont recopiées à la main, sharp ne sachant
 * pas lire une variable CSS : à réaligner si la palette change — c'est ce qui avait été
 * oublié lors de la refonte visuelle.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const SORTIE = resolve(import.meta.dirname, '../public/icones')
mkdirSync(SORTIE, { recursive: true })

/*
 * L'icône : pastille sarcelle, carrosserie crème — le dessin de la vitrine, et pour sa
 * raison. Une icône est vue à 16 px sur l'onglet d'un navigateur au fond presque
 * toujours clair, où une pastille crème n'est qu'un carré blanc.
 */
const PASTILLE = '#0f5a61'
const CARROSSERIE = '#fbf6ef'

/* La vignette de partage, elle, est une page : du crème, comme la vitrine. */
const PAPIER = '#fbf6ef'
const SARCELLE = '#0f5a61'
const SARCELLE_FONCEE = '#0b3f45'
const ENCRE = '#1c2725'
const ENCRE_DOUCE = '#4a5654'

/** Un bus stylisé, lisible jusqu'en 48 px. `marge` réserve la zone sûre des icônes maskable. */
const svg = (marge) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${PASTILLE}"/>
  <g transform="translate(256 256) scale(${1 - marge}) translate(-256 -256)">
    <rect x="116" y="112" width="280" height="248" rx="44" fill="${CARROSSERIE}"/>
    <rect x="152" y="152" width="208" height="104" rx="20" fill="${PASTILLE}"/>
    <circle cx="180" cy="306" r="24" fill="${PASTILLE}"/>
    <circle cx="332" cy="306" r="24" fill="${PASTILLE}"/>
    <rect x="150" y="360" width="52" height="46" rx="16" fill="${CARROSSERIE}"/>
    <rect x="310" y="360" width="52" height="46" rx="16" fill="${CARROSSERIE}"/>
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
  <rect width="1200" height="630" fill="${PAPIER}"/>
  <g transform="translate(96 175) scale(0.55)">
    <rect x="116" y="112" width="280" height="248" rx="44" fill="${SARCELLE}"/>
    <rect x="152" y="152" width="208" height="104" rx="20" fill="${PAPIER}"/>
    <circle cx="180" cy="306" r="24" fill="${PAPIER}"/>
    <circle cx="332" cy="306" r="24" fill="${PAPIER}"/>
    <rect x="150" y="360" width="52" height="46" rx="16" fill="${SARCELLE_FONCEE}"/>
    <rect x="310" y="360" width="52" height="46" rx="16" fill="${SARCELLE_FONCEE}"/>
  </g>
  <text x="404" y="284" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="72" font-weight="700" fill="${ENCRE}">Bus scolaire</text>
  <text x="404" y="356" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="52" font-weight="600" fill="${SARCELLE}">Beckerich</text>
  <text x="404" y="424" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="30" fill="${ENCRE_DOUCE}">Les horaires de vos enfants, arrêt par arrêt.</text>
  <rect x="96" y="500" width="1008" height="2" fill="${ENCRE_DOUCE}" opacity="0.35"/>
  <text x="96" y="556" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="26" fill="${ENCRE_DOUCE}">Site indépendant, sans lien avec la commune ni avec l'école.</text>
</svg>`

await sharp(Buffer.from(partage)).resize(1200, 630).png().toFile(resolve(SORTIE, 'partage.png'))
console.log('partage.png (1200×630)')
