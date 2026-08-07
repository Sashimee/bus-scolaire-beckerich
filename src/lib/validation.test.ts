import { describe, expect, it } from 'vitest'
import { planPubliable, validerPlan } from './validation'
import planReel from '../data/plan-2025-2026.json'

const erreurs = (brut: unknown) =>
  validerPlan(brut).filter((p) => p.gravite === 'erreur')

/** Un plan minimal mais valide, à dégrader dans chaque test. */
function planValide() {
  return {
    anneeScolaire: '2026/2027',
    valideDu: '2026-09-15',
    valideAu: '2027-07-15',
    horairesEcole: {
      matin: { debut: '07:55', fin: '11:45', jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] },
      apresMidi: { debut: '14:00', fin: '15:45', jours: ['lundi', 'mercredi', 'vendredi'] },
    },
    lignes: [
      {
        id: 'aller-1',
        nom: 'Aller — Bus 1',
        direction: 'vers-ecole',
        services: [
          {
            id: 'aller-1-matin',
            periode: 'matin',
            jours: ['lundi'],
            arrets: [
              { arret: 'huttange', heure: '07:25' },
              { arret: 'noerdange-ecole', heure: '07:30' },
              { arret: 'elvange-ecole', heure: '07:40' },
              { arret: 'beckerich-ecole', heure: '07:50' },
              { arret: 'oberpallen-ecole', heure: '07:58' },
            ],
          },
        ],
      },
    ],
  }
}

describe('le plan réellement publié', () => {
  it('passe la validation sans la moindre erreur', () => {
    expect(erreurs(planReel)).toEqual([])
  })

  it('est publiable', () => {
    expect(planPubliable(validerPlan(planReel))).toBe(true)
  })
})

describe('structure', () => {
  it('refuse ce qui n’est pas un objet', () => {
    expect(erreurs('bonjour').length).toBeGreaterThan(0)
    expect(erreurs(null).length).toBeGreaterThan(0)
    expect(erreurs([1, 2]).length).toBeGreaterThan(0)
  })

  it('exige les dates de validité, au bon format et dans le bon ordre', () => {
    const p = planValide()
    p.valideDu = '15/09/2026'
    expect(erreurs(p).some((e) => e.message.includes('AAAA-MM-JJ'))).toBe(true)

    const q = planValide()
    q.valideDu = '2027-09-15'
    q.valideAu = '2026-07-15'
    expect(erreurs(q).some((e) => e.message.includes('postérieure'))).toBe(true)
  })

  it('refuse un plan sans aucune ligne', () => {
    const p = planValide()
    p.lignes = []
    expect(erreurs(p).some((e) => e.message.includes('plan serait vide'))).toBe(true)
  })

  it('refuse une ligne sans course', () => {
    const p = planValide()
    p.lignes[0].services = []
    expect(erreurs(p).some((e) => e.message.includes('Aucune course'))).toBe(true)
  })

  it('refuse une course d’un seul arrêt', () => {
    const p = planValide()
    p.lignes[0].services[0].arrets = [{ arret: 'huttange', heure: '07:25' }]
    expect(erreurs(p).some((e) => e.message.includes('deux arrêts'))).toBe(true)
  })
})

describe('valeurs', () => {
  it('refuse un arrêt qui n’existe pas', () => {
    const p = planValide()
    p.lignes[0].services[0].arrets[1].arret = 'gare-de-lyon'
    expect(erreurs(p).some((e) => e.message.includes('Arrêt inconnu'))).toBe(true)
  })

  it('refuse une heure mal formée mais accepte null', () => {
    const p = planValide()
    p.lignes[0].services[0].arrets[1].heure = '7h30' as unknown as string
    expect(erreurs(p).some((e) => e.message.includes('Heure invalide'))).toBe(true)

    const q = planValide()
    q.lignes[0].services[0].arrets[1].heure = null as unknown as string
    expect(erreurs(q)).toEqual([])
  })

  it('refuse une course dont les heures remontent le temps', () => {
    // Le symptôme d'une ligne recopiée à l'envers, très facile à commettre.
    const p = planValide()
    p.lignes[0].services[0].arrets[2].heure = '07:10'
    expect(erreurs(p).some((e) => e.message.includes('remonterait le temps'))).toBe(true)
  })

  it('refuse un jour ou une période inventés', () => {
    const p = planValide()
    p.lignes[0].services[0].jours = ['lundi', 'samedi']
    expect(erreurs(p).some((e) => e.message.includes('Jour inconnu'))).toBe(true)

    const q = planValide()
    q.lignes[0].services[0].periode = 'nuit'
    expect(erreurs(q).some((e) => e.message.includes('Période inconnue'))).toBe(true)
  })

  it('refuse deux lignes ou deux courses partageant un identifiant', () => {
    const p = planValide()
    p.lignes.push({ ...planValide().lignes[0] })
    const messages = erreurs(p).map((e) => e.message)
    expect(messages.some((m) => m.includes('en double'))).toBe(true)
  })
})

describe('cohérence avec les écoles', () => {
  it('refuse un plan qui laisse un cycle sans desserte', () => {
    // C'est le cas le plus grave : les enfants d'un cycle n'auraient aucun trajet,
    // et l'application ne pourrait rien leur afficher.
    const p = planValide()
    p.lignes[0].services[0].arrets = p.lignes[0].services[0].arrets.filter(
      (a) => a.arret !== 'noerdange-ecole',
    )
    const e = erreurs(p)
    expect(e.some((x) => x.message.includes('noerdange-ecole'))).toBe(true)
    expect(e.some((x) => x.message.includes('aucun trajet'))).toBe(true)
  })

  it('avertit sans bloquer sur les arrêts non desservis', () => {
    const problemes = validerPlan(planValide())
    const avertissements = problemes.filter((x) => x.gravite === 'avertissement')
    expect(avertissements.some((a) => a.message.includes('desservis par aucune course'))).toBe(true)
    // Un avertissement ne doit jamais empêcher de publier.
    expect(planPubliable(problemes)).toBe(true)
  })
})
