import { describe, expect, it } from 'vitest'
import { alignerServices, destinationTrajet, distanceLisible, sensTrajet } from './affichage'
import { plan } from './donnees'
import type { TypeTrajet } from './types'

const ligne = (id: string) => plan.lignes.find((l) => l.id === id)!

describe('alignement des tableaux du plan officiel', () => {
  it("aligne les courses sur l'arrêt et non sur la position", () => {
    // Sur l'Aller 1, la course de l'après-midi part de Beckerich, celle du matin
    // commence à Huttange. Un alignement par index décalerait toute la colonne du
    // matin d'un cran et l'afficherait vide.
    const { reference, colonnes } = alignerServices(ligne('aller-1'))
    const matin = colonnes.find((c) => c.service.periode === 'matin')!
    const apresMidi = colonnes.find((c) => c.service.periode === 'apres-midi')!

    expect(reference[0].arret).toBe('beckerich-village')
    expect(matin.cases[0]).toBeNull() // pas de course du matin depuis Beckerich
    expect(apresMidi.cases[0]?.heure).toBe('13:25')

    expect(reference[1].arret).toBe('huttange')
    expect(matin.cases[1]?.heure).toBe('07:25')
    expect(apresMidi.cases[1]?.heure).toBe('13:27')
  })

  it('remplit toute la colonne du matin de l’Aller 1', () => {
    const { colonnes } = alignerServices(ligne('aller-1'))
    const matin = colonnes.find((c) => c.service.periode === 'matin')!
    const remplies = matin.cases.filter((c) => c?.heure).length
    // Les 14 arrêts du matin doivent tous porter une heure ; seule la première
    // ligne, propre à l'après-midi, reste vide.
    expect(remplies).toBe(14)
  })

  it('garde chaque arrêt sur sa propre ligne quand les courses sont identiques', () => {
    const { reference, colonnes } = alignerServices(ligne('retour-1'))
    for (const { cases } of colonnes) {
      expect(cases.filter(Boolean)).toHaveLength(reference.length)
      cases.forEach((c, i) => expect(c?.arret).toBe(reference[i].arret))
    }
  })

  it('gère une ligne qui dessert deux fois le même arrêt', () => {
    // L'Aller 3 passe deux fois par le Dillendapp et par Huttange.
    const { reference, colonnes } = alignerServices(ligne('aller-3'))
    expect(reference.filter((a) => a.arret === 'beckerich-dillendapp')).toHaveLength(2)
    const heures = colonnes[0].cases.map((c) => c?.heure)
    expect(heures).toEqual(['07:30', '07:32', '07:34', '07:38', '07:45', '07:52', '07:55', '07:58'])
  })
})

describe('sens et destination d’un trajet', () => {
  // Liste exhaustive : un type de trajet ajouté sans être classé ici fera échouer ce
  // test plutôt que de s'afficher au hasard.
  const attendu: Record<TypeTrajet, ['aller' | 'retour', 'ecole' | 'maison' | 'dillendapp']> = {
    'aller-matin': ['aller', 'ecole'],
    'aller-apres-midi': ['aller', 'ecole'],
    'navette-dillendapp-matin': ['aller', 'ecole'],
    'navette-dillendapp-retour': ['aller', 'ecole'],
    'retour-midi': ['retour', 'maison'],
    'retour-soir': ['retour', 'maison'],
    'retour-soir-dillendapp': ['retour', 'dillendapp'],
    'navette-dillendapp-midi': ['retour', 'dillendapp'],
  }

  for (const [type, [sens, destination]] of Object.entries(attendu) as [
    TypeTrajet,
    ['aller' | 'retour', 'ecole' | 'maison' | 'dillendapp'],
  ][]) {
    it(`classe ${type}`, () => {
      expect(sensTrajet(type)).toBe(sens)
      expect(destinationTrajet(type)).toBe(destination)
    })
  }

  it('couvre tous les types de trajet du domaine', () => {
    // Le nombre est écrit en clair : ajouter un type sans le classer casse le test.
    expect(Object.keys(attendu)).toHaveLength(8)
  })
})

describe('distances lisibles', () => {
  it('arrondit les mètres à la dizaine', () => {
    expect(distanceLisible(643)).toBe('640 m')
  })

  it('passe en kilomètres au-delà du kilomètre', () => {
    expect(distanceLisible(1240)).toBe('1,2 km')
  })
})
