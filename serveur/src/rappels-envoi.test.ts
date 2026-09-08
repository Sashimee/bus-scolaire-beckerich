/**
 * Le journal de livraison des rappels (lot 26).
 *
 * La décision — quel créneau, combien de fois — est testée telle quelle dans
 * `rappels.test.js`, sans réseau ni base. Ce fichier-ci teste la PLOMBERIE ajoutée au
 * lot 26 : qu'un rappel envoyé laisse une trace dans le journal, sous l'auteur
 * « système », avec le compte des envois — sans quoi rien ne dit ce qui est parti à
 * 06:45 (réserve R7). L'envoi lui-même (`envoyerATous`) est simulé : il parle aux
 * services de push d'Apple, Google et Mozilla, hors de portée d'un banc.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { plan as planEmbarque } from '../../src/lib/donnees.ts'

// Simulé avant tout import : `envoyerATous` importe les clés VAPID et sort vers le
// réseau. On lui substitue un envoi qui « réussit » pour trois abonnés.
const envoyerATousSimule = vi.fn(async (_charge: { rappel?: boolean }) => ({
  envoyees: 3,
  echecs: 0,
  purgees: 0,
  details: [] as unknown[],
  total: 3,
}))
vi.mock('./envois.ts', () => ({ envoyerATous: envoyerATousSimule }))

const SCHEMA = 'essai_rappels'
const avecBase = Boolean(process.env.DATABASE_URL_TEST)

let db: postgres.Sql
let envoyerRappels: (maintenant?: Date) => Promise<{ rappels: number }>
let enregistrerPerturbation: (id: string, donnees: unknown) => Promise<unknown>
let ecrireDocument: (nom: 'horaires', contenu: unknown, version: string) => Promise<unknown>
let lireEphemere: <T>(cle: string) => Promise<T | null>
let etatDuJour: (d: Date) => { ecole: boolean }

/** Le 16 septembre 2026 est un mercredi de classe (rentrée le 15, hors vacances). */
const SEPT_16 = '2026-09-16'
/** 05:15 UTC = 07:15 à Beckerich (heure d'été) : un créneau de rappel du matin. */
const AU_CRENEAU = new Date('2026-09-16T05:15:00Z')

const alerte = (extra: Record<string, unknown> = {}) => ({
  id: 'u-rappel',
  type: 'annulation',
  gravite: 'alerte',
  du: SEPT_16,
  au: SEPT_16,
  rappels: 3,
  message: { fr: 'Le bus de 07:25 ne circule pas.' },
  ...extra,
})

beforeAll(async () => {
  if (!avecBase) return

  const brut = postgres(process.env.DATABASE_URL_TEST!, { onnotice: () => {} })
  await brut.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await brut.unsafe(`create schema ${SCHEMA}`)
  await brut.end({ timeout: 5 })

  const url = new URL(process.env.DATABASE_URL_TEST!)
  url.searchParams.set('options', `-c search_path=${SCHEMA}`)
  process.env.DATABASE_URL = url.href

  const client = await import('./stockage/client.ts')
  await client.migrer()
  db = client.base()

  envoyerRappels = (await import('./rappels-envoi.ts')).envoyerRappels
  const publications = await import('./stockage/publications.ts')
  enregistrerPerturbation = publications.enregistrerPerturbation
  ecrireDocument = publications.ecrireDocument
  lireEphemere = (await import('./stockage/ephemeres.ts')).lireEphemere
  etatDuJour = (await import('../../src/lib/calendrier.ts')).etatDuJour
}, 30_000)

afterAll(async () => {
  if (!avecBase || !db) return
  await db.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await (await import('./stockage/client.ts')).fermerBase()
})

beforeEach(async () => {
  if (!avecBase) return
  // `document` aussi : un plan publié par un test fausserait les créneaux du suivant.
  await db`truncate perturbation, journal, ephemere, document`
  envoyerATousSimule.mockClear()
})

