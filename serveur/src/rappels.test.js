import { describe, expect, it } from 'vitest'
import { CRENEAUX, RAPPELS_MAX, creneauxApplicables, momentLocal, rappelsDus } from './rappels.js'

/** Un plan minimal : deux courses, l'une le matin, l'autre le soir. */
const plan = {
  lignes: [
    {
      id: 'aller-1',
      nom: 'Aller — Bus 1',
      services: [
        { id: 'aller-1-matin', periode: 'matin' },
        { id: 'aller-1-apres-midi', periode: 'apres-midi' },
      ],
    },
    { id: 'retour-2', nom: 'Retour — Bus 2', services: [{ id: 'retour-2-soir', periode: 'soir' }] },
  ],
}

const alerte = (extra = {}) => ({
  id: 'u1',
  du: '2026-09-14',
  au: '2026-09-14',
  type: 'annulation',
  gravite: 'alerte',
  message: { fr: 'Le bus de 07:25 ne circule pas.' },
  ...extra,
})

/** Un instant local du Luxembourg, exprimé en UTC pour être sans ambiguïté. */
const aLuxembourg = (iso, heure, minute) => {
  // 14 septembre 2026 : heure d'été, UTC+2. On construit donc l'instant UTC.
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j, heure - 2, minute))
}

const dus = (options) =>
  rappelsDus({ perturbations: [alerte()], plan, jourEcole: true, ...options })

describe('heure locale', () => {
  it("suit l'heure d'été du Luxembourg", () => {
    // 14 septembre 2026, 05:00 UTC = 07:00 à Beckerich.
    const m = momentLocal(new Date(Date.UTC(2026, 8, 14, 5, 0)))
    expect(m.iso).toBe('2026-09-14')
    expect(m.heure).toBe(7)
    expect(m.minutes).toBe(7 * 60)
  })

  it("suit l'heure d'hiver, où le même créneau tombe une heure plus tôt en UTC", () => {
    // 14 décembre 2026, 05:45 UTC = 06:45 à Beckerich. C'est précisément le décalage
    // que le créneau cron écrit en UTC aurait manqué.
    const m = momentLocal(new Date(Date.UTC(2026, 11, 14, 5, 45)))
    expect(m.heure).toBe(6)
    expect(m.minutes).toBe(6 * 60 + 45)
  })

  it('donne minuit comme 0 h et non comme 24 h', () => {
    const m = momentLocal(new Date(Date.UTC(2026, 8, 13, 22, 0)))
    expect(m.heure).toBe(0)
    expect(m.iso).toBe('2026-09-14')
  })
})

describe('créneaux applicables', () => {
  it("s'en tient au matin pour une course du matin", () => {
    expect(creneauxApplicables(alerte({ service: 'aller-1-matin' }), plan)).toEqual(CRENEAUX.matin)
  })

  it("s'en tient à l'après-midi pour une course du soir", () => {
    expect(creneauxApplicables(alerte({ service: 'retour-2-soir' }), plan)).toEqual(
      CRENEAUX['apres-midi'],
    )
  })

  it('couvre tous les départs quand la course n’est pas précisée', () => {
    // Une annonce sans course concerne potentiellement toute la journée : on ne
    // devine pas qu'elle ne vaut que le matin.
    const tous = creneauxApplicables(alerte(), plan)
    expect(tous).toContain('06:45')
    expect(tous).toContain('15:00')
  })
})

