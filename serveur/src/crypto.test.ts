/**
 * Portés depuis `worker/src/commune.test.js`. Les primitives n'ont pas changé d'une
 * ligne au passage sur Node : leurs tests non plus, au typage près.
 */
import { describe, expect, it } from 'vitest'
import { egalConstant, empreinte, signerJeton, verifierJeton } from './crypto.ts'

const SECRET = 'secret-de-test-assez-long-pour-hmac'

describe('comparaison à temps constant', () => {
  it('reconnaît deux chaînes identiques', () => {
    expect(egalConstant('abc', 'abc')).toBe(true)
  })

  it('refuse tout ce qui diffère, y compris par la longueur', () => {
    expect(egalConstant('abc', 'abd')).toBe(false)
    expect(egalConstant('abc', 'abcd')).toBe(false)
    expect(egalConstant('abc', undefined)).toBe(false)
  })
})

describe('empreinte', () => {
  it('rend la même empreinte que shasum -a 256, en hexadécimal minuscule', async () => {
    // Vecteur connu : l'empreinte de la chaîne vide. Si l'encodage changeait, tous les
    // codes d'agents repris de l'ancien stockage cesseraient d'ouvrir quoi que ce soit.
    expect(await empreinte('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(await empreinte('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('jeton de session', () => {
  const charge = (extra: Record<string, unknown> = {}) =>
    ({ nom: 'Marie', service: 'technique', role: 'commune', expire: Date.now() / 1000 + 60, ...extra }) as never

  it('fait un aller-retour sans perte', async () => {
    const jeton = await signerJeton(charge(), SECRET)
    const relu = await verifierJeton(jeton, SECRET)
    expect(relu?.nom).toBe('Marie')
    expect(relu?.service).toBe('technique')
    expect(relu?.role).toBe('commune')
  })

  it('refuse un jeton signé avec un autre secret', async () => {
    const jeton = await signerJeton(charge(), 'autre')
    expect(await verifierJeton(jeton, SECRET)).toBeNull()
  })

  it('refuse un jeton dont la charge a été retouchée', async () => {
    const jeton = await signerJeton(charge(), SECRET)
    const [, signature] = jeton.split('.')
    const forge = btoa(JSON.stringify({ nom: 'Pirate', expire: Date.now() / 1000 + 99999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(await verifierJeton(`${forge}.${signature}`, SECRET)).toBeNull()
  })

  it("refuse un jeton expiré — l'expiration est DANS la charge signée", async () => {
    const jeton = await signerJeton(charge({ expire: Date.now() / 1000 - 1 }), SECRET)
    expect(await verifierJeton(jeton, SECRET)).toBeNull()
  })

  it('refuse ce qui ne ressemble pas à un jeton', async () => {
    expect(await verifierJeton('', SECRET)).toBeNull()
    expect(await verifierJeton('n-importe-quoi', SECRET)).toBeNull()
    expect(await verifierJeton(null, SECRET)).toBeNull()
    expect(await verifierJeton('a.b.c', SECRET)).toBeNull()
  })
})
