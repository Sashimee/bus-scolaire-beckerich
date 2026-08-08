import { describe, expect, it } from 'vitest'
import {
  decalerHeure,
  graviteMax,
  heureArriveeEffective,
  heureEffective,
  messagePerturbation,
  perturbationsDuJour,
  perturbationsDuTrajet,
  toucheLeTrajet,
  type Perturbation,
  type Urgences,
} from './urgences'
import { datesDeLaSemaine, depuisIso, isoDate } from './calendrier'
import { contexteEnfant, trajetsDuJour } from './plan'
import { repasParDefaut } from './stockage'
import type { Enfant } from './types'

const perturbation = (p: Partial<Perturbation>): Perturbation => ({
  id: 'test',
  du: '2026-09-17',
  au: '2026-09-17',
  type: 'annulation',
  message: { fr: 'Route barrée' },
  publieLe: '2026-09-17T06:40:00.000Z',
  publiePar: 'Commune',
  gravite: 'alerte',
  ...p,
})

const urgences = (liste: Perturbation[]): Urgences => ({
  version: 1,
  misAJour: '2026-09-17T06:40:00.000Z',
  perturbations: liste,
})

const enfantTest = (): Enfant => ({
  id: 'e1',
  prenom: 'Léa',
  cycle: 'c2',
  repas: repasParDefaut(),
})

const ctx = contexteEnfant(enfantTest(), {
  libelle: 'Hovelange',
  localite: 'Hovelange',
  coord: [49.7228, 5.9049],
})!

const allerLundi = trajetsDuJour(ctx, 'lundi').trajets.find((t) => t.type === 'aller-matin')!

describe('fenêtre de validité', () => {
  it('ne retient que les perturbations couvrant la date', () => {
    const u = urgences([
      perturbation({ id: 'a', du: '2026-09-17', au: '2026-09-17' }),
      perturbation({ id: 'b', du: '2026-09-20', au: '2026-09-25' }),
    ])
    expect(perturbationsDuJour(u, depuisIso('2026-09-17')).map((p) => p.id)).toEqual(['a'])
    expect(perturbationsDuJour(u, depuisIso('2026-09-22')).map((p) => p.id)).toEqual(['b'])
  })

  it("disparaît d'elle-même le lendemain de la date de fin", () => {
    const u = urgences([perturbation({ du: '2026-09-17', au: '2026-09-17' })])
    expect(perturbationsDuJour(u, depuisIso('2026-09-18'))).toHaveLength(0)
  })

  it('inclut les deux bornes', () => {
    const u = urgences([perturbation({ du: '2026-09-17', au: '2026-09-19' })])
    for (const d of ['2026-09-17', '2026-09-18', '2026-09-19']) {
      expect(perturbationsDuJour(u, depuisIso(d))).toHaveLength(1)
    }
  })
})

describe('portée des perturbations', () => {
  it('touche tout le monde quand aucune portée n’est précisée', () => {
    expect(toucheLeTrajet(perturbation({}), allerLundi)).toBe(true)
  })

  it("n'alarme pas un parent pour une ligne qui n'est pas la sienne", () => {
    // Le trajet de test emprunte l'Aller 2 ; une perturbation sur l'Aller 1 ne doit
    // pas s'afficher.
    expect(allerLundi.ligne.id).toBe('aller-2')
    expect(toucheLeTrajet(perturbation({ ligne: 'aller-1' }), allerLundi)).toBe(false)
    expect(toucheLeTrajet(perturbation({ ligne: 'aller-2' }), allerLundi)).toBe(true)
  })

  it('cible une course précise', () => {
    expect(toucheLeTrajet(perturbation({ service: 'aller-2-matin' }), allerLundi)).toBe(true)
    expect(toucheLeTrajet(perturbation({ service: 'aller-2-apres-midi' }), allerLundi)).toBe(false)
  })

  it('cible un arrêt, au départ comme à l’arrivée', () => {
    expect(toucheLeTrajet(perturbation({ arret: allerLundi.depart.arret.id }), allerLundi)).toBe(true)
    expect(toucheLeTrajet(perturbation({ arret: allerLundi.arrivee.arret.id }), allerLundi)).toBe(true)
    expect(toucheLeTrajet(perturbation({ arret: 'oberpallen-pont' }), allerLundi)).toBe(false)
  })

  it('filtre correctement une liste', () => {
    const liste = [
      perturbation({ id: 'mienne', ligne: 'aller-2' }),
      perturbation({ id: 'autre', ligne: 'retour-1' }),
    ]
    expect(perturbationsDuTrajet(liste, allerLundi).map((p) => p.id)).toEqual(['mienne'])
  })
})