describe.skipIf(!avecBase)('journal de livraison des rappels', () => {
  it('le 16 septembre 2026 est bien un jour de classe — sinon rien ne serait dû', () => {
    expect(etatDuJour(AU_CRENEAU).ecole).toBe(true)
  })

  it('inscrit chaque rappel envoyé au journal, sous « système », avec le compte des envois', async () => {
    await enregistrerPerturbation('u-rappel', alerte())

    const { rappels } = await envoyerRappels(AU_CRENEAU)
    expect(rappels).toBe(1)
    expect(envoyerATousSimule).toHaveBeenCalledTimes(1)
    // L'envoi porte bien le drapeau « rappel » : c'est lui qui distingue la seconde
    // notification de la première côté téléphone.
    expect(envoyerATousSimule.mock.calls[0][0]).toMatchObject({ rappel: true })

    const lignes = await db`select * from journal where action = 'rappel'`
    expect(lignes).toHaveLength(1)
    expect(lignes[0].qui).toBe('système')
    expect(lignes[0].service).toBe('rappels')
    // Le détail dit quoi, quand, et combien : « u-rappel · rappel 1/3 · 07:15 · 3 envoyée(s), 0 échec(s) ».
    expect(lignes[0].detail).toContain('u-rappel')
    expect(lignes[0].detail).toContain('rappel 1/3')
    expect(lignes[0].detail).toContain('07:15')
    expect(lignes[0].detail).toContain('3 envoyée(s), 0 échec(s)')
  })

  it("avance l'état du rappel, si bien qu'un second tour à la même minute n'en renvoie pas un autre", async () => {
    await enregistrerPerturbation('u-rappel', alerte())

    await envoyerRappels(AU_CRENEAU)
    const etat = await lireEphemere<{ compte: number }>('rappel:u-rappel')
    expect(etat?.compte).toBe(1)

    // Le créneau est consommé : rejouer la même minute ne redéclenche rien, ni envoi ni
    // ligne de journal. C'est la garantie « pas deux fois le même rappel ».
    const { rappels } = await envoyerRappels(AU_CRENEAU)
    expect(rappels).toBe(0)
    expect(await db`select 1 from journal where action = 'rappel'`).toHaveLength(1)
  })

  it('lit le plan PUBLIÉ et non celui embarqué dans l’image', async () => {
    // R66 : `envoyerRappels` importait le plan du dépôt. Les créneaux d'un rappel se
    // déduisent pourtant de la période de la course visée : sur une course qui n'existe
    // que dans le plan publié, le serveur ne la trouvait pas, retombait sur « tous les
    // créneaux » et faisait sonner les téléphones à 07:15 pour un bus de l'après-midi.
    await ecrireDocument(
      'horaires',
      {
        ...planEmbarque,
        lignes: [
          ...planEmbarque.lignes,
          {
            id: 'ligne-publiee',
            nom: 'Ligne publiée',
            direction: 'vers-domicile',
            services: [
              {
                id: 'course-publiee',
                periode: 'apres-midi',
                jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
                arrets: [
                  { arret: 'beckerich-ecole', heure: '15:55' },
                  { arret: 'hovelange-kneppchen', heure: '16:25' },
                ],
              },
            ],
          },
        ],
      },
      'plan-publie',
    )
    await enregistrerPerturbation(
      'u-apres-midi',
      alerte({ id: 'u-apres-midi', service: 'course-publiee' }),
    )

    // 07:15 : aucun créneau d'après-midi n'est échu, donc aucun rappel. Avec le plan
    // embarqué, la course restait introuvable et le créneau de 07:15 s'appliquait.
    expect((await envoyerRappels(AU_CRENEAU)).rappels).toBe(0)
  })

  it("ne journalise rien quand aucune alerte n'est active", async () => {
    // Une simple information ne fait pas sonner, donc ne se rappelle pas.
    await enregistrerPerturbation('u-info', alerte({ id: 'u-info', gravite: 'info' }))
    const { rappels } = await envoyerRappels(AU_CRENEAU)
    expect(rappels).toBe(0)
    expect(await db`select 1 from journal where action = 'rappel'`).toHaveLength(0)
  })
})
