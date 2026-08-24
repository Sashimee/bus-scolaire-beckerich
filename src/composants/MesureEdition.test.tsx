/**
 * Le tableau de fréquentation, côté écran (lots 27-28).
 *
 * On vérifie qu'il rend le total, la répartition par écran avec des noms lisibles
 * (« Accueil » pour `/`, « Autre » pour `autre`, le chemin sinon), et qu'il dit vide ou
 * en échec quand il le faut. La lecture réseau est simulée.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FournisseurTraduction } from '../i18n'

const lireMesures = vi.fn()
vi.mock('../lib/edition', () => ({ lireMesures: (...a: unknown[]) => lireMesures(...a) }))

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })

import { MesureEdition } from './MesureEdition'

const session = { jeton: 'x', capacites: [] } as never
const monter = () =>
  render(
    <FournisseurTraduction>
      <MesureEdition session={session} />
    </FournisseurTraduction>,
  )

describe('MesureEdition', () => {
  it('rend le total et la répartition par écran, avec des noms lisibles', async () => {
    lireMesures.mockResolvedValue({
      total: 42,
      parJour: [{ jour: '2026-09-16', vues: 42 }],
      parChemin: [
        { chemin: '/', vues: 30 },
        { chemin: '/plan', vues: 9 },
        { chemin: 'autre', vues: 3 },
      ],
    })
    monter()

    expect(await screen.findByText(/42 visites sur 30 jours/)).toBeTruthy()
    // `/` devient « Accueil », `autre` devient « Autre », un chemin connu reste tel quel.
    expect(screen.getByText('Accueil')).toBeTruthy()
    expect(screen.getByText('Autre')).toBeTruthy()
    expect(screen.getByText('/plan')).toBeTruthy()
    expect(screen.getByText('30')).toBeTruthy()
  })

  it('dit quand rien n’a été mesuré', async () => {
    lireMesures.mockResolvedValue({ total: 0, parJour: [], parChemin: [] })
    monter()
    expect(await screen.findByText('Aucune visite enregistrée.')).toBeTruthy()
  })

  it('dit quand la lecture échoue', async () => {
    lireMesures.mockRejectedValue(new Error('réseau'))
    monter()
    expect(await screen.findByText('La fréquentation n\'a pas pu être lue.')).toBeTruthy()
  })
})
