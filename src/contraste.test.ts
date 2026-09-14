/**
 * Le contraste de la palette, recalculé et non affirmé.
 *
 * Les surfaces sont des voiles translucides posés sur un dégradé : un couple
 * encre/fond ne se vérifie pas sur deux couleurs mais sur une COMPOSITION — arrêt du
 * dégradé, halo, une ou deux couches de verre. Le lot 18 avait fait ce calcul à la
 * main et l'avait consigné dans un commentaire. Un commentaire ne rattrape personne :
 * `.bouton--danger:hover` est resté quatre semaines à 3,41:1 parce que le jeu de 24
 * compositions du lot 18 n'incluait aucun état de SURVOL (réserve R69).
 *
 * Ce fichier lit les jetons dans `index.css`, recompose chaque couple réellement
 * employé — survol compris — et exige 4,5:1, le seuil WCAG AA du texte courant.
 * Ajouter une encre ou une surface sans l'inscrire ici la laisse sans garde : la
 * liste des couples est donc explicite, et non déduite.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

type Rvba = readonly [number, number, number, number]

/** Les déclarations `--jeton: valeur` du bloc qui suit `selecteur`. */
function jetons(selecteur: string): Record<string, string> {
  const debut = css.indexOf(selecteur)
  if (debut < 0) throw new Error(`sélecteur introuvable : ${selecteur}`)
  const ouvrante = css.indexOf('{', debut)
  const fermante = css.indexOf('\n  }', ouvrante)
  const table: Record<string, string> = {}
  for (const [, nom, valeur] of css.slice(ouvrante, fermante).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    table[nom] = valeur.split('/*')[0].trim()
  }
  return table
}

/**
 * Une déclaration d'une règle CSS, telle qu'elle est écrite.
 *
 * Les couples des boutons se lisent ICI et non dans une liste recopiée : une liste
 * recopiée mesure la palette, pas la feuille. Remettre `color: var(--danger)` sur
 * `.bouton--danger:hover` doit faire tomber le test — c'est le défaut R69 lui-même.
 */
function declaration(selecteur: string, propriete: string): string | null {
  const debut = css.indexOf(`\n  ${selecteur} {`)
  if (debut < 0) throw new Error(`règle introuvable : ${selecteur}`)
  const ouvrante = css.indexOf('{', debut)
  const corps = css.slice(ouvrante, css.indexOf('\n  }', ouvrante))
  const trouve = new RegExp(`(?:^|;|{)\\s*${propriete}:\\s*([^;]+);`, 'm').exec(
    corps.replace(/\/\*[\s\S]*?\*\//g, ''),
  )
  return trouve ? trouve[1].trim() : null
}

const versLineaire = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const versSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const borner = (c: number) => Math.min(1, Math.max(0, c))

function versOklab([r, v, b]: readonly number[]): [number, number, number] {
  const [rl, vl, bl] = [r, v, b].map(versLineaire)
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * vl + 0.0514459929 * bl)
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * vl + 0.1073969566 * bl)
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * vl + 0.6299787005 * bl)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function depuisOklab([L, a, b]: readonly number[]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => versSrgb(borner(c))) as [number, number, number]
}

