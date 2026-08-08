import { describe, expect, it } from 'vitest'
import { decoderFoyer, encoderFoyer, foyerDepuisUrl, lienPartage } from './partage'
import { JOURS } from './types'
import type { Enfant, Foyer, Jour, RepasMidi, UsageBus } from './types'

const grille = <T,>(valeur: T) =>
  Object.fromEntries(JOURS.map((j) => [j, valeur])) as Record<Jour, T>

const enfantComplet: Enfant = {
  id: 'a1',
  prenom: 'Léa',
  cycle: 'c2',
  repas: { ...grille<RepasMidi>('maison'), lundi: 'dillendapp', jeudi: 'dillendapp' },
  bus: { ...grille<UsageBus>('aller-retour'), mercredi: 'aller' },
  periscolaireMidi: true,
  periscolaireHorsMidi: true,
  dillendappDepuis: { ...grille<string | null>(null), lundi: '07:00' },
  dillendappJusqua: { ...grille<string | null>(null), lundi: '16:30' },
  adresses: {
    mardi: {
      soir: { libelle: 'Chez les grands-parents', localite: 'Hovelange', coord: [49.7228, 5.9049] },
    },
    mercredi: {
      midi: { libelle: 'Chez la tante', localite: 'Elvange', coord: [49.7243, 5.9174] },
    },
    jeudi: {
      matin: { libelle: 'Chez la nounou', localite: 'Schweich', coord: [49.7209, 5.9214] },
    },
  },
}

const foyerComplet: Foyer = {
  adresse: { libelle: 'Huelewee 12', localite: 'Noerdange', coord: [49.7415, 5.9215] },
  enfants: [enfantComplet],
}

describe('encodage du foyer en version 5', () => {
  it('retrouve le foyer à l’identique après un aller-retour', () => {
    const relu = decoderFoyer(encoderFoyer(foyerComplet))!
    expect(relu.adresse).toEqual(foyerComplet.adresse)
    expect(relu.enfants).toHaveLength(1)

    const e = relu.enfants[0]
    expect(e.prenom).toBe('Léa')
    expect(e.cycle).toBe('c2')
    expect(e.repas).toEqual(enfantComplet.repas)
    expect(e.bus).toEqual(enfantComplet.bus)
    expect(e.periscolaireMidi).toBe(true)
    expect(e.periscolaireHorsMidi).toBe(true)
    expect(e.dillendappDepuis).toEqual(enfantComplet.dillendappDepuis)
    expect(e.dillendappJusqua).toEqual(enfantComplet.dillendappJusqua)
  })

  it('distingue les deux inscriptions au lieu de n’en porter qu’une', () => {
    const horsMidiSeul: Foyer = {
      ...foyerComplet,
      enfants: [{ ...enfantComplet, periscolaireMidi: false, periscolaireHorsMidi: true }],
    }
    const e = decoderFoyer(encoderFoyer(horsMidiSeul))!.enfants[0]
    expect(e.periscolaireMidi).toBe(false)
    expect(e.periscolaireHorsMidi).toBe(true)
  })

  it('conserve les adresses dérogatoires, jour par jour et sens par sens', () => {
    const e = decoderFoyer(encoderFoyer(foyerComplet))!.enfants[0]
    expect(e.adresses?.mardi?.soir?.libelle).toBe('Chez les grands-parents')
    expect(e.adresses?.mardi?.soir?.coord).toEqual([49.7228, 5.9049])
    expect(e.adresses?.mardi?.matin).toBeUndefined()
    expect(e.adresses?.jeudi?.matin?.localite).toBe('Schweich')
    expect(e.adresses?.jeudi?.soir).toBeUndefined()
    // L'adresse du déjeuner est un sens à part entière, pas un repli sur celle du soir.
    expect(e.adresses?.mercredi?.midi?.libelle).toBe('Chez la tante')
    expect(e.adresses?.mercredi?.soir).toBeUndefined()
    // Un jour sans dérogation ne doit rien porter du tout.
    expect(e.adresses?.lundi).toBeUndefined()
  })

  it("n'alourdit pas le lien d'une famille sans dérogation", () => {
    // Le cas courant. La liste d'adresses doit s'effacer, pas s'encoder en cinq nuls.
    const sansDerogation: Foyer = {
      ...foyerComplet,
      enfants: [{ ...enfantComplet, adresses: {} }],
    }
    const avec = encoderFoyer(foyerComplet).length
    const sans = encoderFoyer(sansDerogation).length
    expect(sans).toBeLessThan(avec)
    expect(decoderFoyer(encoderFoyer(sansDerogation))!.enfants[0].adresses).toEqual({})
  })

  it('arrondit les coordonnées à cinq décimales', () => {
    const precis: Foyer = {
      adresse: { libelle: 'Test', localite: 'Test', coord: [49.741234567, 5.921987654] },
      enfants: [],
    }
    expect(decoderFoyer(encoderFoyer(precis))!.adresse!.coord).toEqual([49.74123, 5.92199])
  })
})

