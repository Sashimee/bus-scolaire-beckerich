import { describe, expect, it } from 'vitest'
import {
  anneeAExporter,
  depuisIso,
  etatDuJour,
  genererIcs,
  isoDate,
  jourDeSemaine,
} from './calendrier'
import { contexteEnfant } from './plan'
import { encoderFoyer, decoderFoyer } from './partage'
import { repasParDefaut } from './stockage'
import type { Enfant, Foyer } from './types'

const enfantTest = (): Enfant => ({
  id: 'e1',
  prenom: 'Léa',
  cycle: 'c2',
  repas: { ...repasParDefaut(), lundi: 'dillendapp' },
})

const HOVELANGE = { libelle: 'Hovelange', localite: 'Hovelange', coord: [49.7228, 5.9049] as const }

describe('lecture des dates', () => {
  it('interprète une date ISO comme locale et non comme UTC', () => {
    // Sans cette précaution, la rentrée tomberait la veille dans les fuseaux
    // négatifs et tout le calendrier serait décalé.
    expect(isoDate(depuisIso('2026-09-15'))).toBe('2026-09-15')
    expect(isoDate(depuisIso('2027-01-01'))).toBe('2027-01-01')
  })

  it('ne retient que les jours de classe', () => {
    expect(jourDeSemaine(depuisIso('2026-09-15'))).toBe('mardi')
    expect(jourDeSemaine(depuisIso('2026-09-19'))).toBeNull() // samedi
  })
})

describe('y a-t-il école ?', () => {
  it('dit oui un mercredi ordinaire de septembre', () => {
    expect(etatDuJour(depuisIso('2026-09-16'))).toEqual({ ecole: true })
  })

  it('dit non pendant le congé de la Toussaint', () => {
    const e = etatDuJour(depuisIso('2026-11-02'))
    expect(e.ecole).toBe(false)
    expect(e.raison).toBe('vacances')
    expect(e.id).toBe('toussaint')
  })

  it('dit non le jour de la fête nationale', () => {
    const e = etatDuJour(depuisIso('2027-06-23'))
    expect(e.ecole).toBe(false)
    expect(e.raison).toBe('ferie')
    expect(e.id).toBe('fete-nationale')
  })

  it('dit non le week-end', () => {
    expect(etatDuJour(depuisIso('2026-09-20')).raison).toBe('weekend')
  })

  it("avoue son ignorance hors des années connues plutôt que d'affirmer", () => {
    expect(etatDuJour(depuisIso('2030-03-04')).raison).toBe('annee-inconnue')
  })

  it("reconnaît le congé d'été qui précède la rentrée", () => {
    // Cas réel : un parent ouvre l'application en août pour préparer la rentrée.
    // Le congé d'été déborde de l'année scolaire qui vient de finir, il ne doit pas
    // tomber dans un trou de couverture.
    const e = etatDuJour(depuisIso('2026-08-07'))
    expect(e.ecole).toBe(false)
    expect(e.raison).toBe('vacances')
    expect(e.id).toBe('ete')
  })

  it("ne conclut rien sur une année seulement partielle", () => {
    // Mars 2026 appartient à une année dont on n'a enregistré que le congé d'été.
    expect(etatDuJour(depuisIso('2026-03-10')).raison).toBe('annee-inconnue')
  })

  it("n'exporte jamais une année scolaire partiellement renseignée", () => {
    const annee = anneeAExporter(depuisIso('2026-08-07'))
    expect(annee?.anneeScolaire).toBe('2026/2027')
    expect(annee?.partiel).toBeFalsy()
  })
})

describe('export iCalendar', () => {
  const ctx = contexteEnfant(enfantTest(), HOVELANGE)!
  const ics = genererIcs(ctx, {
    libelleTrajet: (t) => t.type,
    nomArret: (id) => id,
    minutesMarche: 7,
  })

  it('produit un calendrier valide', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
  })

  it('limite chaque série aux jours réellement concernés', () => {
    // L'enfant mange au Dillendapp le lundi : il n'a pas de retour de midi ce jour-là,
    // donc la série « retour-midi » ne doit pas inclure MO.
    const series = ics.split('BEGIN:VEVENT').filter((b) => b.includes('retour-midi'))
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
})

describe('partage par lien', () => {
  const foyer: Foyer = {
    adresse: { libelle: '12, Haaptstrooss', localite: 'Elvange', coord: [49.7243, 5.9174] },
    enfants: [enfantTest(), { ...enfantTest(), id: 'e2', prenom: 'Noé', cycle: 'c4' }],
  }

  it('fait un aller-retour sans perte', () => {
    const relu = decoderFoyer(encoderFoyer(foyer))
    expect(relu).not.toBeNull()
    expect(relu!.adresse?.libelle).toBe('12, Haaptstrooss')
    expect(relu!.adresse?.coord[0]).toBeCloseTo(49.7243, 4)
    expect(relu!.enfants).toHaveLength(2)
    expect(relu!.enfants[0].prenom).toBe('Léa')
    expect(relu!.enfants[0].cycle).toBe('c2')
    expect(relu!.enfants[0].repas.lundi).toBe('dillendapp')
    expect(relu!.enfants[0].repas.mardi).toBe('maison')
    expect(relu!.enfants[1].cycle).toBe('c4')
  })

  it('supporte les accents et les caractères luxembourgeois', () => {
    const f: Foyer = {
      adresse: { libelle: '3, Fräiheetsbam', localite: 'Beckerich', coord: [49.728, 5.891] },
      enfants: [{ ...enfantTest(), prenom: 'Zoé-Ännchen' }],
    }
    expect(decoderFoyer(encoderFoyer(f))!.enfants[0].prenom).toBe('Zoé-Ännchen')
  })

  it("conserve l'usage du bus jour par jour", () => {
    const f: Foyer = {
      adresse: { libelle: '3, Kneppchen', localite: 'Hovelange', coord: [49.7228, 5.9049] },
      enfants: [
        {
          ...enfantTest(),
          bus: {
            lundi: 'aller',
            mardi: 'aller-retour',
            mercredi: 'aucun',
            jeudi: 'retour',
            vendredi: 'aller-retour',
          },
        },
      ],
    }
    const relu = decoderFoyer(encoderFoyer(f))!
    expect(relu.enfants[0].bus).toEqual(f.enfants[0].bus)
  })

  it("relit un lien d'ancienne version en supposant l'aller-retour", () => {
    // Un lien partagé avant l'ajout du réglage doit rester utilisable, plutôt que
    // d'être rejeté ou d'ouvrir une configuration vide.
    // Encodé comme le faisait la version 1 : UTF-8 puis base64url. Passer par `btoa`
    // sur la chaîne brute abîmerait les accents — ce serait la fixture qui aurait
    // tort, pas le décodeur.
    const json = JSON.stringify([
      1,
      '3, Kneppchen',
      'Hovelange',
      49.7228,
      5.9049,
      [['Léa', 2, 'mmmmm']],
    ])
    let binaire = ''
    for (const o of new TextEncoder().encode(json)) binaire += String.fromCharCode(o)
    const v1 = btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const relu = decoderFoyer(v1)
    expect(relu).not.toBeNull()
    expect(relu!.enfants[0].prenom).toBe('Léa')
    expect(relu!.enfants[0].bus?.lundi).toBe('aller-retour')
  })

  it('renvoie null sur un lien corrompu au lieu de planter', () => {
    expect(decoderFoyer('pas-du-tout-du-base64-valide!!')).toBeNull()
    expect(decoderFoyer('')).toBeNull()
  })
})
