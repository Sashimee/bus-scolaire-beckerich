/**
 * Les refus du serveur, tels que l'éditeur les reçoit.
 *
 * Le cas qui compte est `session-expiree` : il a déjà fait croire à une publication
 * partie alors que le serveur l'avait refusée avant même de la journaliser. Un jeton
 * refusé doit disparaître du stockage, sans quoi l'écran d'édition se rouvre comme si
 * l'on était connecté et échoue à la publication suivante.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErreurEdition, publierPerturbation } from './edition'
import type { SessionCompte } from './comptes'
import type { Perturbation } from './urgences'

const CLE_SESSION = 'bus-beckerich.session-compte'

const session: SessionCompte = {
  jeton: 'jeton-signe',
  courriel: 'agent@beckerich.lu',
  nom: 'Agent',
  capacites: ['perturbations'],
  service: 'Commune',
  langue: 'fr',
  expire: Math.floor(Date.now() / 1000) + 3600,
}

const perturbation = { id: 'u-1', type: 'message' } as unknown as Perturbation

const repond = (statut: number, corps: unknown) =>
  vi.fn().mockResolvedValue({
    ok: statut < 400,
    status: statut,
    json: () => Promise.resolve(corps),
  } as unknown as Response)

beforeEach(() => {
  sessionStorage.setItem(CLE_SESSION, JSON.stringify(session))
})

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('publierPerturbation', () => {
  it('oublie la session quand le serveur refuse le jeton', async () => {
    vi.stubGlobal('fetch', repond(401, { erreur: 'session-expiree' }))

    await expect(publierPerturbation(session, perturbation)).rejects.toMatchObject({
      motif: 'session-expiree',
    })
    expect(sessionStorage.getItem(CLE_SESSION)).toBeNull()
  })

  it('oublie la session où qu’elle soit rangée, « rester connecté » compris', async () => {
    sessionStorage.clear()
    localStorage.setItem(CLE_SESSION, JSON.stringify(session))
    vi.stubGlobal('fetch', repond(401, { erreur: 'session-expiree' }))

    await expect(publierPerturbation(session, perturbation)).rejects.toBeInstanceOf(ErreurEdition)
    expect(localStorage.getItem(CLE_SESSION)).toBeNull()
  })

  it('garde la session quand le refus porte sur la perturbation, non sur le jeton', async () => {
    vi.stubGlobal('fetch', repond(400, { erreur: 'charge-invalide', motifs: ['message'] }))

    await expect(publierPerturbation(session, perturbation)).rejects.toMatchObject({
      motif: 'charge-invalide',
      detail: ['message'],
    })
    // Le brouillon est corrigible sur place : déconnecter ici ferait perdre la saisie.
    expect(sessionStorage.getItem(CLE_SESSION)).not.toBeNull()
  })

  it('garde la session quand le réseau tombe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('hors ligne')))

    await expect(publierPerturbation(session, perturbation)).rejects.toMatchObject({
      motif: 'reseau',
    })
    expect(sessionStorage.getItem(CLE_SESSION)).not.toBeNull()
  })
})
