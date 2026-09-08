import { describe, expect, it } from 'vitest'
import { planPubliable, validerPlan } from './validation'
import planReel from '../data/plan-2025-2026.json'

const erreurs = (brut: unknown) =>
  validerPlan(brut).filter((p) => p.gravite === 'erreur')

const creneau = (debut: string, fin: string) => ({ debut, fin })

/** Un plan minimal mais valide, à dégrader dans chaque test. */
function planValide() {
  return {
    anneeScolaire: '2026/2027',
    valideDu: '2026-09-15',
    valideAu: '2027-07-15',
    horairesEcole: {
      jours: {
        matin: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
        apresMidi: ['lundi', 'mercredi', 'vendredi'],
      },
      parCycle: {
        precoce: { matin: creneau('07:55', '11:45'), apresMidi: creneau('14:00', '15:45') },
        c1: { matin: creneau('08:00', '11:50'), apresMidi: creneau('14:00', '15:45') },
        c2: { matin: creneau('08:00', '12:05'), apresMidi: creneau('14:00', '15:55') },
        c3: { matin: creneau('08:00', '12:10'), apresMidi: creneau('14:05', '15:55') },
        c4: { matin: creneau('07:55', '12:00'), apresMidi: creneau('13:55', '15:50') },
      },
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
  it('refuse un cycle sans heures de cours', () => {
    // Sans elles, la maison relais proposerait une heure de sortie qui n'existe pas.
    const p = planValide()
    delete (p.horairesEcole.parCycle as Record<string, unknown>).c3
    expect(erreurs(p).some((e) => e.ou.includes('parCycle › c3'))).toBe(true)
  })

  it('refuse des cours qui se termineraient avant de commencer', () => {
    const p = planValide()
    p.horairesEcole.parCycle.c2.matin = creneau('12:05', '08:00')
    expect(erreurs(p).some((e) => e.message.includes('doit suivre leur début'))).toBe(true)
  })

  it('refuse un jour de cours inventé', () => {
    const p = planValide()
    p.horairesEcole.jours.apresMidi = ['lundi', 'dimanche']
    expect(erreurs(p).some((e) => e.ou.includes('jours › apresMidi'))).toBe(true)
  })

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

describe('renvois d’incertitude', () => {
  // R66/R70 : rien ne vérifiait qu'une course renvoyant à une incertitude désignait
  // une incertitude existante. Un renvoi mort ne casse pas la page — il affiche la
  // CLÉ de traduction sous le titre « Ce que nous ne savons pas », ce qui est pire.
  it('refuse une course qui renvoie à une incertitude qui n’existe pas', () => {
    const q = planValide() as Record<string, any>
    q.lignes[0].services[0].incertitude = 'fantome'
    expect(erreurs(q).some((e) => e.message.includes('Incertitude inconnue'))).toBe(true)
  })

  it('accepte le renvoi quand l’incertitude est déclarée', () => {
    const q = planValide() as Record<string, any>
    q.incertitudes = [
      { id: 'vrai-doute', portee: 'aller-1.matin', question: 'q', hypothese: 'h', aVerifierAupres: 'commune' },
    ]
    q.lignes[0].services[0].incertitude = 'vrai-doute'
    expect(erreurs(q)).toEqual([])
  })

  it('refuse un jour inconnu, et une liste de jours vide', () => {
    const base = () => {
      const q = planValide() as Record<string, any>
      q.incertitudes = [
        { id: 'doute', portee: 'aller-1.matin', question: 'q', hypothese: 'h', aVerifierAupres: 'c' },
      ]
      return q
    }
    const inconnu = base()
    inconnu.incertitudes[0].jours = ['lundredi']
    expect(erreurs(inconnu).some((e) => e.message.includes('Jour inconnu'))).toBe(true)

    const vide = base()
    vide.incertitudes[0].jours = []
    expect(erreurs(vide).some((e) => e.message.includes('liste non vide'))).toBe(true)
  })

  it('refuse deux incertitudes de même identifiant', () => {
    const q = planValide() as Record<string, any>
    const une = { id: 'doublon', portee: 'x', question: 'q', hypothese: 'h', aVerifierAupres: 'c' }
    q.incertitudes = [une, { ...une }]
    expect(erreurs(q).some((e) => e.message.includes('en double'))).toBe(true)
  })

  it('tient le plan réel pour valide, incertitudes comprises', () => {
    expect(planPubliable(validerPlan(planReel))).toBe(true)
  })
})

describe('cohérence des courses (R70)', () => {
  it('refuse un « dessert » qui annonce un arrêt jamais desservi', () => {
    // C'est l'erreur trouvée sur `aller-3`, qui annonçait « beckerich-ecole » alors
    // qu'il passe à la maison relais. Aucun code ne lit ce champ : rien ne l'a vue.
    const q = planValide() as Record<string, any>
    q.lignes[0].dessert = ['levelange']
    expect(erreurs(q).some((e) => e.message.includes('dessert'))).toBe(true)
  })

  it('accepte un « dessert » conforme aux arrêts de la ligne', () => {
    const q = planValide() as Record<string, any>
    const premier = q.lignes[0].services[0].arrets[0].arret
    q.lignes[0].dessert = [premier]
    expect(erreurs(q)).toEqual([])
  })

  it('refuse le même arrêt deux fois de suite, et tolère la boucle', () => {
    const doublon = planValide() as Record<string, any>
    const arrets = doublon.lignes[0].services[0].arrets
    arrets.splice(1, 0, { ...arrets[0], heure: arrets[0].heure })
    expect(erreurs(doublon).some((e) => e.message.includes('deux fois de suite'))).toBe(true)

    // L'Aller 3 du plan réel repasse au Dillendapp : une boucle n'est pas une erreur.
    expect(planPubliable(validerPlan(planReel))).toBe(true)
  })

  it('refuse une note d’arrêt qui n’est pas déclarée', () => {
    // Même piège que les incertitudes : le texte de la note vit dans les dictionnaires,
    // et un identifiant inconnu affiche sa clé au parent, à côté d'une heure de bus.
    const q = planValide() as Record<string, any>
    q.lignes[0].services[0].arrets[0].notes = ['note-fantome']
    expect(erreurs(q).some((e) => e.message.includes('Note inconnue'))).toBe(true)

    q.notes = { 'note-fantome': {} }
    expect(erreurs(q)).toEqual([])
  })

  it('avertit d’une vitesse impossible entre deux arrêts, sans bloquer', () => {
    const q = planValide() as Record<string, any>
    // Levelange → Schweich-Peiffer : 5,1 km. En une minute, 308 km/h.
    q.lignes[0].services[0].arrets = [
      { arret: 'levelange', heure: '07:00' },
      { arret: 'schweich-peiffer', heure: '07:01' },
    ]
    const problemes = validerPlan(q)
    expect(problemes.some((x) => x.gravite === 'avertissement' && x.message.includes('km/h'))).toBe(
      true,
    )
    expect(problemes.some((x) => x.gravite === 'erreur' && x.message.includes('km/h'))).toBe(false)
  })
})
