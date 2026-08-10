import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { googleConfigure, oublierAgendas, synchroniserEnfant } from './google'
import type { EvenementRecurrent } from './evenements'

describe('activation de l’intégration Google', () => {
  it('reste inerte tant qu’aucun identifiant valable n’est posé', () => {
    // `VITE_ID_CLIENT_GOOGLE` n'est pas défini dans les tests : la fonctionnalité doit
    // rester absente, et non apparaître cassée.
    expect(googleConfigure()).toBe(false)
  })
})

const EVENEMENT: EvenementRecurrent = {
  id: 'lea-aller',
  titre: 'Bus — aller',
  lieu: 'Beckerich, Kierch',
  heure: '07:25',
  duree: 20,
  jours: ['lundi', 'mardi'],
  exclusions: [],
  rappel: 10,
  description: 'Départ du bus',
  debut: '2026-09-15',
  fin: '2027-07-15',
}

/** Réponse Google minimale : un corps JSON et un statut. */
const reponse = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status: statut })

const REFUS_401 = {
  error: { message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' },
}
const REFUS_403 = { error: { message: 'Request had insufficient authentication scopes.' } }
const ABSENT_404 = { error: { message: 'Not Found', status: 'NOT_FOUND' } }

/** Journal des appels, sous la forme « MÉTHODE chemin ». */
let appels: string[] = []

/**
 * Un Google simulé : l'agenda existe ou non, les événements n'existent pas encore.
 * `sur` permet de forcer la réponse d'un appel précis.
 */
function googleSimule(sur: (methode: string, chemin: string) => Response | null = () => null) {
  appels = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit = {}) => {
      const methode = options.method ?? 'GET'
      const chemin = url.replace('https://www.googleapis.com/calendar/v3', '')
      appels.push(`${methode} ${chemin}`)
      const forcee = sur(methode, chemin)
      if (forcee) return forcee
      if (methode === 'POST' && chemin === '/calendars') return reponse(200, { id: 'agenda-neuf' })
      // `events.update` ne crée pas : sans événement préexistant, Google répond 404.
      if (methode === 'PUT') return reponse(404, ABSENT_404)
      return reponse(200, {})
    }),
  )
}

/** L'environnement de test ne fournit pas `localStorage`, dont vit la mémoire des agendas. */
function memoireLocale() {
  const contenu = new Map<string, string>()
  return {
    getItem: (cle: string) => contenu.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => void contenu.set(cle, valeur),
    removeItem: (cle: string) => void contenu.delete(cle),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoireLocale())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('synchronisation d’un enfant', () => {
  it('ne liste jamais les agendas du parent', async () => {
    // `calendarList.list` n'accepte pas la portée `calendar.app.created` : cet appel
    // répondait « 403 insufficient authentication scopes » avant toute écriture, et
    // faisait accuser à tort la configuration du projet Google.
    googleSimule()
    await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])
    expect(appels.some((a) => a.includes('calendarList'))).toBe(false)
  })

  it('crée l’agenda de l’enfant, puis le réutilise à la synchronisation suivante', async () => {
    googleSimule()
    const premiere = await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])
    expect(premiere).toEqual({ agenda: 'Bus scolaire — Léa', ecrits: 1, echecs: 0 })
    expect(appels.filter((a) => a === 'POST /calendars')).toHaveLength(1)

    // Deuxième passage : l'identifiant retenu est vérifié, pas un second agenda créé.
    googleSimule((methode) => (methode === 'PUT' ? reponse(200, {}) : null))
    const seconde = await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])
    expect(seconde.ecrits).toBe(1)
    expect(appels).toEqual([
      'GET /calendars/agenda-neuf',
      'PUT /calendars/agenda-neuf/events/lea0aller',
    ])
  })

  it('crée l’événement absent au lieu de compter un échec', async () => {
    // `PUT` seul n'écrivait rien à la première synchronisation : 404 sur chaque
    // événement, comptés en échecs silencieux, et « 0 rendez-vous écrits » annoncé
    // comme une réussite.
    googleSimule()
    const r = await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])
    expect(r.ecrits).toBe(1)
    expect(appels).toContain('POST /calendars/agenda-neuf/events')
  })

  it('refait un agenda quand le parent a supprimé le sien', async () => {
    googleSimule()
    await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])

    googleSimule((methode, chemin) =>
      methode === 'GET' && chemin.startsWith('/calendars/') ? reponse(404, ABSENT_404) : null,
    )
    const r = await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])
    expect(r.ecrits).toBe(1)
    expect(appels).toContain('POST /calendars')
  })

  it('oublie les agendas retenus à l’effacement des données locales', async () => {
    // Sans cela, un parent qui efface tout verrait la synchronisation suivante réécrire
    // dans les agendas dont il croyait avoir coupé le lien.
    googleSimule()
    await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])
    oublierAgendas()

    googleSimule()
    await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])
    expect(appels).toContain('POST /calendars')
  })

  it('remonte un jeton refusé au lieu de le compter comme un échec d’écriture', async () => {
    // Le jeton reste en session bien après que Google l'ait invalidé — expiration
    // anticipée, ou accès retiré depuis le compte.
    googleSimule((methode, chemin) =>
      chemin.includes('/events') || methode === 'PUT' ? reponse(401, REFUS_401) : null,
    )

    await expect(synchroniserEnfant('jeton-mort', 'Léa', [EVENEMENT])).rejects.toMatchObject({
      statut: 401,
    })
  })

  it('ne crée pas un second agenda quand le jeton est refusé', async () => {
    googleSimule()
    await synchroniserEnfant('jeton', 'Léa', [EVENEMENT])

    googleSimule(() => reponse(401, REFUS_401))
    await expect(synchroniserEnfant('jeton-mort', 'Léa', [EVENEMENT])).rejects.toMatchObject({
      statut: 401,
    })
    expect(appels).toEqual(['GET /calendars/agenda-neuf'])
  })

  it('nomme la portée manquante plutôt que de laisser passer le message de Google', async () => {
    // Un jeton obtenu avant que la portée soit déclarée ne repasse jamais par le
    // contrôle de la connexion : c'est ici qu'il faut le reconnaître.
    googleSimule(() => reponse(403, REFUS_403))

    await expect(synchroniserEnfant('jeton-court', 'Léa', [EVENEMENT])).rejects.toThrow(
      'portee-absente',
    )
  })

  it('remonte une portée absente rencontrée à l’écriture', async () => {
    googleSimule((methode) => (methode === 'PUT' ? reponse(403, REFUS_403) : null))

    await expect(synchroniserEnfant('jeton-court', 'Léa', [EVENEMENT])).rejects.toThrow(
      'portee-absente',
    )
  })

  it('compte les échecs d’écriture ordinaires sans interrompre la série', async () => {
    // Un événement refusé pour lui-même — corps rejeté, quota — ne dit rien des
    // suivants : la synchronisation continue.
    let ecriture = 0
    googleSimule((methode) => {
      if (methode !== 'PUT') return null
      ecriture++
      return ecriture === 1
        ? reponse(400, { error: { message: 'Invalid resource id value.' } })
        : reponse(200, {})
    })

    const r = await synchroniserEnfant('jeton', 'Léa', [
      EVENEMENT,
      { ...EVENEMENT, id: 'lea-retour' },
    ])
    expect(r).toEqual({ agenda: 'Bus scolaire — Léa', ecrits: 1, echecs: 1 })
  })
})
