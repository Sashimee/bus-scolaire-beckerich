import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Onglets } from './Onglets'

const onglets = [
  { cle: 'un', libelle: 'Premier', contenu: <p>contenu un</p> },
  { cle: 'deux', libelle: 'Deuxième', contenu: <p>contenu deux</p> },
  { cle: 'trois', libelle: 'Troisième', contenu: <p>contenu trois</p> },
]

const monter = (url = '/admin') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Onglets onglets={onglets} />
    </MemoryRouter>,
  )

const actif = () => screen.getByRole('tab', { selected: true }).textContent

describe('barre d’onglets', () => {
  it('ouvre le premier onglet quand l’URL ne dit rien', () => {
    monter()
    expect(actif()).toBe('Premier')
    expect(screen.getByText('contenu un')).toBeDefined()
  })

  it('ouvre l’onglet demandé par l’URL', () => {
    // C'est ce qui permet à un rechargement — ou à un lien envoyé — de retomber au
    // bon endroit plutôt que sur le premier onglet.
    monter('/admin?onglet=trois')
    expect(actif()).toBe('Troisième')
    expect(screen.getByText('contenu trois')).toBeDefined()
  })

  it('retombe sur le premier onglet si l’URL en nomme un qui n’existe pas', () => {
    monter('/admin?onglet=inexistant')
    expect(actif()).toBe('Premier')
  })

  it('ne monte que le panneau visible', () => {
    // Chaque panneau porte son propre brouillon : les garder tous vivants ferait
    // cohabiter plusieurs blocages de rechargement pour des saisies invisibles.
    monter()
    expect(screen.queryByText('contenu deux')).toBeNull()
  })

  it('change d’onglet au clic', () => {
    monter()
    act(() => screen.getByRole('tab', { name: 'Deuxième' }).click())
    expect(actif()).toBe('Deuxième')
    expect(screen.getByText('contenu deux')).toBeDefined()
  })

  it('se parcourt aux flèches, avec bouclage', () => {
    monter()
    const flecher = (key: string) =>
      act(() => {
        screen
          .getByRole('tab', { selected: true })
          .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      })

    flecher('ArrowRight')
    expect(actif()).toBe('Deuxième')
    flecher('ArrowLeft')
    expect(actif()).toBe('Premier')
    // Une flèche gauche depuis le premier onglet revient au dernier.
    flecher('ArrowLeft')
    expect(actif()).toBe('Troisième')
  })

  it('ne garde qu’un seul onglet dans l’ordre de tabulation', () => {
    monter()
    const tabIndex = screen.getAllByRole('tab').map((b) => b.getAttribute('tabindex'))
    expect(tabIndex).toEqual(['0', '-1', '-1'])
  })

  it('relie chaque onglet à son panneau', () => {
    monter()
    const onglet = screen.getByRole('tab', { selected: true })
    const panneau = screen.getByRole('tabpanel')
    expect(onglet.getAttribute('aria-controls')).toBe(panneau.id)
    expect(panneau.getAttribute('aria-labelledby')).toBe(onglet.id)
  })
})
