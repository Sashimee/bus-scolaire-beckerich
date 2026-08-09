import { describe, expect, it } from 'vitest'
import { enfantCalqueSur, enfantVierge } from './stockage'
import type { Enfant, Jour, RepasMidi } from './types'
import { JOURS } from './types'

const grille = <T,>(v: T) => Object.fromEntries(JOURS.map((j) => [j, v])) as Record<Jour, T>

/** Un aîné entièrement réglé : c'est lui qu'on veut ne pas retaper. */
const aine: Enfant = {
  id: 'a',
  prenom: 'Léa',
  cycle: 'c2',
  repas: { ...grille<RepasMidi>('dillendapp'), mercredi: 'maison' },
  bus: { ...grille('aller-retour' as const), vendredi: 'aucun' as const },
  periscolaireMidi: true,
  periscolaireHorsMidi: true,
  dillendappDepuis: { ...grille<string | null>(null), lundi: '07:20' },
  dillendappJusqua: { ...grille<string | null>(null), lundi: '17:00' },
  adresses: {
    mardi: { soir: { libelle: 'Chez la nounou', localite: 'Schweich', coord: [49.72, 5.92] } },
  },
}

describe('nouvel enfant calqué sur un aîné', () => {
  const cadet = enfantCalqueSur(aine, 'b', '  Tom ', 'c4')

  it('prend son propre prénom et son propre cycle', () => {
    expect(cadet.id).toBe('b')
    expect(cadet.prenom).toBe('Tom')
    expect(cadet.cycle).toBe('c4')
  })

  it('reprend le rythme de la semaine', () => {
    expect(cadet.repas).toEqual(aine.repas)
    expect(cadet.bus).toEqual(aine.bus)
    expect(cadet.periscolaireMidi).toBe(true)
    expect(cadet.periscolaireHorsMidi).toBe(true)
    expect(cadet.dillendappDepuis).toEqual(aine.dillendappDepuis)
    expect(cadet.dillendappJusqua).toEqual(aine.dillendappJusqua)
  })

  it('reprend les adresses particulières, sans les partager en mémoire', () => {
    // Un mardi chez la nounou vaut rarement pour un seul des enfants. Mais modifier
    // celle du cadet ne doit pas déplacer celle de l'aîné.
    expect(cadet.adresses?.mardi?.soir?.libelle).toBe('Chez la nounou')
    cadet.adresses!.mardi!.soir!.libelle = 'Ailleurs'
    expect(aine.adresses?.mardi?.soir?.libelle).toBe('Chez la nounou')
  })

  it('déduit les inscriptions d’un aîné qui n’en portait pas', () => {
    // Une configuration enregistrée avant la séparation des deux cases ne doit pas
    // transmettre au cadet une grille de midi qui s'évapore.
    const ancien = { ...aine, periscolaireMidi: undefined, periscolaireHorsMidi: undefined }
    const copie = enfantCalqueSur(ancien, 'c', 'Anna', 'c1')
    expect(copie.periscolaireMidi).toBe(true)
    expect(copie.periscolaireHorsMidi).toBe(true)
  })
})

describe('nouvel enfant sans modèle', () => {
  const seul = enfantVierge('a', ' Léa ', 'c2')

  it('part d’une page blanche', () => {
    expect(seul.prenom).toBe('Léa')
    expect(seul.repas).toEqual(grille('maison'))
    expect(seul.bus).toEqual(grille('aller-retour'))
    expect(seul.periscolaireMidi).toBe(false)
    expect(seul.periscolaireHorsMidi).toBe(false)
    expect(seul.dillendappDepuis).toEqual(grille(null))
    expect(seul.adresses).toEqual({})
  })
})