/** Résout une valeur CSS — `var()`, `#rrggbb`, `rgb(r g b / a)`, `color-mix(in oklab…)`. */
function couleur(valeur: string, table: Record<string, string>): Rvba {
  const v = valeur.trim()

  const variable = /^var\((--[a-z0-9-]+)\)$/.exec(v)
  if (variable) return couleur(table[variable[1]], table)

  const hexa = /^#([0-9a-f]{6})$/i.exec(v)
  if (hexa) {
    const n = parseInt(hexa[1], 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
  }

  if (v === 'transparent') return [0, 0, 0, 0]

  const rvb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/.exec(v)
  if (rvb) {
    return [+rvb[1] / 255, +rvb[2] / 255, +rvb[3] / 255, rvb[4] ? +rvb[4] : 1]
  }

  const melange = /^color-mix\(in oklab,\s*(.+?)\s+([\d.]+)%,\s*(.+?)\s*\)$/.exec(v)
  if (melange) {
    const a = couleur(melange[1], table)
    const part = +melange[2] / 100
    const b = couleur(melange[3], table)
    const alpha = part * a[3] + (1 - part) * b[3]
    if (alpha === 0) return [0, 0, 0, 0]
    // CSS mélange en couleurs prémultipliées, puis dé-prémultiplie.
    const poidsA = (part * a[3]) / alpha
    const labA = versOklab(a)
    const labB = versOklab(b)
    const lab = labA.map((x, i) => poidsA * x + (1 - poidsA) * labB[i])
    return [...depuisOklab(lab), alpha]
  }

  throw new Error(`valeur de couleur non gérée : ${v}`)
}

/** Composition « source-over » : `dessus` posé sur `dessous`. */
function sur(dessus: Rvba, dessous: Rvba): Rvba {
  const alpha = dessus[3] + dessous[3] * (1 - dessus[3])
  if (alpha === 0) return [0, 0, 0, 0]
  const canal = (i: number) =>
    (dessus[i] * dessus[3] + dessous[i] * dessous[3] * (1 - dessus[3])) / alpha
  return [canal(0), canal(1), canal(2), alpha]
}

/** Luminance relative, définition WCAG 2.x. */
function luminance(c: Rvba): number {
  const [r, v, b] = [c[0], c[1], c[2]].map(versLineaire)
  return 0.2126 * r + 0.7152 * v + 0.0722 * b
}

function contraste(encre: Rvba, fond: Rvba): number {
  const [a, b] = [luminance(encre), luminance(fond)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Les arrêts du dégradé de fond : le pire cas n'est pas toujours le même. */
function arretsDuDegrade(table: Record<string, string>): Rvba[] {
  const trouves = table['--degrade'].match(/#[0-9a-f]{6}/gi) ?? []
  expect(trouves.length, 'dégradé sans arrêt de couleur').toBeGreaterThan(0)
  return trouves.map((c) => couleur(c, table))
}

/** Le fond réel : le dégradé, le halo décoratif, puis les voiles empilés. */
function composition(table: Record<string, string>, couches: string[], arret: Rvba): Rvba {
  let fond = sur(couleur(table['--halo'], table), arret)
  for (const couche of couches) fond = sur(couleur(couche, table), fond)
  return fond
}

/**
 * Les couples réellement employés dans la feuille : une encre, et la pile de voiles
 * sur laquelle elle se pose. Un couple absent d'ici n'est gardé par rien.
 */
const CARTE = 'var(--surface)'
const COUPLES: ReadonlyArray<{ encre: string; couches: string[]; ou: string }> = [
  { encre: '--encre', couches: [], ou: 'le fond de page' },
  { encre: '--encre', couches: [CARTE], ou: 'une carte' },
  { encre: '--encre', couches: [CARTE, 'var(--surface-haute)'], ou: 'un bouton survolé' },
  { encre: '--encre', couches: [CARTE, 'var(--fond-creux)'], ou: 'un champ de saisie' },
  { encre: '--encre', couches: [CARTE, 'var(--surface-accent)'], ou: 'un encart d’information' },
  { encre: '--encre', couches: ['var(--rail)'], ou: 'le rail de navigation' },
  { encre: '--encre-douce', couches: [], ou: 'le fond de page' },
  { encre: '--encre-douce', couches: [CARTE], ou: 'une carte' },
  { encre: '--encre-douce', couches: [CARTE, 'var(--surface-haute)'], ou: 'un bouton survolé' },
  { encre: '--encre-douce', couches: [CARTE, 'var(--fond-creux)'], ou: 'un champ de saisie' },
  { encre: '--encre-douce', couches: [CARTE, 'var(--surface-accent)'], ou: 'un encart' },
  { encre: '--encre-douce', couches: ['var(--rail)'], ou: 'le rail de navigation' },
  { encre: '--accent', couches: [CARTE], ou: 'un lien dans une carte' },
  { encre: '--accent', couches: [CARTE, 'var(--surface-haute)'], ou: 'un bouton discret survolé' },
  { encre: '--accent', couches: [CARTE, 'var(--surface-accent)'], ou: 'un encart d’information' },
  { encre: '--attention', couches: [CARTE, 'var(--attention-fond)'], ou: 'un encart d’avertissement' },
  { encre: '--succes', couches: [CARTE, 'var(--succes-fond)'], ou: 'un encart de confirmation' },
]

/**
 * Les états des boutons, lus dans la feuille. `color` se cherche sur la règle d'état
 * puis, à défaut, sur la règle de base : c'est ce que fait la cascade.
 */
function coupleBouton(base: string, etat: string | null, ou: string) {
  const regle = etat ?? base
  const encre = declaration(regle, 'color') ?? declaration(base, 'color')
  const fond = declaration(regle, 'background') ?? declaration(base, 'background')
  if (!encre || !fond) throw new Error(`bouton sans encre ou sans fond : ${regle}`)
  return { encre, couches: [CARTE, fond], ou }
}

const BOUTONS = [
  coupleBouton('.bouton', null, 'un bouton ordinaire'),
  coupleBouton('.bouton', '.bouton:hover', 'un bouton ordinaire survolé'),
  coupleBouton('.bouton--primaire', null, 'le bouton d’action'),
  coupleBouton('.bouton--primaire', '.bouton--primaire:hover', 'le bouton d’action survolé'),
  coupleBouton('.bouton--discret', null, 'un bouton discret'),
  coupleBouton('.bouton--discret', '.bouton--discret:hover', 'un bouton discret survolé'),
  coupleBouton('.bouton--danger', null, 'le bouton « Supprimer »'),
  coupleBouton('.bouton--danger', '.bouton--danger:hover', 'le bouton « Supprimer » survolé'),
]

const THEMES = {
  sombre: '\n  :root {',
  clair: ":root[data-theme='clair'] {",
} as const

describe('contraste de la palette', () => {
  for (const [nom, selecteur] of Object.entries(THEMES)) {
    describe(`thème ${nom}`, () => {
      const table = jetons(selecteur)
      const arrets = arretsDuDegrade(table)

      for (const { encre, couches, ou } of [...COUPLES, ...BOUTONS]) {
        it(`${encre} sur ${ou} tient 4,5:1`, () => {
          const encreResolue = couleur(encre.startsWith('--') ? table[encre] : encre, table)
          const mesures = arrets.map((a) => contraste(encreResolue, composition(table, couches, a)))
          const pire = Math.min(...mesures)
          expect(
            pire,
            `${encre} sur ${ou} : ${mesures.map((m) => m.toFixed(2)).join(' / ')} selon l’arrêt du dégradé`,
          ).toBeGreaterThanOrEqual(4.5)
        })
      }
    })
  }

  it('lit bien les deux palettes, et non deux fois la même', () => {
    expect(jetons(THEMES.sombre)['--fond']).not.toBe(jetons(THEMES.clair)['--fond'])
  })

  it('ne confond pas le galet plein avec la couleur d’accent', () => {
    // Intention écrite dans la feuille : « elle ne prend pas la couleur d'accent —
    // celle-ci sert à lire les heures, et un bouton de la même couleur qu'une heure de
    // départ crée une hésitation ». La palette claire les avait pourtant strictement
    // égales. R70.
    for (const selecteur of Object.values(THEMES)) {
      const table = jetons(selecteur)
      expect(couleur(table['--plein'], table)).not.toEqual(couleur(table['--accent'], table))
    }
  })
})