describe('effet sur les horaires', () => {
  it('annule le trajet', () => {
    expect(heureEffective(allerLundi, [perturbation({ type: 'annulation' })])).toBeNull()
  })

  it('décale l’heure d’un retard', () => {
    const retarde = heureEffective(allerLundi, [
      perturbation({ type: 'retard', minutes: 15 }),
    ])
    expect(allerLundi.depart.heure).toBe('07:45')
    expect(retarde).toBe('08:00')
  })

  it("cumule plusieurs retards plutôt que d'en garder un seul", () => {
    const retarde = heureEffective(allerLundi, [
      perturbation({ id: 'a', type: 'retard', minutes: 10 }),
      perturbation({ id: 'b', type: 'retard', minutes: 5 }),
    ])
    expect(retarde).toBe('08:00')
  })

  it("laisse l'heure intacte pour un simple message", () => {
    expect(heureEffective(allerLundi, [perturbation({ type: 'message' })])).toBe('07:45')
  })

  it('ne déborde pas de la journée', () => {
    expect(decalerHeure('23:55', 30)).toBe('23:59')
    expect(decalerHeure('00:05', -30)).toBe('00:00')
  })
})

describe('effet sur l’heure d’arrivée', () => {
  it("décale l'arrivée du même retard que le départ", () => {
    // Un bus parti en retard arrive en retard : supposer qu'il rattrape ferait
    // attendre un parent à l'arrêt sur une heure que rien ne garantit.
    expect(allerLundi.arrivee.heure).toBe('08:00')
    expect(heureArriveeEffective(allerLundi, [perturbation({ type: 'retard', minutes: 15 })])).toBe(
      '08:15',
    )
  })

  it('cumule plusieurs retards', () => {
    const retarde = heureArriveeEffective(allerLundi, [
      perturbation({ id: 'a', type: 'retard', minutes: 10 }),
      perturbation({ id: 'b', type: 'retard', minutes: 5 }),
    ])
    expect(retarde).toBe('08:15')
  })

  it("n'annonce aucune arrivée pour un trajet annulé", () => {
    expect(heureArriveeEffective(allerLundi, [perturbation({ type: 'annulation' })])).toBeNull()
  })

  it("laisse l'heure intacte pour un simple message", () => {
    expect(heureArriveeEffective(allerLundi, [perturbation({ type: 'message' })])).toBe('08:00')
  })

  it("reste nulle quand le plan ne publie pas l'heure d'arrivée", () => {
    const sansArrivee = { ...allerLundi, arrivee: { ...allerLundi.arrivee, heure: null } }
    expect(heureArriveeEffective(sansArrivee, [])).toBeNull()
    expect(heureArriveeEffective(sansArrivee, [perturbation({ type: 'retard', minutes: 5 })])).toBeNull()
  })
})

describe('message et gravité', () => {
  it('replie sur le français quand la langue manque', () => {
    const p = perturbation({ message: { fr: 'Route barrée', de: 'Straße gesperrt' } })
    expect(messagePerturbation(p, 'de')).toBe('Straße gesperrt')
    expect(messagePerturbation(p, 'pt')).toBe('Route barrée')
  })

  it('retient la gravité la plus élevée', () => {
    expect(
      graviteMax([perturbation({ gravite: 'info' }), perturbation({ gravite: 'alerte' })]),
    ).toBe('alerte')
    expect(graviteMax([])).toBeNull()
  })
})

describe('rattachement des dates à la semaine', () => {
  it('donne cinq jours consécutifs du lundi au vendredi', () => {
    const dates = datesDeLaSemaine(depuisIso('2026-09-16')) // un mercredi
    expect(isoDate(dates.lundi)).toBe('2026-09-14')
    expect(isoDate(dates.vendredi)).toBe('2026-09-18')
  })

  it('affiche la semaine à venir quand on consulte le week-end', () => {
    // Un parent qui regarde le samedi prépare la semaine suivante, pas la veille.
    const dates = datesDeLaSemaine(depuisIso('2026-09-19')) // un samedi
    expect(isoDate(dates.lundi)).toBe('2026-09-21')
  })
})