describe('lecture des liens de versions antérieures', () => {
  /** Reproduit l'encodage d'une version donnée, tel qu'il était à l'époque. */
  const encoderAncien = (compact: unknown) =>
    btoa(
      String.fromCharCode(...new TextEncoder().encode(JSON.stringify(compact))),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  it('lit un lien de version 1, qui ne connaît que le repas de midi', () => {
    const v1 = encoderAncien([
      1,
      'Huelewee 12',
      'Noerdange',
      49.7415,
      5.9215,
      [['Léa', 2, 'dmdmm']],
    ])
    const relu = decoderFoyer(v1)!
    expect(relu.adresse!.libelle).toBe('Huelewee 12')

    const e = relu.enfants[0]
    expect(e.cycle).toBe('c2')
    expect(e.repas.lundi).toBe('dillendapp')
    expect(e.repas.mardi).toBe('maison')
    // Les réglages inconnus de la version 1 prennent leur valeur par défaut.
    expect(e.bus).toEqual(grille<UsageBus>('aller-retour'))
    expect(e.dillendappDepuis).toEqual(grille<string | null>(null))
    expect(e.dillendappJusqua).toEqual(grille<string | null>(null))
    expect(e.adresses).toEqual({})
    // L'inscription périscolaire n'existait pas : elle se déduit des repas, sans quoi
    // la grille de midi du lien disparaîtrait à la lecture. Faute d'heure saisie, rien
    // ne dit en revanche que l'enfant est au Dillendapp en dehors du midi.
    expect(e.periscolaireMidi).toBe(true)
    expect(e.periscolaireHorsMidi).toBe(false)
  })

  it("ne déduit pas d'inscription périscolaire pour un enfant qui rentre manger", () => {
    const v1 = encoderAncien([1, 'Test', 'Test', 49.74, 5.92, [['Tom', 1, 'mmmmm']]])
    const e = decoderFoyer(v1)!.enfants[0]
    expect(e.periscolaireMidi).toBe(false)
    expect(e.periscolaireHorsMidi).toBe(false)
  })

  it('lit un lien de version 3, sans présence du matin ni adresses par jour', () => {
    const v3 = encoderAncien([
      3,
      'Test',
      'Test',
      49.74,
      5.92,
      [['Tom', 3, 'ddddd', 'brbnb', ['16:30', null, null, null, null]]],
    ])
    const e = decoderFoyer(v3)!.enfants[0]
    expect(e.bus).toEqual({
      lundi: 'aller-retour',
      mardi: 'retour',
      mercredi: 'aller-retour',
      jeudi: 'aucun',
      vendredi: 'aller-retour',
    })
    expect(e.dillendappJusqua!.lundi).toBe('16:30')
    expect(e.dillendappDepuis).toEqual(grille<string | null>(null))
    expect(e.adresses).toEqual({})
  })

  it('lit les adresses d’un lien de version 4 comme des paires matin/soir', () => {
    // La version 4 encodait `[matin, soir]`. Lire son second élément comme un midi
    // ramènerait l'enfant chez la nounou à l'heure du déjeuner au lieu du soir.
    const v4 = encoderAncien([
      4,
      'Test',
      'Test',
      49.74,
      5.92,
      [
        [
          'Tom',
          2,
          'mmmmm',
          'bbbbb',
          [null, null, null, null, null],
          0,
          [null, null, null, null, null],
          [null, [null, ['Chez la nounou', 'Schweich', 49.7209, 5.9214]], null, null, null],
        ],
      ],
    ])
    const e = decoderFoyer(v4)!.enfants[0]
    expect(e.adresses?.mardi?.soir?.libelle).toBe('Chez la nounou')
    expect(e.adresses?.mardi?.midi).toBeUndefined()
  })

  it('refuse un lien annonçant une version plus récente que celle qu’il sait lire', () => {
    expect(decoderFoyer(encoderAncien([99, 'Test', 'Test', 49.74, 5.92, []]))).toBeNull()
  })

  it('refuse un lien illisible plutôt que d’importer à moitié', () => {
    expect(decoderFoyer('pas-du-base64-valide!!')).toBeNull()
    expect(decoderFoyer(encoderAncien({ pas: 'un tableau' }))).toBeNull()
    // Coordonnées absentes : le foyer serait placé au large de l'Afrique.
    expect(decoderFoyer(encoderAncien([4, 'Test', 'Test', 'nord', 'est', []]))).toBeNull()
  })
})

describe('lien et fragment', () => {
  it('place la configuration dans le fragment, jamais dans la requête', () => {
    const lien = lienPartage(foyerComplet, 'https://exemple.lu/bus/')
    const url = new URL(lien)
    expect(url.search).toBe('')
    expect(url.hash.startsWith('#partage=')).toBe(true)
  })

  it('relit un foyer depuis le fragment', () => {
    const lien = lienPartage(foyerComplet, 'https://exemple.lu/bus/')
    const relu = foyerDepuisUrl(new URL(lien).hash)!
    expect(relu.enfants[0].prenom).toBe('Léa')
  })

  it('ignore un fragment sans configuration', () => {
    expect(foyerDepuisUrl('#autre-chose')).toBeNull()
    expect(foyerDepuisUrl('')).toBeNull()
  })
})

describe('liens trafiqués', () => {
  const encoder = (compact: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(compact))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  it('refuse un foyer dont les coordonnées sortent du pays', () => {
    // 0,0 est au large de l'Afrique : l'arrêt « le plus proche » serait tiré au hasard.
    expect(decoderFoyer(encoder([4, 'Test', 'Test', 0, 0, []]))).toBeNull()
    expect(decoderFoyer(encoder([4, 'Test', 'Test', 48.85, 2.35, []]))).toBeNull()
  })

  it('refuse un foyer dont une coordonnée vaut NaN', () => {
    // `JSON.stringify(NaN)` donne `null` : c'est exactement la valeur qui passait.
    expect(decoderFoyer(encoder([4, 'Test', 'Test', null, 5.9, []]))).toBeNull()
  })

  it('refuse un lien qui prétend porter des milliers d’enfants', () => {
    const enfants = Array.from({ length: 200 }, (_, i) => [`E${i}`, 1, 'mmmmm'])
    expect(decoderFoyer(encoder([4, 'Test', 'Test', 49.74, 5.92, enfants]))).toBeNull()
  })

  it('tronque un prénom démesuré au lieu de l’importer tel quel', () => {
    const relu = decoderFoyer(
      encoder([4, 'Test', 'Test', 49.74, 5.92, [['x'.repeat(5000), 1, 'mmmmm']]]),
    )!
    expect(relu.enfants[0].prenom).toHaveLength(40)
  })

  it('retire les marques bidirectionnelles d’un prénom', () => {
    const relu = decoderFoyer(
      encoder([4, 'Test', 'Test', 49.74, 5.92, [['L‮éa', 1, 'mmmmm']]]),
    )!
    expect(relu.enfants[0].prenom).toBe('Léa')
  })

  it('ignore une adresse dérogatoire hors du pays sans perdre le reste', () => {
    const adresses = [null, [null, ['Ailleurs', 'Loin', 0, 0]], null, null, null]
    const relu = decoderFoyer(
      encoder([4, 'Test', 'Test', 49.74, 5.92, [['Léa', 2, 'mmmmm', 'bbbbb', [], 0, [], adresses]]]),
    )!
    expect(relu.enfants[0].prenom).toBe('Léa')
    expect(relu.enfants[0].adresses?.mardi).toBeUndefined()
  })

  it('remplace une heure de présence invalide par une absence', () => {
    const relu = decoderFoyer(
      encoder([
        4,
        'Test',
        'Test',
        49.74,
        5.92,
        [['Léa', 2, 'ddddd', 'bbbbb', ['pas une heure', '25:99', null, null, null]]],
      ]),
    )!
    expect(relu.enfants[0].dillendappJusqua!.lundi).toBeNull()
    expect(relu.enfants[0].dillendappJusqua!.mardi).toBeNull()
  })
})
