/**
 * L'horloge de l'écran « Aujourd'hui ».
 *
 * Ce qui est en jeu n'est pas l'esthétique d'un compte à rebours : c'est « partir
 * maintenant » qui doit s'afficher à la bonne minute, et un bus déjà passé qui doit
 * disparaître de la liste des départs à venir. Une horloge figée dit sereinement qu'il
 * reste vingt minutes alors que le bus est parti.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useMaintenant } from './horloge'

function Afficheur() {
  const maintenant = useMaintenant()
  return <span data-testid="heure">{maintenant.toTimeString().slice(0, 8)}</span>
}

const lu = () => screen.getByTestId('heure').textContent

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 8, 7, 20, 30))
})
afterEach(() => vi.useRealTimers())

describe('useMaintenant', () => {
  it('bat au changement de minute, et non soixante secondes après le montage', async () => {
    render(<Afficheur />)
    expect(lu()).toBe('07:20:30')

    // 29 s après le montage : la minute n'a pas encore tourné.
    await act(async () => void vi.advanceTimersByTime(29_000))
    expect(lu()).toBe('07:20:30')

    // La trentième seconde fait passer à 07:21, et l'affichage suit.
    await act(async () => void vi.advanceTimersByTime(1_000))
    expect(lu()).toBe('07:21:00')

    // Puis une minute pleine, calée sur l'horloge et non sur le montage.
    await act(async () => void vi.advanceTimersByTime(60_000))
    expect(lu()).toBe('07:22:00')
  })

  /*
   * Le cas qui compte pour une application installée : le téléphone dort, ses minuteries
   * avec lui, et le parent la rouvre à 7 h 45. Sans ce rattrapage il lirait l'heure de
   * son dernier coup d'œil.
   */
  it('se remet à l’heure au retour au premier plan, sans attendre la minute', async () => {
    render(<Afficheur />)

    vi.setSystemTime(new Date(2026, 8, 8, 7, 45, 12))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(lu()).toBe('07:45:12')
  })

  it('ne bat plus une fois l’écran quitté', () => {
    const { unmount } = render(<Afficheur />)
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