describe('déclenchement des rappels', () => {
  it("n'envoie rien avant le premier créneau", () => {
    expect(dus({ maintenant: aLuxembourg('2026-09-14', 6, 30) })).toEqual([])
  })

  it('envoie au premier créneau échu', () => {
    const r = dus({ maintenant: aLuxembourg('2026-09-14', 6, 50) })
    expect(r).toHaveLength(1)
    expect(r[0].creneau).toBe('06:45')
    expect(r[0].numero).toBe(1)
  })

  it("n'envoie qu'un seul rappel même si plusieurs créneaux sont échus d'un coup", () => {
    // Cron manqué, ou Worker déployé en cours de matinée : trois créneaux sont passés.
    // Trois notifications d'affilée seraient pires que le silence.
    const r = dus({ maintenant: aLuxembourg('2026-09-14', 7, 45) })
    expect(r).toHaveLength(1)
    expect(r[0].creneau).toBe('07:40')
    expect(r[0].consommes).toEqual([
      '2026-09-14 06:45',
      '2026-09-14 07:15',
      '2026-09-14 07:40',
    ])
  })

  it('ne réutilise jamais un créneau déjà servi', () => {
    const etats = { u1: { compte: 1, creneaux: ['2026-09-14 06:45'] } }
    const r = dus({ maintenant: aLuxembourg('2026-09-14', 6, 50), etats })
    expect(r).toEqual([])
  })

  it('passe au créneau suivant une fois le précédent servi', () => {
    const etats = { u1: { compte: 1, creneaux: ['2026-09-14 06:45'] } }
    const r = dus({ maintenant: aLuxembourg('2026-09-14', 7, 20), etats })
    expect(r[0].creneau).toBe('07:15')
    expect(r[0].numero).toBe(2)
  })

  it('recommence le lendemain pour une perturbation de plusieurs jours', () => {
    const etats = { u1: { compte: 1, creneaux: ['2026-09-14 06:45'] } }
    const r = rappelsDus({
      perturbations: [alerte({ au: '2026-09-15' })],
      maintenant: aLuxembourg('2026-09-15', 6, 50),
      etats,
      plan,
      jourEcole: true,
    })
    expect(r[0].creneau).toBe('06:45')
  })
})

describe('garde-fous', () => {
  it('ne rappelle jamais une perturbation qui n’est pas une alerte', () => {
    for (const gravite of ['info', 'attention']) {
      const r = rappelsDus({
        perturbations: [alerte({ gravite })],
        maintenant: aLuxembourg('2026-09-14', 7, 0),
        plan,
        jourEcole: true,
      })
      expect(r, gravite).toEqual([])
    }
  })

  it('ne rappelle rien un jour sans école', () => {
    expect(dus({ maintenant: aLuxembourg('2026-09-14', 7, 0), jourEcole: false })).toEqual([])
  })

  it('ne rappelle rien avant 6 h ni après 21 h', () => {
    expect(dus({ maintenant: aLuxembourg('2026-09-14', 5, 30) })).toEqual([])
    expect(dus({ maintenant: aLuxembourg('2026-09-14', 21, 30) })).toEqual([])
    expect(dus({ maintenant: aLuxembourg('2026-09-14', 23, 0) })).toEqual([])
  })

  it('ne rappelle pas une perturbation qui ne s’applique pas aujourd’hui', () => {
    const r = rappelsDus({
      perturbations: [alerte({ du: '2026-09-20', au: '2026-09-21' })],
      maintenant: aLuxembourg('2026-09-14', 7, 0),
      plan,
      jourEcole: true,
    })
    expect(r).toEqual([])
  })

  it('plafonne à trois rappels, quoi que demande la perturbation', () => {
    const etats = { u1: { compte: RAPPELS_MAX, creneaux: [] } }
    expect(dus({ maintenant: aLuxembourg('2026-09-14', 15, 30), etats })).toEqual([])

    // Même en demandant dix rappels, le plafond tient.
    const r = rappelsDus({
      perturbations: [alerte({ rappels: 10 })],
      maintenant: aLuxembourg('2026-09-14', 7, 0),
      etats: { u1: { compte: 3, creneaux: [] } },
      plan,
      jourEcole: true,
    })
    expect(r).toEqual([])
  })

  it('respecte un nombre de rappels plus petit', () => {
    const etats = { u1: { compte: 1, creneaux: ['2026-09-14 06:45'] } }
    const r = rappelsDus({
      perturbations: [alerte({ rappels: 1 })],
      maintenant: aLuxembourg('2026-09-14', 7, 20),
      etats,
      plan,
      jourEcole: true,
    })
    expect(r).toEqual([])
  })

  it('n’envoie aucun rappel quand la perturbation en demande zéro', () => {
    const r = rappelsDus({
      perturbations: [alerte({ rappels: 0 })],
      maintenant: aLuxembourg('2026-09-14', 7, 0),
      plan,
      jourEcole: true,
    })
    expect(r).toEqual([])
  })

  it('supporte une liste vide ou absente', () => {
    expect(rappelsDus({ maintenant: new Date(), plan, jourEcole: true })).toEqual([])
    expect(
      rappelsDus({ perturbations: [], maintenant: new Date(), plan, jourEcole: true }),
    ).toEqual([])
  })
})
