/**
 * Le journal, côté écran (lot 26).
 *
 * On vérifie qu'il rend chaque entrée avec un libellé d'action traduit — un rappel parti
 * tout seul s'y lit « Rappel » — et qu'une action inconnue retombe sur son identifiant
 * brut plutôt que sur une clé i18n crue. La lecture réseau est simulée.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FournisseurTraduction } from '../i18n'

const lireJournal = vi.fn()
vi.mock('../lib/edition', () => ({ lireJournal: (...a: unknown[]) => lireJournal(...a) }))

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })

import { JournalEdition } from './JournalEdition'

const session = { jeton: 'x', capacites: [] } as never

const monter = () =>
  render(
    <FournisseurTraduction>
      <JournalEdition session={session} />
    </FournisseurTraduction>,
  )

describe('JournalEdition', () => {
  it('rend chaque entrée avec un libellé d’action traduit, rappels compris', async () => {
    lireJournal.mockResolvedValue([
      { quand: '2026-09-16T05:15:00Z', qui: 'système', service: 'rappels', action: 'rappel', detail: 'u-1 · rappel 1/3 · 07:15 · 3 envoyée(s), 0 échec(s)' },
      { quand: '2026-09-15T08:00:00Z', qui: 'Marie', service: '', action: 'publication', detail: 'annulation u-1' },
    ])
    monter()

    // Le rappel : libellé traduit + son auteur système + son détail.
    expect(await screen.findByText('Rappel')).toBeTruthy()
    expect(screen.getByText('système')).toBeTruthy()
    expect(screen.getByText(/3 envoyée\(s\), 0 échec\(s\)/)).toBeTruthy()
    // Une publication ordinaire garde son libellé.
    expect(screen.getByText('Publication')).toBeTruthy()
  })

  it('retombe sur l’identifiant brut pour une action sans traduction', async () => {
    lireJournal.mockResolvedValue([
      { quand: '2026-09-16T05:15:00Z', qui: 'système', service: '', action: 'action-inventee', detail: '—' },
    ])
    monter()
    // Pas la clé crue « commune.journalAction.action-inventee », mais l'action elle-même.
    expect(await screen.findByText('action-inventee')).toBeTruthy()
  })

  it('dit quand le journal est vide', async () => {
    lireJournal.mockResolvedValue([])
    monter()
    expect(await screen.findByText('Rien de publié pour l\'instant.')).toBeTruthy()
  })

  it('dit quand la lecture échoue', async () => {
    lireJournal.mockRejectedValue(new Error('réseau'))
    monter()
    expect(await screen.findByText(/n'a pas pu être lu/)).toBeTruthy()
  })
})
