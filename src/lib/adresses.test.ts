/**
 * Le jeu d'adresses embarqué.
 *
 * Il est engendré par `scripts/build-adresses.mjs` depuis le registre national, et ne
 * se relit pas à l'œil : 1159 lignes. Ce fichier garde ce qui doit rester vrai après
 * chaque régénération.
 */
import { describe, expect, it } from 'vitest'
import brut from '../data/adresses-beckerich.json'
import { chercherAdresses, localites } from './adresses'

const jeu = brut as unknown as {
  rues: string[]
  localites: string[]
  adresses: [number, string, number, string, number, number][]
}

describe('jeu d’adresses de la commune', () => {
  it('ne propose jamais deux fois la même adresse', () => {
    // R70 : le registre national livrait trois adresses en double, à quelques mètres
    // près. Le parent les voyait toutes deux dans la liste, sans rien pour choisir.
    const vues = new Map<string, number>()
    for (const [rue, numero, localite] of jeu.adresses) {
      const cle = `${jeu.rues[rue]} ${numero}, ${jeu.localites[localite]}`
      vues.set(cle, (vues.get(cle) ?? 0) + 1)
    }
    const doublons = [...vues.entries()].filter(([, n]) => n > 1).map(([cle]) => cle)
    expect(doublons, 'adresses en double dans le jeu embarqué').toEqual([])
  })

  it('ne référence que des rues et des localités existantes', () => {
    for (const [rue, , localite] of jeu.adresses) {
      expect(jeu.rues[rue]).toBeTypeOf('string')
      expect(jeu.localites[localite]).toBeTypeOf('string')
    }
  })

  it('couvre les huit localités de la commune', () => {
    expect(localites).toHaveLength(8)
    expect(localites).toContain('Beckerich')
    expect(localites).toContain('Hovelange')
  })

  it('reste cohérent en coordonnées : tout Beckerich tient dans un carré de 10 km', () => {
    for (const [, , , , lat, lon] of jeu.adresses) {
      expect(lat).toBeGreaterThan(49.68)
      expect(lat).toBeLessThan(49.78)
      expect(lon).toBeGreaterThan(5.8)
      expect(lon).toBeLessThan(5.98)
    }
  })

  it('rend une seule fois une adresse cherchée par son libellé exact', () => {
    const trouvees = chercherAdresses('1, Kächereck')
    const libelles = trouvees.map((a) => `${a.libelle}|${a.localite}`)
    expect(new Set(libelles).size).toBe(libelles.length)
  })
})
