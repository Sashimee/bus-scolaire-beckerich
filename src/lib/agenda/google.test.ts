import { describe, expect, it } from 'vitest'
import { googleConfigure } from './google'

describe('activation de l’intégration Google', () => {
  it('reste inerte tant qu’aucun identifiant valable n’est posé', () => {
    // `VITE_ID_CLIENT_GOOGLE` n'est pas défini dans les tests : la fonctionnalité doit
    // rester absente, et non apparaître cassée.
    expect(googleConfigure()).toBe(false)
  })
})
