/**
 * Porté depuis `worker/src/commune.test.js`, sans en retirer un cas. La validation
 * n'a pas changé d'une règle au passage sur Node : ces tests sont la garantie qu'elle
 * ne s'est pas assouplie en chemin.
 */
import { describe, expect, it } from 'vitest'
import { perturbationPropre, validerPerturbation } from './validation-perturbation.ts'

describe('validation des perturbations', () => {
  const valide = {
    id: 'u-2026-08-08-1',
    type: 'annulation',
    gravite: 'alerte',
    du: '2026-08-10',
    au: '2026-08-10',
    message: { fr: 'Le bus de 07:25 ne circule pas.' },
  }

  it('accepte une perturbation complète', () => {
    expect(validerPerturbation(valide)).toEqual([])
  })

  it("accepte les quatre types de l'application, et pas un de plus", () => {
    for (const type of ['annulation', 'retard', 'arret-deplace', 'message']) {
      const p = { ...valide, type, ...(type === 'retard' ? { minutes: 10 } : {}), ...(type === 'arret-deplace' ? { arret: 'levelange' } : {}) }
      expect(validerPerturbation(p), type).toEqual([])
    }
    // « information » n'existe pas côté application : l'accepter publierait une
    // perturbation que personne ne verrait.
    expect(validerPerturbation({ ...valide, type: 'information' })).toContain('type')
  })

  it('borne le nombre de rappels', () => {
    // Chaque rappel est un envoi répété à toutes les familles abonnées. Non borné, le
    // champ ferait du serveur un outil de harcèlement involontaire.
    expect(validerPerturbation({ ...valide, rappels: 2 })).toEqual([])
    expect(validerPerturbation({ ...valide, rappels: 0 })).toEqual([])
    expect(validerPerturbation({ ...valide, rappels: 4 })).toContain('rappels')
    expect(validerPerturbation({ ...valide, rappels: -1 })).toContain('rappels')
    expect(validerPerturbation({ ...valide, rappels: 1.5 })).toContain('rappels')
    expect(validerPerturbation({ ...valide, rappels: '3' })).toContain('rappels')
  })

  it('n’emporte que les champs connus dans le fichier publié', () => {
    // Le contenu était recopié tel quel : un `curl` pouvait glisser n'importe quel
    // champ dans un fichier public du dépôt. L'application l'aurait ignoré à la
    // lecture, mais il aurait bel et bien été publié.
    const propre = perturbationPropre({
      ...valide,
      rappels: 2,
      publiePar: 'Pirate',
      script: '<script>',
      nImporteQuoi: { profond: [1, 2, 3] },
    })
    expect(Object.keys(propre).sort()).toEqual(
      ['au', 'du', 'gravite', 'id', 'message', 'rappels', 'type'].sort(),
    )
  })

  it('refuse un type ou une gravité inventés', () => {
    expect(validerPerturbation({ ...valide, type: 'explosion' })).toContain('type')
    expect(validerPerturbation({ ...valide, gravite: 'panique' })).toContain('gravite')
  })

  it('refuse des dates mal formées ou à l’envers', () => {
    expect(validerPerturbation({ ...valide, du: '10/08/2026' })).toContain('du')
    expect(validerPerturbation({ ...valide, du: '2026-08-12', au: '2026-08-10' })).toContain(
      'ordre-dates',
    )
  })

  it('refuse un message absent, vide ou démesuré', () => {
    expect(validerPerturbation({ ...valide, message: undefined })).toContain('message')
    expect(validerPerturbation({ ...valide, message: { fr: '   ' } })).toContain('message')
    expect(validerPerturbation({ ...valide, message: { fr: 'x'.repeat(201) } })).toContain(
      'message',
    )
  })

  it('refuse une langue qui n’existe pas dans l’application', () => {
    expect(validerPerturbation({ ...valide, message: { fr: 'ok', zz: 'ok' } })).toContain(
      'langue-zz',
    )
  })

  it('borne le retard à des valeurs plausibles', () => {
    expect(validerPerturbation({ ...valide, type: 'retard', minutes: 15 })).toEqual([])
    expect(validerPerturbation({ ...valide, type: 'retard', minutes: 300 })).toContain('minutes')
    expect(validerPerturbation({ ...valide, type: 'retard', minutes: 0 })).toContain('minutes')
    expect(validerPerturbation({ ...valide, type: 'retard', minutes: 1.5 })).toContain('minutes')
  })

  it('exige une durée pour un retard et un arrêt pour un déplacement', () => {
    expect(validerPerturbation({ ...valide, type: 'retard' })).toContain('minutes-obligatoires')
    expect(validerPerturbation({ ...valide, type: 'arret-deplace' })).toContain(
      'arret-obligatoire',
    )
  })

  it('refuse une charge qui n’est pas un objet', () => {
    expect(validerPerturbation(null)).toEqual(['perturbation-absente'])
    expect(validerPerturbation('annulation')).toEqual(['perturbation-absente'])
  })
})
