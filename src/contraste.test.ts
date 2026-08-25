/**
 * Le contraste de la palette, mesuré et non affirmé.
 *
 * L'ancienne charte posait des voiles translucides sur un dégradé : un couple
 * encre/fond ne s'y vérifiait pas sur deux couleurs mais sur une COMPOSITION, et la
 * vérification tenait dans un commentaire — « mesurées sur les 24 compositions ». Un
 * commentaire ne rattrape personne le jour où l'on éclaircit un fond.
 *
 * Depuis la refonte sur la charte de la vitrine, les surfaces sont opaques. Le calcul
 * redevient direct, donc automatisable : ce fichier lit les jetons dans `index.css` et
 * mesure chaque couple réellement employé, dans les deux thèmes. Le seuil est celui de
 * WCAG AA pour le texte courant, 4.5:1.
 *
 * Ajouter une encre ou une surface à la palette sans l'inscrire ici la laisse sans
 * garde — c'est pourquoi la liste des couples est explicite plutôt que déduite.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

/** Extrait les déclarations `--jeton: valeur` du premier bloc qui suit `selecteur`. */
function jetons(selecteur: string): Record<string, string> {
  const debut = css.indexOf(selecteur)
  expect(debut, `sélecteur introuvable : ${selecteur}`).toBeGreaterThan(-1)
  const ouvrante = css.indexOf('{', debut)
  const fermante = css.indexOf('\n  }', ouvrante)
  const corps = css.slice(ouvrante, fermante)
  const table: Record<string, string> = {}
  for (const [, nom, valeur] of corps.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    table[nom] = valeur.trim()
  }
  return table
}

/** Un `#rrggbb` en ses trois canaux. Les jetons mesurés ici sont tous opaques. */
function canaux(couleur: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(couleur)
  expect(m, `couleur opaque attendue, reçu : ${couleur}`).not.toBeNull()
  const n = parseInt(m![1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Luminance relative, définition WCAG 2.x. */
function luminance(couleur: string): number {
  const [r, v, b] = canaux(couleur).map((c) => {
    const x = c / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * v + 0.0722 * b
}

function contraste(encre: string, fond: string): number {
  const a = luminance(encre)
  const b = luminance(fond)
  const [clair, sombre] = a > b ? [a, b] : [b, a]
  return (clair + 0.05) / (sombre + 0.05)
}

/**
 * Les couples réellement employés dans la feuille. `fonds` liste les surfaces sur
 * lesquelles l'encre peut se poser ; un couple absent d'ici n'est pas gardé.
 */
const COUPLES: ReadonlyArray<{ encre: string; fonds: readonly string[] }> = [
  // Le texte courant se pose sur les cinq surfaces de la charte.
  { encre: '--encre', fonds: ['--fond', '--fond-creux', '--surface', '--surface-haute', '--surface-accent'] },
  { encre: '--encre-douce', fonds: ['--fond', '--fond-creux', '--surface', '--surface-haute', '--surface-accent'] },
  { encre: '--encre-faible', fonds: ['--fond', '--fond-creux', '--surface', '--surface-haute', '--surface-accent'] },
  // L'accent porte les liens et les états retenus.
  { encre: '--accent', fonds: ['--fond', '--fond-creux', '--surface', '--surface-haute', '--surface-accent'] },
  // La ligne de bus, en corail.
  { encre: '--ligne', fonds: ['--fond', '--surface', '--surface-haute'] },
  // Les trois états, sur le fond ordinaire et sur leur propre encart.
  { encre: '--danger', fonds: ['--fond', '--surface', '--surface-haute', '--danger-fond'] },
  { encre: '--attention', fonds: ['--fond', '--fond-creux', '--surface', '--surface-haute', '--surface-accent', '--attention-fond'] },
  { encre: '--succes', fonds: ['--fond', '--surface', '--surface-haute', '--succes-fond'] },
  // Le bouton d'action, et le panneau du prochain départ.
  { encre: '--encre-sur-plein', fonds: ['--plein'] },
  { encre: '--sur-panneau', fonds: ['--panneau'] },
  { encre: '--sur-panneau-douce', fonds: ['--panneau'] },
]

const THEMES = {
  sombre: ":root {\n    /*\n     * Deux familles",
  clair: ":root[data-theme='clair'] {",
} as const

describe('contraste de la palette', () => {
  for (const [nom, selecteur] of Object.entries(THEMES)) {
    describe(`thème ${nom}`, () => {
      const table = jetons(selecteur)
      // Le thème clair ne redéclare pas tout : ce qu'il tait suit le thème sombre.
      const sombre = nom === 'clair' ? jetons(THEMES.sombre) : table
      const lire = (jeton: string) => table[jeton] ?? sombre[jeton]

      for (const { encre, fonds } of COUPLES) {
        for (const fond of fonds) {
          it(`${encre} sur ${fond} tient 4.5:1`, () => {
            const a = lire(encre)
            const b = lire(fond)
            expect(a, `jeton absent : ${encre}`).toBeTruthy()
            expect(b, `jeton absent : ${fond}`).toBeTruthy()
            expect(contraste(a, b)).toBeGreaterThanOrEqual(4.5)
          })
        }
      }
    })
  }

  /*
   * Le thème clair est écrit deux fois — sur le choix explicite et sur la préférence
   * système. C'est la seule duplication acceptée de la couche `tokens`, et elle ne vaut
   * qu'à condition que les deux blocs disent la même chose : une valeur corrigée dans
   * un seul des deux donne une application dont l'apparence dépend de la façon dont on
   * a demandé le thème clair, ce qui est indébogable.
   */
  it('les deux écritures du thème clair sont identiques', () => {
    const choisi = jetons(THEMES.clair)
    const systeme = jetons(":root:not([data-theme='sombre']) {")
    expect(systeme).toEqual(choisi)
  })
})
