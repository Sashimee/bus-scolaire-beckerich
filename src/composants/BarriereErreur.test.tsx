/**
 * Ce que la barrière promet : plus jamais d'écran blanc.
 *
 * Une exception au rendu n'a longtemps eu qu'une issue — React démonte tout l'arbre et
 * laisse une page vide. Sur un téléphone où l'application est installée, cela ne se
 * distingue pas d'une panne du téléphone lui-même. Ces tests tiennent la promesse
 * inverse : quelque chose de lisible s'affiche, dans la langue du parent, avec au moins
 * un geste possible.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BarriereErreur } from './BarriereErreur'
import fr from '../i18n/fr.json'
import de from '../i18n/de.json'

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

const memoire = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (c: string) => memoire.get(c) ?? null,
    setItem: (c: string, v: string) => void memoire.set(c, v),
    removeItem: (c: string) => void memoire.delete(c),
    clear: () => memoire.clear(),
  },
})

function Casse(): never {
  throw new Error('cycle inconnu : c9')
}

// React écrit la panne interceptée sur la console : attendu ici, et seulement du bruit.
beforeEach(() => {
  memoire.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('barrière d’erreur', () => {
  it('remplace la page effondrée par un message et des issues', () => {
    render(
      <BarriereErreur page>
        <Casse />
      </BarriereErreur>,
    )

    expect(screen.getByText(fr.panne.titre)).toBeDefined()
    expect(screen.getByRole('button', { name: fr.panne.recharger })).toBeDefined()
    expect(screen.getByRole('link', { name: fr.panne.horaires }).getAttribute('href')).toContain(
      '/plan',
    )
  })

  it('laisse passer un rendu sain sans rien y ajouter', () => {
    render(
      <BarriereErreur>
        <p>La semaine de Mia</p>
      </BarriereErreur>,
    )

    expect(screen.getByText('La semaine de Mia')).toBeDefined()
    expect(screen.queryByText(fr.panne.titre)).toBeNull()
  })

  /*
   * Le point sensible : la barrière s'affiche HORS du fournisseur de traduction, qui
   * peut être la cause même de la panne. Elle relit donc la langue du parent depuis le
   * stockage. Servir le message de secours en français à qui a choisi l'allemand, ce
   * serait manquer le seul moment où il compte.
   */
  it('parle la langue choisie par le parent, sans le contexte de traduction', () => {
    memoire.set('bus-beckerich.langue', JSON.stringify('de'))

    render(
      <BarriereErreur page>
        <Casse />
      </BarriereErreur>,
    )

    expect(screen.getByText(de.panne.titre)).toBeDefined()
    expect(screen.queryByText(fr.panne.titre)).toBeNull()
  })

  it('montre le message de la panne, de quoi la signaler', () => {
    render(
      <BarriereErreur page>
        <Casse />
      </BarriereErreur>,
    )

    expect(screen.getByText('cycle inconnu : c9')).toBeDefined()
  })

  /*
   * L'effacement est le dernier recours quand ce sont les données locales qui font
   * tomber le rendu. Il ne se rattrape pas : il doit rester derrière un dépli, jamais
   * à portée d'un doigt qui cherchait « Recharger ».
   */
  it('ne met pas l’effacement à portée immédiate', () => {
    render(
      <BarriereErreur page>
        <Casse />
      </BarriereErreur>,
    )

    const confirmer = screen.getByRole('button', { name: fr.panne.effacerConfirmer })
    expect(confirmer.closest('details')?.open).toBe(false)
  })
})
