/**
 * La traduction entre ce qu'un parent raconte et ce que le stockage porte.
 *
 * C'est le point où une erreur ne se verrait pas : l'écran afficherait fidèlement une
 * réponse, et le moteur en calculerait une autre. Chaque situation est donc éprouvée
 * deux fois — telle que `moments.ts` la relit, et telle que `plan.ts` la calcule.
 */
import { describe, expect, it } from 'vitest'
import {
  adresseProposable,
  avecHeureSoir,
  avecMatin,
  avecMidi,
  avecSoir,
  heureMatin,
  heureSoir,
  matinDuJour,
  midiDuJour,
  optionsMatin,
  semaineReglee,
  soirDuJour,
  CHOIX_MATIN,
  CHOIX_MIDI,
  CHOIX_SOIR,
  JOURS_MIDI,
} from './moments'
import { contexteEnfant, coursApresMidi, trajetsDuJour } from './plan'
import { enfantVierge } from './stockage'
import type { Adresse, Enfant, Jour } from './types'
import { JOURS } from './types'

const HOVELANGE: Adresse = { libelle: 'Hovelange 1', localite: 'Hovelange', coord: [49.7228, 5.9049] }
const NOUNOU: Adresse = { libelle: 'Chez la nounou', localite: 'Schweich', coord: [49.7209, 5.9214] }

const neuf = (): Enfant => enfantVierge('a', 'Léa', 'c2')
const ctxDe = (e: Enfant) => contexteEnfant(e, HOVELANGE)

/** Un jour avec cours l'après-midi, et un jour sans : les deux se comportent autrement. */
const AVEC_APRES_MIDI: Jour = 'lundi'
const SANS_APRES_MIDI: Jour = 'mardi'

describe('lecture des trois moments', () => {
  it('lit un enfant neuf comme une semaine entièrement en bus', () => {
    const e = neuf()
    for (const jour of JOURS) {
      expect(matinDuJour(e, jour)).toBe('bus')
      expect(midiDuJour(e, jour)).toBe('maison')
      expect(soirDuJour(e, jour)).toBe('bus')
    }
  })

  it('ne pose la question du midi que les jours avec cours l’après-midi', () => {
    expect([...JOURS_MIDI]).toEqual(JOURS.filter(coursApresMidi))
    expect(semaineReglee(neuf()).find((j) => j.jour === SANS_APRES_MIDI)!.midi).toBeNull()
  })
})

