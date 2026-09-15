/**
 * Le compte des abonnés, côté écran.
 *
 * Ce qui est vérifié ici n'est pas seulement le nombre : ce sont les deux NUANCES qui
 * l'accompagnent. Un total sans elles se lit comme un nombre de familles joignables, et
 * c'est précisément ce qu'il n'est pas. La lecture réseau est simulée.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FournisseurTraduction } from '../i18n'

const lireAbonnes = vi.fn()
vi.mock('../lib/edition', () => ({ lireAbonnes: (...a: unknown[]) => lireAbonnes(...a) }))

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })

import { AbonnesEdition } from './AbonnesEdition'

const session = { jeton: 'x', capacites: [] } as never
const monter = () =>
  render(
    <FournisseurTraduction>
      <AbonnesEdition session={session} />
    </FournisseurTraduction>,
  )

describe('AbonnesEdition', () => {
  it('rend le total et la répartition par préférence, avec des libellés lisibles', async () => {
    lireAbonnes.mockResolvedValue({
      total: 7,
      ayantRecu: 2,
      parPreference: [
        { preference: 'tout', n: 4 },
        { preference: 'urgences', n: 3 },
      ],
      premier: '2026-08-20T08:00:00.000Z',
      dernier: '2026-09-14T20:00:00.000Z',
    })
    monter()

    expect(await screen.findByText(/7 abonnements/)).toBeTruthy()
    expect(screen.getByText('Tout')).toBeTruthy()
    expect(screen.getByText('Seulement les urgences')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('dit les deux nuances : un navigateur n’est pas une personne, et tous n’ont rien reçu', async () => {
    lireAbonnes.mockResolvedValue({
      total: 7,
      ayantRecu: 2,
      parPreference: [{ preference: 'tout', n: 7 }],
      premier: '2026-08-20T08:00:00.000Z',
      dernier: '2026-09-14T20:00:00.000Z',
    })
    monter()

    expect(await screen.findByText(/pas une personne/)).toBeTruthy()
    expect(screen.getByText(/2 ont déjà reçu une notification/)).toBeTruthy()
  })

  it('affiche une préférence inconnue telle quelle plutôt que sa clé de traduction', async () => {
    lireAbonnes.mockResolvedValue({
      total: 1,
      ayantRecu: 0,
      parPreference: [{ preference: 'inventee', n: 1 }],
      premier: null,
      dernier: null,
    })
    monter()

    expect(await screen.findByText('inventee')).toBeTruthy()
  })

  it('dit quand personne n’est abonné', async () => {
    lireAbonnes.mockResolvedValue({
      total: 0,
      ayantRecu: 0,
      parPreference: [],
      premier: null,
      dernier: null,
    })
    monter()
    expect(await screen.findByText('Aucun abonnement enregistré.')).toBeTruthy()
  })

  it('dit quand la lecture échoue', async () => {
    lireAbonnes.mockRejectedValue(new Error('réseau'))
    monter()
    expect(await screen.findByText("Le compte des abonnés n'a pas pu être lu.")).toBeTruthy()
  })
})
