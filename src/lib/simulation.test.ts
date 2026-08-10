import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dateSimulee,
  definirSimulationActive,
  definirValeurSimulee,
  maintenantSimule,
  simulationActive,
  valeurSimulee,
} from './simulation'

/**
 * jsdom ne fournit pas `localStorage` sous ce banc d'essai — le module s'y croit dans
 * un navigateur sans stockage et retombe silencieusement sur ses défauts, ce qui ne
 * vérifierait rien. On lui en pose un, en mémoire, réduit à ce qui sert ici.
 */
const memoire = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (c: string) => memoire.get(c) ?? null,
  setItem: (c: string, v: string) => void memoire.set(c, v),
  removeItem: (c: string) => void memoire.delete(c),
})

describe('simulation de date', () => {
  beforeEach(() => memoire.clear())

  it('reste éteinte tant que personne ne l’a demandée', () => {
    expect(simulationActive()).toBe(false)
    expect(dateSimulee()).toBeNull()
  })

  it('lit la date saisie comme une date locale', () => {
    // `new Date('2026-02-16T07:30')` conviendrait, mais `new Date('2026-02-16')` serait
    // lu en UTC : à l'ouest de Greenwich, le lundi de Carnaval deviendrait un dimanche
    // et l'outil censé traquer ce genre d'erreur en produirait une.
    definirSimulationActive(true)
    definirValeurSimulee('2026-02-16T07:30')

    const d = dateSimulee()!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(1)
    expect(d.getDate()).toBe(16)
    expect(d.getHours()).toBe(7)
    expect(d.getMinutes()).toBe(30)
  })

  it('ignore une date saisie si la case n’est pas cochée', () => {
    // Le réglage vit dans le même stockage que le reste : une date restée d'une session
    // de mise au point ne doit pas décaler l'écran d'un parent.
    definirValeurSimulee('2026-02-16T07:30')
    expect(valeurSimulee()).toBe('')
    expect(dateSimulee()).toBeNull()
  })

  it('rend l’heure réelle dès que la simulation est coupée', () => {
    definirSimulationActive(true)
    definirValeurSimulee('2026-02-16T07:30')
    expect(maintenantSimule().getFullYear()).toBe(2026)

    definirSimulationActive(false)
    // La date est oubliée avec la case : sans cela elle ressortirait telle quelle à la
    // prochaine activation, sans qu'on sache d'où elle vient.
    expect(valeurSimulee()).toBe('')
    definirSimulationActive(true)
    expect(valeurSimulee()).toBe('')
    expect(dateSimulee()).toBeNull()
  })

  it('refuse une saisie incomplète plutôt que d’inventer une heure', () => {
    definirSimulationActive(true)
    definirValeurSimulee('2026-02-16')
    expect(dateSimulee()).toBeNull()
  })
})
