import { describe, expect, it } from 'vitest'
import { contexteEnfant } from '../plan'
import { icsEnfant, icsFoyer, evenementsEnfant } from './index'
import { JOURS } from '../types'
import type { Adresse, Enfant, Jour, RepasMidi, Trajet } from '../types'

const HOVELANGE: Adresse = { libelle: 'Hovelange', localite: 'Hovelange', coord: [49.7228, 5.9049] }

/** Un enfant qui mange au Dillendapp le lundi et rentre les autres jours. */
function enfantTest(): Enfant {
  return {
    id: 'e1',
    prenom: 'Léa',
    cycle: 'c2',
    repas: {
      ...(Object.fromEntries(JOURS.map((j) => [j, 'maison'])) as Record<Jour, RepasMidi>),
      lundi: 'dillendapp',
    },
    periscolaire: true,
  }
}

const options = {
  libelleTrajet: (t: Trajet) => t.type,
  nomArret: (id: string) => id,
  libelleRecuperation: 'À récupérer au Dillendapp',
  libelleDepose: 'À déposer au Dillendapp',
}

describe('export iCalendar', () => {
  const ctx = contexteEnfant(enfantTest(), HOVELANGE)!
  const ics = icsEnfant(ctx, {
    libelleTrajet: (t: Trajet) => t.type,
    nomArret: (id: string) => id,
    libelleRecuperation: 'À récupérer au Dillendapp',
    libelleDepose: 'À déposer au Dillendapp',
  })

  it('produit un calendrier valide', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
  })

  it('limite chaque série aux jours réellement concernés', () => {
    // L'enfant mange au Dillendapp le lundi : il n'a pas de retour de midi ce jour-là,
    // donc la série « retour-midi » ne doit pas inclure MO.
    const series = ics.split('BEGIN:VEVENT').filter((b: string) => b.includes('retour-midi'))
    expect(series.length).toBeGreaterThan(0)
    for (const s of series) {
      const rrule = /RRULE:[^\r\n]+/.exec(s)?.[0] ?? ''
      expect(rrule).not.toContain('MO')
    }
  })

  it("exclut les vacances pour ne pas annoncer un bus qui n'existe pas", () => {
    expect(ics).toContain('EXDATE:')
    // 2 novembre 2026 : lundi du congé de la Toussaint.
    expect(ics).toContain('20261102T')
  })

  it('borne les séries à la fin de l’année scolaire', () => {
    expect(ics).toContain('UNTIL=20270715T235959')
  })

  it("n'exporte que les trajets qui concernent le parent", () => {
    // Les navettes internes école ↔ Dillendapp n'ont pas à encombrer l'agenda.
    expect(ics).not.toContain('navette-dillendapp')
  })

  it("inscrit la récupération au Dillendapp, et pas le bus qui l'y dépose", () => {
    // Ce qui engage le parent, c'est de venir chercher l'enfant à 18:00 — pas
    // l'heure à laquelle le bus quitte l'école.
    const e = enfantTest()
    e.repas = { ...e.repas, lundi: 'dillendapp' }
    e.dillendappJusqua = {
      lundi: '18:00',
      mardi: null,
      mercredi: null,
      jeudi: null,
      vendredi: null,
    }
    const avecRecuperation = icsEnfant(contexteEnfant(e, HOVELANGE)!, {
      libelleTrajet: (t: Trajet) => t.type,
      nomArret: (id: string) => id,
        libelleRecuperation: 'À récupérer au Dillendapp',
      libelleDepose: 'À déposer au Dillendapp',
    })

    expect(avecRecuperation).toContain('À récupérer au Dillendapp')
    expect(avecRecuperation).toContain('T180000')
    expect(avecRecuperation).not.toContain('retour-soir-dillendapp')
  })

  it('inscrit la dépose du matin, symétrique de la récupération', () => {
    // Le parent qui dépose lui-même son enfant à 07:00 n'a aucun bus pour le lui
    // rappeler : c'est justement le rendez-vous que l'agenda doit porter.
    const e = enfantTest()
    e.periscolaire = true
    e.repas = { ...e.repas, mardi: 'dillendapp' }
    e.dillendappDepuis = {
      lundi: null,
      mardi: '07:00',
      mercredi: null,
      jeudi: null,
      vendredi: null,
    }
    const avecDepose = icsEnfant(contexteEnfant(e, HOVELANGE)!, {
      libelleTrajet: (t: Trajet) => t.type,
      nomArret: (id: string) => id,
        libelleRecuperation: 'À récupérer au Dillendapp',
      libelleDepose: 'À déposer au Dillendapp',
    })

    expect(avecDepose).toContain('À déposer au Dillendapp')
    expect(avecDepose).toContain('T070000')
    // Un seul jour concerné : la série ne doit pas déborder sur toute la semaine.
    const serie = avecDepose
      .split('BEGIN:VEVENT')
      .find((b: string) => b.includes('À déposer au Dillendapp'))!
    expect(/RRULE:[^\r\n]+/.exec(serie)?.[0]).toContain('BYDAY=TU')
  })
})

