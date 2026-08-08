import { describe, expect, it } from 'vitest'
import { lienSur, relireCredit, relireCredits } from './credits'

describe('lien d’un crédit', () => {
  it('accepte une adresse web', () => {
    expect(lienSur('https://exemple.lu/moi')).toBe('https://exemple.lu/moi')
    expect(lienSur('http://exemple.lu/')).toBe('http://exemple.lu/')
  })

  it('refuse tout ce qui n’en est pas une', () => {
    // Un `javascript:` collé dans /admin deviendrait un lien exécutable sur une page
    // publique. C'est le seul endroit du projet où du texte saisi devient une URL.
    expect(lienSur('javascript:alert(1)')).toBeNull()
    expect(lienSur('data:text/html,<script>')).toBeNull()
    expect(lienSur('pas une url')).toBeNull()
    expect(lienSur(undefined)).toBeNull()
    expect(lienSur('')).toBeNull()
  })
})

describe('relecture d’un crédit', () => {
  it('garde le nom et ce qui l’accompagne', () => {
    expect(relireCredit({ nom: ' Marie ', role: 'Traduction', lien: 'https://exemple.lu' })).toEqual(
      { nom: 'Marie', role: 'Traduction', lien: 'https://exemple.lu' },
    )
  })

  it('refuse une entrée sans nom : il n’y aurait rien à afficher', () => {
    expect(relireCredit({ role: 'Traduction' })).toBeNull()
    expect(relireCredit({ nom: '   ' })).toBeNull()
    expect(relireCredit(null)).toBeNull()
    expect(relireCredit('Marie')).toBeNull()
  })

  it('tronque plutôt que de laisser une page déformée', () => {
    const c = relireCredit({ nom: 'x'.repeat(200), role: 'y'.repeat(300) })!
    expect(c.nom).toHaveLength(80)
    expect(c.role).toHaveLength(120)
  })
})

describe('relecture du fichier de crédits', () => {
  it('n’expose pas une langue sans traducteur déclaré', () => {
    // Un bloc vide se lirait comme un oubli plutôt que comme une absence.
    const c = relireCredits({ traductions: { de: [], lb: [{ nom: 'Jean' }] } })
    expect(Object.keys(c.traductions)).toEqual(['lb'])
  })

  it('ignore une langue qui n’existe pas dans l’application', () => {
    const c = relireCredits({ traductions: { es: [{ nom: 'Ana' }] } })
    expect(c.traductions).toEqual({})
  })

  it('survit à un fichier vide ou abîmé', () => {
    for (const brut of [null, {}, 'texte', { developpement: 'pas une liste' }]) {
      const c = relireCredits(brut)
      expect(c.developpement).toEqual([])
      expect(c.remerciements).toEqual([])
      expect(c.traductions).toEqual({})
    }
  })

  it('écarte les entrées illisibles sans perdre les autres', () => {
    const c = relireCredits({ remerciements: [{ nom: 'Marie' }, null, { role: 'sans nom' }] })
    expect(c.remerciements).toEqual([{ nom: 'Marie' }])
  })
})
