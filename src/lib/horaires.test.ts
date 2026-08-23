/**
 * Amorçage des horaires (lot 25). Le point sensible : un plan malformé ne doit JAMAIS
 * remplacer un plan valide — une erreur ici ferait rater un bus. On vérifie donc que le
 * remplacement n'a lieu QUE sur un plan qui passe la validation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// URL_API doit être non vide pour que le chemin réseau s'exécute.
vi.mock('../config', () => ({ URL_API: 'https://api.test' }))

const planBundle = (await import('../data/plan-2025-2026.json')).default

async function fraisImports() {
  vi.resetModules()
  const donnees = await import('./donnees')
  const { initialiserHoraires } = await import('./horaires')
  return { donnees, initialiserHoraires }
}

const reponse = (corps: unknown, ok = true) =>
  ({ ok, json: async () => corps }) as Response

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
afterEach(() => localStorage.clear())

describe('initialiserHoraires', () => {
  it('adopte un plan publié valide', async () => {
    const { donnees, initialiserHoraires } = await fraisImports()
    const planPublie = { ...(planBundle as any), incertitudes: [] }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reponse({ version: '2026-09-01', plan: planPublie }),
    )
    await initialiserHoraires()
    // Le plan a bien changé de version : l'objet servi est adopté.
    expect(donnees.plan).toBe(planPublie)
    // Et il est mis en cache pour la prochaine ouverture.
    expect(JSON.parse(localStorage.getItem('bus-beckerich.horaires')!).version).toBe('2026-09-01')
  })

  it('REFUSE un plan malformé et garde le plan embarqué', async () => {
    const { donnees, initialiserHoraires } = await fraisImports()
    const avant = donnees.plan
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reponse({ version: '2026-09-01', plan: { lignes: 'pas une liste' } }),
    )
    await initialiserHoraires()
    expect(donnees.plan).toBe(avant)
    expect(localStorage.getItem('bus-beckerich.horaires')).toBeNull()
  })

  it('n\'adopte rien quand aucun plan n\'est publié (version « embarque »)', async () => {
    const { donnees, initialiserHoraires } = await fraisImports()
    const avant = donnees.plan
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reponse({ version: 'embarque', plan: planBundle }),
    )
    await initialiserHoraires()
    expect(donnees.plan).toBe(avant)
  })

  it('hors ligne (fetch qui échoue), garde le repli sans lever', async () => {
    const { donnees, initialiserHoraires } = await fraisImports()
    const avant = donnees.plan
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(initialiserHoraires()).resolves.toBeUndefined()
    expect(donnees.plan).toBe(avant)
  })

  it('repart du cache local avant même le réseau', async () => {
    const planCache = { ...(planBundle as any), incertitudes: [] }
    localStorage.setItem('bus-beckerich.horaires', JSON.stringify({ version: 'v-cache', plan: planCache }))
    const { donnees, initialiserHoraires } = await fraisImports()
    // Réseau muet : seul le cache agit.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await initialiserHoraires()
    expect(donnees.plan).toEqual(planCache)
  })
})