describe('export du foyer entier', () => {
  it('rassemble plusieurs enfants dans un seul calendrier', () => {
    const lea = contexteEnfant(enfantTest(), HOVELANGE)!
    const noe = contexteEnfant({ ...enfantTest(), id: 'e2', prenom: 'Noé', cycle: 'c4' }, HOVELANGE)!
    const ics = icsFoyer([lea, noe], options, 'Bus scolaire — la famille')

    expect(ics).toContain('X-WR-CALNAME:Bus scolaire — la famille')
    expect(ics).toContain('Léa')
    expect(ics).toContain('Noé')
    // Un seul calendrier, donc un seul en-tête.
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1)
  })

  it('donne des identifiants distincts à chaque enfant, pour une resynchronisation propre', () => {
    const lea = contexteEnfant(enfantTest(), HOVELANGE)!
    const noe = contexteEnfant({ ...enfantTest(), id: 'e2', prenom: 'Noé' }, HOVELANGE)!
    const uids = [...icsFoyer([lea, noe], options, 'Famille').matchAll(/UID:([^\r\n]+)/g)].map(
      (m) => m[1],
    )
    expect(new Set(uids).size).toBe(uids.length)
    expect(uids.some((u) => u.startsWith('e1-'))).toBe(true)
    expect(uids.some((u) => u.startsWith('e2-'))).toBe(true)
  })

  it('ne produit rien pour un foyer sans trajet', () => {
    expect(icsFoyer([], options, 'Famille')).toBe('')
  })
})

describe('représentation intermédiaire', () => {
  it('décrit chaque rendez-vous sans rien savoir du format de sortie', () => {
    const evenements = evenementsEnfant(contexteEnfant(enfantTest(), HOVELANGE)!, options)
    expect(evenements.length).toBeGreaterThan(0)
    const e = evenements[0]
    expect(e.heure).toMatch(/^\d{2}:\d{2}$/)
    expect(e.jours.length).toBeGreaterThan(0)
    expect(e.debut).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof e.lieu).toBe('string')
  })

  it("porte le lieu du jour, pour qu'une adresse dérogatoire change le rendez-vous", () => {
    const e = enfantTest()
    e.repas = Object.fromEntries(JOURS.map((j) => [j, 'maison'])) as Record<Jour, RepasMidi>
    e.adresses = {
      mardi: { soir: { libelle: 'Schweich', localite: 'Schweich', coord: [49.7209, 5.9214] } },
    }
    const lieux = new Set(
      evenementsEnfant(contexteEnfant(e, HOVELANGE)!, options).map((x) => x.lieu),
    )
    // Deux lieux distincts : l'arrêt du domicile, et celui du mardi soir.
    expect(lieux.size).toBeGreaterThan(1)
  })
})
