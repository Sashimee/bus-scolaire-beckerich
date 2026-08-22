import { afterEach, describe, expect, it } from 'vitest'
import { entetesCors, ipDeLaRequete, originesPermises, retourAutorise } from './http.ts'

const entetes = (o: Record<string, string>) => new Headers(o)

afterEach(() => {
  delete process.env.ORIGINES_AUTORISEES
  delete process.env.NB_PROXYS_FIABLES
})

/**
 * Réserve R40. Une erreur ici ne se voit nulle part : la limitation de débit devient
 * un seau global, tout le monde partage cinq tentatives, et rien ne le signale. Ces
 * tests sont la seule chose qui empêche la panne de passer inaperçue.
 */
describe('ipDeLaRequete', () => {
  it("prend l'adresse constatée par le proxy, pas celle que le client s'attribue", () => {
    // Le client prétend être 1.2.3.4 ; Traefik ajoute derrière ce qu'il a vraiment vu.
    const ip = ipDeLaRequete(entetes({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))
    expect(ip).toBe('203.0.113.9')
  })

  it('ne se laisse pas donner une adresse neuve à chaque tentative', () => {
    const a = ipDeLaRequete(entetes({ 'x-forwarded-for': 'aa, 203.0.113.9' }))
    const b = ipDeLaRequete(entetes({ 'x-forwarded-for': 'bb, 203.0.113.9' }))
    // Deux tentatives forgées différemment doivent tomber dans le MÊME seau.
    expect(a).toBe(b)
  })

  it('remonte de deux rangs quand deux relais sont déclarés', () => {
    process.env.NB_PROXYS_FIABLES = '2'
    const ip = ipDeLaRequete(entetes({ 'x-forwarded-for': 'faux, 203.0.113.9, 10.0.0.1' }))
    expect(ip).toBe('203.0.113.9')
  })

  it('accepte un en-tête à une seule entrée', () => {
    expect(ipDeLaRequete(entetes({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it("retombe sur l'adresse du pair quand l'en-tête est absent", () => {
    expect(ipDeLaRequete(entetes({}), '198.51.100.4')).toBe('198.51.100.4')
  })

  it("ne renvoie jamais la chaîne vide, qui ferait un seau commun sans qu'on le voie", () => {
    expect(ipDeLaRequete(entetes({ 'x-forwarded-for': '   ,  ' }))).toBe('inconnue')
    expect(ipDeLaRequete(entetes({}), '')).toBe('inconnue')
  })

  it("n'utilise plus CF-Connecting-IP, qui n'existe pas derrière Traefik", () => {
    // Si quelqu'un remet un jour cet en-tête, il ne doit pas court-circuiter le reste.
    const ip = ipDeLaRequete(
      entetes({ 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '203.0.113.9' }),
    )
    expect(ip).toBe('203.0.113.9')
  })
})

describe('CORS', () => {
  it("ne renvoie une origine que si elle est déclarée", () => {
    process.env.ORIGINES_AUTORISEES = 'https://app.schoulbus.lu,https://sashimee.github.io'
    expect(entetesCors('https://sashimee.github.io', false)['Access-Control-Allow-Origin']).toBe(
      'https://sashimee.github.io',
    )
    // Une origine inconnue reçoit la première déclarée, jamais la sienne.
    expect(entetesCors('https://mechant.example', false)['Access-Control-Allow-Origin']).toBe(
      'https://app.schoulbus.lu',
    )
  })

  it("n'ouvre l'en-tête Authorization que pour les espaces à code personnel", () => {
    process.env.ORIGINES_AUTORISEES = 'https://app.schoulbus.lu'
    expect(entetesCors('https://app.schoulbus.lu', false)['Access-Control-Allow-Headers']).toBe(
      'Content-Type',
    )
    expect(entetesCors('https://app.schoulbus.lu', true)['Access-Control-Allow-Headers']).toContain(
      'Authorization',
    )
  })

  it('sans origine déclarée, ferme au lieu de tout ouvrir', () => {
    expect(originesPermises()).toEqual([])
    expect(entetesCors('https://x.example', false)['Access-Control-Allow-Origin']).toBe('null')
  })
})

describe('retourAutorise', () => {
  it("refuse une origine non déclarée — sinon le serveur est une redirection ouverte", () => {
    process.env.ORIGINES_AUTORISEES = 'https://app.schoulbus.lu'
    expect(retourAutorise('https://app.schoulbus.lu/admin')?.href).toBe(
      'https://app.schoulbus.lu/admin',
    )
    expect(retourAutorise('https://mechant.example/vol')).toBeNull()
    expect(retourAutorise('pas une url')).toBeNull()
  })
})

describe('aJeton', () => {
  it("reconnaît les espaces à code personnel une fois montés sous /api", async () => {
    const { aJeton } = await import('./index.ts')
    expect(aJeton('/api/commune/connexion')).toBe(true)
    expect(aJeton('/api/commune/perturbations/abc')).toBe(true)
    expect(aJeton('/api/traductions/publier')).toBe(true)
  })

  it('ne les confond pas avec les routes ordinaires', async () => {
    const { aJeton } = await import('./index.ts')
    expect(aJeton('/api/sante')).toBe(false)
    expect(aJeton('/api/abonner')).toBe(false)
    // Un chemin qui contient le mot sans être l'espace ne doit pas déclencher.
    expect(aJeton('/api/notifier/commune/x')).toBe(false)
  })

  it("suit BASE_API quand il change, plutôt que de supposer /api", async () => {
    const { aJeton } = await import('./index.ts')
    expect(aJeton('/commune/journal', '/')).toBe(true)
    expect(aJeton('/serveur/commune/journal', '/serveur')).toBe(true)
  })
})