describe('écriture : tout ce qu’une réponse implique', () => {
  it('relit toujours la réponse qui vient d’être écrite', () => {
    // L'invariant qui compte : une réponse affichée est une réponse enregistrée. Sans
    // lui, l'écran montrerait « en bus » sur une journée que le moteur calcule autrement.
    const ctx = ctxDe(neuf())
    for (const matin of CHOIX_MATIN) {
      for (const midi of CHOIX_MIDI) {
        for (const soir of CHOIX_SOIR) {
          let e = avecMatin(neuf(), JOURS, matin, ctx)
          e = avecMidi(e, JOURS_MIDI, midi)
          e = avecSoir(e, JOURS, soir, ctx)
          for (const jour of JOURS) {
            expect(soirDuJour(e, jour), `${matin}/${midi}/${soir} — ${jour}`).toBe(soir)
            expect(matinDuJour(e, jour), `${matin}/${midi}/${soir} — ${jour}`).toBe(matin)
            if (coursApresMidi(jour)) {
              // Le soir à la maison relais impose le repas sur place les jours SANS
              // cours l'après-midi seulement ; ailleurs, le midi reste libre.
              expect(midiDuJour(e, jour), `${matin}/${midi}/${soir} — ${jour}`).toBe(midi)
            }
          }
        }
      }
    }
  })

  it('retire l’aller en bus quand le parent emmène l’enfant lui-même', () => {
    const e = avecMatin(neuf(), [AVEC_APRES_MIDI], 'voiture', null)
    expect(e.bus![AVEC_APRES_MIDI]).toBe('retour')
    expect(trajetsDuJour(ctxDe(e)!, AVEC_APRES_MIDI).trajets.some((t) => t.type === 'aller-matin')).toBe(
      false,
    )
  })

  it('pose l’heure de dépose et efface l’adresse de départ devenue contradictoire', () => {
    // Déposé à la maison relais, l'enfant ne part de nulle part ailleurs ce matin-là.
    let e = neuf()
    e = { ...e, adresses: { [AVEC_APRES_MIDI]: { matin: NOUNOU } } }
    e = avecMatin(e, [AVEC_APRES_MIDI], 'relais', ctxDe(e))

    expect(heureMatin(e, AVEC_APRES_MIDI)).toBe('07:00')
    expect(e.periscolaireHorsMidi).toBe(true)
    expect(e.adresses?.[AVEC_APRES_MIDI]?.matin ?? null).toBeNull()
    expect(trajetsDuJour(ctxDe(e)!, AVEC_APRES_MIDI).depose?.heure).toBe('07:00')
  })

  it('rend l’aller en bus quand le parent change d’avis', () => {
    let e = avecMatin(neuf(), JOURS, 'relais', null)
    e = avecMatin(e, JOURS, 'bus', null)
    expect(heureMatin(e, AVEC_APRES_MIDI)).toBeNull()
    expect(e.bus![AVEC_APRES_MIDI]).toBe('aller-retour')
    expect(e.periscolaireHorsMidi).toBe(false)
  })

  it('garde le bus du soir quand l’enfant reste à la maison relais', () => {
    // Le bus le conduit de l'école à la maison relais : c'est bien un retour en bus,
    // même s'il ne le ramène pas chez lui. Sans cela, aucun trajet du soir ne sortait.
    const e = avecSoir(neuf(), [AVEC_APRES_MIDI], 'relais', ctxDe(neuf()))
    const journee = trajetsDuJour(ctxDe(e)!, AVEC_APRES_MIDI)
    expect(journee.trajets.some((t) => t.type === 'retour-soir-dillendapp')).toBe(true)
    expect(journee.recuperation).toBeDefined()
    expect(journee.manquants).toEqual([])
  })

  it('force le repas sur place un jour sans cours l’après-midi, et le relâche au retour', () => {
    // La classe s'arrête à 11:45 : y rester suppose d'y avoir déjeuné.
    let e = avecSoir(neuf(), [SANS_APRES_MIDI], 'relais', ctxDe(neuf()))
    expect(e.repas[SANS_APRES_MIDI]).toBe('dillendapp')
    expect(e.periscolaireMidi).toBe(true)

    e = avecSoir(e, [SANS_APRES_MIDI], 'bus', null)
    expect(e.repas[SANS_APRES_MIDI]).toBe('maison')
    expect(heureSoir(e, SANS_APRES_MIDI)).toBeNull()
  })

  it('ne touche pas au repas des jours sans cours l’après-midi depuis la question du midi', () => {
    let e = avecSoir(neuf(), [SANS_APRES_MIDI], 'relais', ctxDe(neuf()))
    e = avecMidi(e, JOURS, 'maison')
    // La question du midi ne couvre pas ces jours-là : les régler ici contredirait la
    // présence déclarée à la question suivante.
    expect(e.repas[SANS_APRES_MIDI]).toBe('dillendapp')
    expect(soirDuJour(e, SANS_APRES_MIDI)).toBe('relais')
  })

  it('déduit les deux inscriptions au lieu de les faire cocher', () => {
    const e = avecMidi(neuf(), JOURS_MIDI, 'relais')
    expect(e.periscolaireMidi).toBe(true)
    expect(e.periscolaireHorsMidi).toBe(false)
    expect(JOURS_MIDI.every((j) => e.repas[j] === 'dillendapp')).toBe(true)
  })

  it('déplace une heure sans changer la réponse', () => {
    let e = avecSoir(neuf(), JOURS, 'relais', ctxDe(neuf()))
    e = avecHeureSoir(e, JOURS, '17:30')
    expect(JOURS.every((j) => heureSoir(e, j) === '17:30')).toBe(true)
    expect(JOURS.every((j) => soirDuJour(e, j) === 'relais')).toBe(true)
  })
})

describe('adresses dérogatoires', () => {
  it('ne les propose qu’aux moments que la maison relais ne prend pas déjà', () => {
    const e = avecMatin(neuf(), [AVEC_APRES_MIDI], 'relais', null)
    expect(adresseProposable(e, AVEC_APRES_MIDI, 'matin')).toBe(false)
    expect(adresseProposable(e, AVEC_APRES_MIDI, 'soir')).toBe(true)

    const midiSurPlace = avecMidi(neuf(), [AVEC_APRES_MIDI], 'relais')
    expect(adresseProposable(midiSurPlace, AVEC_APRES_MIDI, 'midi')).toBe(false)
    // Le déjeuner ailleurs n'a pas d'objet un jour où la classe s'arrête à midi.
    expect(adresseProposable(neuf(), SANS_APRES_MIDI, 'midi')).toBe(false)
  })
})

describe('bornes du plan', () => {
  it('n’offre la maison relais du matin que si une navette conduit encore en classe', () => {
    const ctx = ctxDe(neuf())
    for (const jour of JOURS) {
      const attendu = optionsMatin(ctx, jour).includes('relais')
      const e = avecMatin(neuf(), [jour], 'relais', ctx)
      // Quand l'option est offerte, l'heure retenue tient dans les bornes du cycle.
      if (attendu) expect(heureMatin(e, jour)).not.toBeNull()
    }
  })
})
