/**
 * Tests de bout en bout de l'espace comptes (lot 24).
 *
 * Contre la vraie application Hono et une vraie base, par `app.request()` : le routage,
 * les intergiciels, argon2id, la limitation de débit et le stockage sont tous traversés.
 * Le courriel est en mode CAPTURE (`COURRIEL_CAPTURE=1`) : les liens d'activation et de
 * réinitialisation s'empilent en mémoire, ce qui permet de vérifier tout le parcours —
 * création, activation, connexion — sans relai.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'

const SCHEMA = 'essai_comptes'
const SECRET = 'secret-de-test-assez-long-pour-hmac'
const avecBase = Boolean(process.env.DATABASE_URL_TEST)

let app: { request: (...a: any[]) => Promise<Response> }
let db: postgres.Sql
let courrielsCaptures: { a: string; sujet: string; texte: string }[]
let stock: typeof import('../stockage/utilisateurs.ts')
let hacherMotDePasse: (m: string) => Promise<string>

beforeAll(async () => {
  if (!avecBase) return

  const brut = postgres(process.env.DATABASE_URL_TEST!, { onnotice: () => {} })
  await brut.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await brut.unsafe(`create schema ${SCHEMA}`)
  await brut.end({ timeout: 5 })

  const url = new URL(process.env.DATABASE_URL_TEST!)
  url.searchParams.set('options', `-c search_path=${SCHEMA}`)
  process.env.DATABASE_URL = url.href
  process.env.SECRET_SESSION = SECRET
  process.env.ORIGINES_AUTORISEES = 'https://app.schoulbus.lu'
  process.env.URL_SITE = 'https://app.schoulbus.lu'
  process.env.BASE_API = '/api'
  process.env.COURRIEL_CAPTURE = '1'

  const client = await import('../stockage/client.ts')
  await client.migrer()
  db = client.base()

  stock = await import('../stockage/utilisateurs.ts')
  hacherMotDePasse = (await import('../comptes/argon.ts')).hacherMotDePasse
  courrielsCaptures = (await import('../courriel.ts')).courrielsCaptures

  app = (await import('../index.ts')).creerApplication() as never
}, 30_000)

afterAll(async () => {
  if (!avecBase || !db) return
  await db.unsafe(`drop schema if exists ${SCHEMA} cascade`)
  await (await import('../stockage/client.ts')).fermerBase()
})

beforeEach(async () => {
  if (!avecBase) return
  await db`truncate utilisateur, debit, journal, ephemere, document, correction_arret, perturbation, mesure`
  courrielsCaptures.length = 0
})

const ip = () => `203.0.113.${Math.floor(Math.random() * 200) + 1}`
const poster = (chemin: string, corps: unknown, entetes: Record<string, string> = {}) =>
  app.request(`/api${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(), ...entetes },
    body: JSON.stringify(corps),
  })
const avecJeton = (j: string) => ({ Authorization: `Bearer ${j}` })

interface OptCompte {
  courriel?: string
  motDePasse?: string
  capacites?: string[]
  verifie?: boolean
  desactive?: boolean
}
async function creerCompte(o: OptCompte = {}) {
  const courriel = o.courriel ?? 'agent@ville.lu'
  const motDePasse = o.motDePasse ?? 'motdepasse-solide'
  await stock.creerUtilisateur({
    courriel,
    motDePasseHash: await hacherMotDePasse(motDePasse),
    nom: 'Agent Test',
    capacites: (o.capacites ?? []) as never,
    courrielVerifie: o.verifie ?? true,
  })
  if (o.desactive) {
    await stock.majUtilisateur(courriel, {
      nom: 'Agent Test',
      capacites: (o.capacites ?? []) as never,
      service: '',
      langue: 'fr',
      desactive: true,
    })
  }
  return { courriel, motDePasse }
}

/** Le jeton d'un compte, via le vrai parcours de connexion. */
async function connecter(courriel: string, motDePasse: string): Promise<string> {
  const rep = await poster('/comptes/connexion', { courriel, motDePasse })
  const j = ((await rep.json()) as any).jeton
  return j
}

/** Le dernier jeton reçu par courriel (activation ou réinitialisation). */
const dernierJetonCourriel = () => {
  const dernier = courrielsCaptures.at(-1)
  return dernier?.texte.match(/jeton=([^\s&]+)/)?.[1] ?? ''
}

describe.skipIf(!avecBase)('espace comptes', () => {
  describe('connexion', () => {
    it('un compte vérifié se connecte et reçoit ses capacités', async () => {
      await creerCompte({ capacites: ['perturbations', 'horaires'] })
      const rep = await poster('/comptes/connexion', {
        courriel: 'agent@ville.lu',
        motDePasse: 'motdepasse-solide',
      })
      expect(rep.status).toBe(200)
      const corps = (await rep.json()) as any
      expect(corps.jeton).toBeTruthy()
      expect(corps.capacites).toEqual(['perturbations', 'horaires'])
    })

    it('le courriel est insensible à la casse et aux espaces', async () => {
      await creerCompte({ courriel: 'agent@ville.lu' })
      const rep = await poster('/comptes/connexion', {
        courriel: '  Agent@Ville.LU ',
        motDePasse: 'motdepasse-solide',
      })
      expect(rep.status).toBe(200)
    })

    it('un mauvais mot de passe est refusé sans dire lequel des deux est faux', async () => {
      await creerCompte()
      const rep = await poster('/comptes/connexion', { courriel: 'agent@ville.lu', motDePasse: 'faux' })
      expect(rep.status).toBe(401)
      expect(((await rep.json()) as any).erreur).toBe('identifiants-invalides')
    })

    it('un compte inconnu rend le même message qu\'un mauvais mot de passe', async () => {
      const rep = await poster('/comptes/connexion', { courriel: 'personne@ville.lu', motDePasse: 'x' })
      expect(rep.status).toBe(401)
      expect(((await rep.json()) as any).erreur).toBe('identifiants-invalides')
    })

    it('un compte désactivé ne se distingue pas non plus d\'un mauvais mot de passe', async () => {
      await creerCompte({ desactive: true })
      const rep = await poster('/comptes/connexion', {
        courriel: 'agent@ville.lu',
        motDePasse: 'motdepasse-solide',
      })
      expect(rep.status).toBe(401)
      expect(((await rep.json()) as any).erreur).toBe('identifiants-invalides')
    })

    it('un compte non vérifié le sait dire — l\'utilisateur légitime doit savoir quoi faire', async () => {
      await creerCompte({ verifie: false })
      const rep = await poster('/comptes/connexion', {
        courriel: 'agent@ville.lu',
        motDePasse: 'motdepasse-solide',
      })
      expect(rep.status).toBe(403)
      expect(((await rep.json()) as any).erreur).toBe('courriel-non-verifie')
    })

    it('« rester connecté » allonge la session', async () => {
      await creerCompte()
      const courte = await (
        await poster('/comptes/connexion', { courriel: 'agent@ville.lu', motDePasse: 'motdepasse-solide' })
      ).json() as any
      const longue = await (
        await poster('/comptes/connexion', {
          courriel: 'agent@ville.lu',
          motDePasse: 'motdepasse-solide',
          seSouvenir: true,
        })
      ).json() as any
      expect(longue.expire).toBeGreaterThan(courte.expire + 20 * 24 * 3600)
    })

    it('la sixième tentative depuis une même adresse est bloquée', async () => {
      await creerCompte()
      const memeIp = { 'X-Forwarded-For': '203.0.113.250' }
      for (let i = 0; i < 5; i++) {
        await app.request('/api/comptes/connexion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...memeIp },
          body: JSON.stringify({ courriel: 'agent@ville.lu', motDePasse: 'faux' }),
        })
      }
      const rep = await app.request('/api/comptes/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...memeIp },
        body: JSON.stringify({ courriel: 'agent@ville.lu', motDePasse: 'motdepasse-solide' }),
      })
      expect(rep.status).toBe(429)
    })

    it('« mot de passe oublié » ne remet pas le compteur de tentatives à zéro', async () => {
      // R59 : cette route appelait `reussite(ip)`, qui efface le compteur partagé avec
      // la connexion. Il suffisait de l'intercaler AVANT d'atteindre la limite pour
      // remettre le verrou à zéro, indéfiniment, et forcer un mot de passe sans frein.
      //
      // Le compte s'incrémente à CHAQUE appel gardé, connexion ou oubli confondus, et
      // ne refuse qu'au-delà de cinq. On en consomme donc quatre, l'oubli prend le
      // cinquième — il doit encore passer — et la tentative suivante doit être refusée.
      // Sans le correctif, l'oubli effaçait tout et cette tentative ne valait qu'un 401.
      await creerCompte()
      const memeIp = { 'X-Forwarded-For': '203.0.113.251' }
      const essayer = (motDePasse: string) =>
        app.request('/api/comptes/connexion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...memeIp },
          body: JSON.stringify({ courriel: 'agent@ville.lu', motDePasse }),
        })

      for (let i = 0; i < 4; i++) {
        expect((await essayer('faux')).status).toBe(401)
      }

      const oubli = await app.request('/api/comptes/mot-de-passe-oublie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...memeIp },
        body: JSON.stringify({ courriel: 'agent@ville.lu' }),
      })
      expect(oubli.status, 'l’oubli consomme le cinquième jeton, il doit encore passer').toBe(200)

      expect((await essayer('faux')).status, 'le verrou a été remis à zéro').toBe(429)
    })
  })

  describe('session', () => {
    it('/moi rend le compte courant avec un jeton valide', async () => {
      await creerCompte({ capacites: ['credits'] })
      const jeton = await connecter('agent@ville.lu', 'motdepasse-solide')
      const rep = await app.request('/api/comptes/moi', { headers: avecJeton(jeton) })
      expect(rep.status).toBe(200)
      expect(((await rep.json()) as any).capacites).toEqual(['credits'])
    })

    it('un jeton absent ou faux est refusé', async () => {
      const rep = await app.request('/api/comptes/moi', { headers: avecJeton('n-importe-quoi') })
      expect(rep.status).toBe(401)
    })

    it('désactiver un compte invalide sa session en cours', async () => {
      await creerCompte({ capacites: ['comptes'] })
      const jeton = await connecter('agent@ville.lu', 'motdepasse-solide')
      await stock.majUtilisateur('agent@ville.lu', {
        nom: 'Agent Test',
        capacites: ['comptes'] as never,
        service: '',
        langue: 'fr',
        desactive: true,
      })
      const rep = await app.request('/api/comptes/moi', { headers: avecJeton(jeton) })
      expect(rep.status).toBe(401)
    })
  })

  describe('capacités', () => {
    it('lister les comptes exige la capacité `comptes`', async () => {
      await creerCompte({ courriel: 'simple@ville.lu', capacites: ['perturbations'] })
      const jeton = await connecter('simple@ville.lu', 'motdepasse-solide')
      const rep = await app.request('/api/comptes/lister', { headers: avecJeton(jeton) })
      expect(rep.status).toBe(403)
      expect(((await rep.json()) as any).erreur).toBe('capacite-refusee')
    })

    it('un compte porteur de `comptes` liste bien', async () => {
      await creerCompte({ courriel: 'admin@ville.lu', capacites: ['comptes'] })
      const jeton = await connecter('admin@ville.lu', 'motdepasse-solide')
      const rep = await app.request('/api/comptes/lister', { headers: avecJeton(jeton) })
      expect(rep.status).toBe(200)
      expect(((await rep.json()) as any).comptes).toHaveLength(1)
    })

    it('accorder une capacité prend effet sans reconnexion (autorisation lue en base)', async () => {
      await creerCompte({ courriel: 'admin@ville.lu', capacites: ['comptes'] })
      await creerCompte({ courriel: 'simple@ville.lu', capacites: [] })
      const jetonSimple = await connecter('simple@ville.lu', 'motdepasse-solide')

      // Sans la capacité, refusé.
      expect((await app.request('/api/comptes/lister', { headers: avecJeton(jetonSimple) })).status).toBe(403)

      // Un admin la lui accorde.
      const jetonAdmin = await connecter('admin@ville.lu', 'motdepasse-solide')
      await poster(
        '/comptes/simple@ville.lu/modifier',
        { capacites: ['comptes'] },
        avecJeton(jetonAdmin),
      )

      // Le MÊME jeton, non renouvelé, passe désormais.
      expect((await app.request('/api/comptes/lister', { headers: avecJeton(jetonSimple) })).status).toBe(200)
    })
  })

  describe('création et activation', () => {
    it('créer un compte envoie un lien d\'activation ; le compte reste inactif jusqu\'à son emploi', async () => {
      await creerCompte({ courriel: 'admin@ville.lu', capacites: ['comptes'] })
      const jetonAdmin = await connecter('admin@ville.lu', 'motdepasse-solide')

      const rep = await poster(
        '/comptes/creer',
        { courriel: 'neuf@ville.lu', nom: 'Personne Neuve', capacites: ['perturbations'] },
        avecJeton(jetonAdmin),
      )
      expect(rep.status).toBe(200)
      expect(courrielsCaptures.at(-1)?.a).toBe('neuf@ville.lu')

      // Tant que le lien n'est pas employé, la connexion est refusée (non vérifié) —
      // et de toute façon personne ne connaît le mot de passe provisoire.
      const avant = await poster('/comptes/connexion', { courriel: 'neuf@ville.lu', motDePasse: 'x' })
      expect(avant.status).toBe(401)

      // Le lien d'activation pose un mot de passe ET vérifie l'adresse.
      const jeton = dernierJetonCourriel()
      const act = await poster('/comptes/reinitialiser', { jeton, motDePasse: 'mon-mot-de-passe' })
      expect(act.status).toBe(200)

      const apres = await poster('/comptes/connexion', {
        courriel: 'neuf@ville.lu',
        motDePasse: 'mon-mot-de-passe',
      })
      expect(apres.status).toBe(200)
    })

    it('un courriel déjà pris est refusé (409), sans écraser le compte', async () => {
      await creerCompte({ courriel: 'admin@ville.lu', capacites: ['comptes'] })
      await creerCompte({ courriel: 'occupe@ville.lu', capacites: [] })
      const jetonAdmin = await connecter('admin@ville.lu', 'motdepasse-solide')
      const rep = await poster(
        '/comptes/creer',
        { courriel: 'occupe@ville.lu', nom: 'Doublon', capacites: [] },
        avecJeton(jetonAdmin),
      )
      expect(rep.status).toBe(409)
    })

    it('les capacités inconnues sont écartées à la création', async () => {
      await creerCompte({ courriel: 'admin@ville.lu', capacites: ['comptes'] })
      const jetonAdmin = await connecter('admin@ville.lu', 'motdepasse-solide')
      await poster(
        '/comptes/creer',
        { courriel: 'neuf@ville.lu', nom: 'X', capacites: ['perturbations', 'root', 'tout'] },
        avecJeton(jetonAdmin),
      )
      const u = await stock.lireUtilisateur('neuf@ville.lu')
      expect(u?.capacites).toEqual(['perturbations'])
    })
  })

  describe('mot de passe', () => {
    it('« oublié » répond ok même pour un courriel inconnu (pas d\'énumération)', async () => {
      const rep = await poster('/comptes/mot-de-passe-oublie', { courriel: 'personne@ville.lu' })
      expect(rep.status).toBe(200)
      expect(courrielsCaptures).toHaveLength(0)
    })

    it('« oublié » d\'un vrai compte envoie un lien qui réinitialise', async () => {
      await creerCompte({ courriel: 'agent@ville.lu' })
      await poster('/comptes/mot-de-passe-oublie', { courriel: 'agent@ville.lu' })
      const jeton = dernierJetonCourriel()
      expect(jeton).toBeTruthy()

      await poster('/comptes/reinitialiser', { jeton, motDePasse: 'nouveau-mot-de-passe' })
      const rep = await poster('/comptes/connexion', {
        courriel: 'agent@ville.lu',
        motDePasse: 'nouveau-mot-de-passe',
      })
      expect(rep.status).toBe(200)
    })

    it('un lien de réinitialisation ne sert qu\'une fois', async () => {
      await creerCompte({ courriel: 'agent@ville.lu' })
      await poster('/comptes/mot-de-passe-oublie', { courriel: 'agent@ville.lu' })
      const jeton = dernierJetonCourriel()
      await poster('/comptes/reinitialiser', { jeton, motDePasse: 'premier-nouveau-mdp' })
      const deux = await poster('/comptes/reinitialiser', { jeton, motDePasse: 'second-nouveau-mdp' })
      expect(deux.status).toBe(400)
    })

    it('un mot de passe trop court est refusé', async () => {
      await creerCompte({ courriel: 'agent@ville.lu' })
      await poster('/comptes/mot-de-passe-oublie', { courriel: 'agent@ville.lu' })
      const jeton = dernierJetonCourriel()
      const rep = await poster('/comptes/reinitialiser', { jeton, motDePasse: 'court' })
      expect(rep.status).toBe(400)
      expect(((await rep.json()) as any).erreur).toBe('mot-de-passe-trop-court')
    })

    it('le changement de mot de passe exige l\'ancien', async () => {
      await creerCompte()
      const jeton = await connecter('agent@ville.lu', 'motdepasse-solide')
      const mauvais = await poster(
        '/comptes/changer-mot-de-passe',
        { ancien: 'faux', nouveau: 'un-autre-mot-de-passe' },
        avecJeton(jeton),
      )
      expect(mauvais.status).toBe(403)

      const bon = await poster(
        '/comptes/changer-mot-de-passe',
        { ancien: 'motdepasse-solide', nouveau: 'un-autre-mot-de-passe' },
        avecJeton(jeton),
      )
      expect(bon.status).toBe(200)
      expect(
        (await poster('/comptes/connexion', { courriel: 'agent@ville.lu', motDePasse: 'un-autre-mot-de-passe' }))
          .status,
      ).toBe(200)
    })
  })

  describe('garde-fous de gestion', () => {
    it('on ne peut pas se retirer à soi-même la capacité `comptes`', async () => {
      await creerCompte({ courriel: 'admin@ville.lu', capacites: ['comptes'] })
      const jeton = await connecter('admin@ville.lu', 'motdepasse-solide')
      const rep = await poster(
        '/comptes/admin@ville.lu/modifier',
        { capacites: ['perturbations'] },
        avecJeton(jeton),
      )
      expect(rep.status).toBe(400)
      expect(((await rep.json()) as any).erreur).toBe('auto-verrouillage-refuse')
    })

    it('on ne peut pas se désactiver soi-même', async () => {
      await creerCompte({ courriel: 'admin@ville.lu', capacites: ['comptes'] })
      const jeton = await connecter('admin@ville.lu', 'motdepasse-solide')
      const rep = await poster(
        '/comptes/admin@ville.lu/modifier',
        { desactive: true },
        avecJeton(jeton),
      )
      expect(rep.status).toBe(400)
    })
  })

  describe('non configuré', () => {
    it('sans SECRET_SESSION, la connexion répond 503', async () => {
      const secret = process.env.SECRET_SESSION
      delete process.env.SECRET_SESSION
      try {
        const rep = await poster('/comptes/connexion', { courriel: 'a@b.lu', motDePasse: 'x' })
        expect(rep.status).toBe(503)
      } finally {
        process.env.SECRET_SESSION = secret
      }
    })
  })
})

describe.skipIf(!avecBase)('édition gardée par capacité — crédits', () => {
  it('publie les crédits pour un compte porteur de la capacité `credits`', async () => {
    await creerCompte({ courriel: 'red@ville.lu', capacites: ['credits'] })
    const jeton = await connecter('red@ville.lu', 'motdepasse-solide')
    const rep = await poster(
      '/edition/credits',
      { credits: { developpement: [{ nom: 'Alex', role: 'Dév' }], remerciements: [] } },
      avecJeton(jeton),
    )
    expect(rep.status).toBe(200)
    const doc = await db`select contenu from document where nom = 'credits'`
    expect(doc[0].contenu.developpement[0].nom).toBe('Alex')

    // La lecture publique sert bien ce qui vient d'être publié.
    const pub = (await (await app.request('/api/credits')).json()) as any
    expect(pub.credits.developpement[0].nom).toBe('Alex')
  })

  it('refuse un compte sans la capacité `credits`', async () => {
    await creerCompte({ courriel: 'sans@ville.lu', capacites: ['perturbations'] })
    const jeton = await connecter('sans@ville.lu', 'motdepasse-solide')
    const rep = await poster('/edition/credits', { credits: { developpement: [] } }, avecJeton(jeton))
    expect(rep.status).toBe(403)
  })

  it('revalide : une entrée sans nom est écartée', async () => {
    await creerCompte({ courriel: 'red@ville.lu', capacites: ['credits'] })
    const jeton = await connecter('red@ville.lu', 'motdepasse-solide')
    await poster(
      '/edition/credits',
      { credits: { developpement: [{ role: 'sans nom' }, { nom: 'Bien', role: 'ok' }] } },
      avecJeton(jeton),
    )
    const doc = await db`select contenu from document where nom = 'credits'`
    expect(doc[0].contenu.developpement).toHaveLength(1)
    expect(doc[0].contenu.developpement[0].nom).toBe('Bien')
  })
})

describe.skipIf(!avecBase)('édition gardée par capacité — corrections d\'arrêts', () => {
  it('publie une correction pour un compte porteur de `arrets`, et /urgences la sert', async () => {
    await creerCompte({ courriel: 'arr@ville.lu', capacites: ['arrets'] })
    const jeton = await connecter('arr@ville.lu', 'motdepasse-solide')
    const rep = await poster(
      '/edition/corrections',
      { correction: { arret: 'bec-eglise', coord: [49.7, 5.9] } },
      avecJeton(jeton),
    )
    expect(rep.status).toBe(200)

    const pub = (await (await app.request('/api/urgences')).json()) as any
    expect(pub.correctionsArrets).toHaveLength(1)
    expect(pub.correctionsArrets[0].arret).toBe('bec-eglise')
    // L'auteur est celui de la session, pas ce que le client prétend.
    expect(pub.correctionsArrets[0].publiePar).toBe('Agent Test')
  })

  it('refuse une coordonnée hors du Luxembourg', async () => {
    await creerCompte({ courriel: 'arr@ville.lu', capacites: ['arrets'] })
    const jeton = await connecter('arr@ville.lu', 'motdepasse-solide')
    const rep = await poster(
      '/edition/corrections',
      { correction: { arret: 'x', coord: [48.85, 2.35] } },
      avecJeton(jeton),
    )
    expect(rep.status).toBe(400)
  })

  it('refuse un compte sans la capacité `arrets`', async () => {
    await creerCompte({ courriel: 'sans@ville.lu', capacites: ['credits'] })
    const jeton = await connecter('sans@ville.lu', 'motdepasse-solide')
    const rep = await poster('/edition/corrections', { correction: { arret: 'x', coord: [49.7, 5.9] } }, avecJeton(jeton))
    expect(rep.status).toBe(403)
  })

  it('retire une correction', async () => {
    await creerCompte({ courriel: 'arr@ville.lu', capacites: ['arrets'] })
    const jeton = await connecter('arr@ville.lu', 'motdepasse-solide')
    await poster('/edition/corrections', { correction: { arret: 'bec-eglise', coord: [49.7, 5.9] } }, avecJeton(jeton))
    const del = await app.request('/api/edition/corrections/bec-eglise', {
      method: 'DELETE',
      headers: { ...avecJeton(jeton), 'X-Forwarded-For': '203.0.113.7' },
    })
    expect(del.status).toBe(200)
    const pub = (await (await app.request('/api/urgences')).json()) as any
    expect(pub.correctionsArrets).toHaveLength(0)
  })
})

/**
 * Perturbations, horaires et traductions repliés sur les capacités (consolidation des
 * espaces `/commune` et `/traductions`). Ce que la connexion par code garantissait — un
 * traducteur ne publie pas d'horaires — est désormais garanti par la capacité, revérifiée
 * en base à chaque requête. Ces tests portent les propriétés de sécurité de l'ancien
 * `commune.test.ts` sur le nouveau système : bon droit passe, mauvais droit est refusé,
 * la charge est revalidée, et l'auteur inscrit est celui de la session.
 */
describe.skipIf(!avecBase)('édition — perturbations gardées par capacité', () => {
  const perturbation = (sur: Record<string, unknown> = {}) => ({
    id: 'u-1',
    type: 'annulation',
    gravite: 'alerte',
    du: '2026-08-10',
    au: '2026-08-10',
    message: { fr: 'Le bus de 07:25 ne circule pas.' },
    ...sur,
  })

  const publier = async (p: Record<string, unknown>, capacites = ['perturbations']) => {
    await creerCompte({ courriel: 'pert@ville.lu', capacites })
    const jeton = await connecter('pert@ville.lu', 'motdepasse-solide')
    return poster('/edition/perturbations', { perturbation: p }, avecJeton(jeton))
  }

  it("écrit sous l'auteur de la session, jamais celui que le client prétend", async () => {
    const rep = await publier(perturbation({ publiePar: 'Pirate' }))
    expect(rep.status).toBe(200)
    const lignes = await db`select donnees from perturbation where id = 'u-1'`
    expect(lignes[0].donnees.publiePar).toBe('Agent Test')
    const j = await db`select * from journal order by quand desc limit 1`
    expect(j[0].qui).toBe('Agent Test')
    expect(j[0].action).toBe('publication')
  })

  it('notifie à la première pose, pas à la reprise du même identifiant', async () => {
    await creerCompte({ courriel: 'pert@ville.lu', capacites: ['perturbations'] })
    const jeton = await connecter('pert@ville.lu', 'motdepasse-solide')
    const pub = (p: Record<string, unknown>) =>
      poster('/edition/perturbations', { perturbation: p }, avecJeton(jeton))

    expect(((await (await pub(perturbation())).json()) as any).notifiee).toBe(true)
    const deux = await pub(perturbation({ message: { fr: 'Correction : le bus circule.' } }))
    expect(((await deux.json()) as any).notifiee).toBe(false)
    const lignes = await db`select donnees from perturbation where id = 'u-1'`
    expect(lignes[0].donnees.message.fr).toBe('Correction : le bus circule.')
  })

  it('refuse une charge sans message français, avant même la notification', async () => {
    const rep = await publier(perturbation({ type: 'message', message: { de: 'Nur Deutsch' } }))
    expect(rep.status).toBe(400)
  })

  it('retire une perturbation', async () => {
    await creerCompte({ courriel: 'pert@ville.lu', capacites: ['perturbations'] })
    const jeton = await connecter('pert@ville.lu', 'motdepasse-solide')
    await poster('/edition/perturbations', { perturbation: perturbation() }, avecJeton(jeton))
    const del = await app.request('/api/edition/perturbations/u-1', {
      method: 'DELETE',
      headers: { ...avecJeton(jeton), 'X-Forwarded-For': '203.0.113.9' },
    })
    expect(del.status).toBe(200)
    expect(await db`select 1 from perturbation where id = 'u-1'`).toHaveLength(0)
  })

  it('refuse un compte sans la capacité `perturbations`', async () => {
    const rep = await publier(perturbation(), ['credits'])
    expect(rep.status).toBe(403)
  })

  it('refuse une publication sans session', async () => {
    const rep = await poster('/edition/perturbations', { perturbation: perturbation() })
    expect(rep.status).toBe(401)
  })
})

describe.skipIf(!avecBase)('édition — horaires gardés par capacité', () => {
  it('publie le plan validé, servi versionné par /horaires', async () => {
    const planBundle = (await import('../../../src/data/plan-2025-2026.json')).default
    await creerCompte({ courriel: 'hor@ville.lu', capacites: ['horaires'] })
    const jeton = await connecter('hor@ville.lu', 'motdepasse-solide')
    const rep = await poster('/edition/horaires', { plan: planBundle, resume: 'rentrée' }, avecJeton(jeton))
    expect(rep.status).toBe(200)

    const doc = await db`select version from document where nom = 'horaires'`
    expect(doc[0].version).not.toBe('embarque')
    const pub = (await (await app.request('/api/horaires')).json()) as any
    expect(pub.version).toBe(doc[0].version)
    expect(pub.plan.lignes.length).toBe((planBundle as any).lignes.length)
  })

  it('refuse un plan invalide sans rien écrire', async () => {
    await creerCompte({ courriel: 'hor@ville.lu', capacites: ['horaires'] })
    const jeton = await connecter('hor@ville.lu', 'motdepasse-solide')
    const rep = await poster('/edition/horaires', { plan: { lignes: 'pas une liste' } }, avecJeton(jeton))
    expect(rep.status).toBe(400)
    expect(await db`select 1 from document where nom = 'horaires'`).toHaveLength(0)
  })

  it('refuse un compte sans la capacité `horaires`', async () => {
    await creerCompte({ courriel: 'sans@ville.lu', capacites: ['perturbations'] })
    const jeton = await connecter('sans@ville.lu', 'motdepasse-solide')
    const rep = await poster('/edition/horaires', { plan: { lignes: [] } }, avecJeton(jeton))
    expect(rep.status).toBe(403)
  })
})

describe.skipIf(!avecBase)('édition — traductions gardées par capacité', () => {
  const jetonTrad = async (courriel: string) => {
    await creerCompte({ courriel, capacites: ['traductions'] })
    return connecter(courriel, 'motdepasse-solide')
  }

  it('fusionne deux publications successives au lieu de les écraser', async () => {
    const publier = (jeton: string, langue: string, modifications: unknown) =>
      poster('/edition/traductions', { langue, modifications }, avecJeton(jeton))

    expect((await publier(await jetonTrad('a@ville.lu'), 'de', { 'assistant.terminer': 'Fertig' })).status).toBe(200)
    const rep = await publier(await jetonTrad('b@ville.lu'), 'pt', { 'assistant.terminer': 'Terminado' })
    expect(rep.status).toBe(200)

    const lignes = await db`select contenu from document where nom = 'traductions'`
    expect(lignes[0].contenu.langues.de).toEqual({ 'assistant.terminer': 'Fertig' })
    expect(lignes[0].contenu.langues.pt).toEqual({ 'assistant.terminer': 'Terminado' })
    expect(((await rep.json()) as any).surcouche.de).toEqual({ 'assistant.terminer': 'Fertig' })
  })

  it('est servie telle quelle par la lecture publique /traductions', async () => {
    const jeton = await jetonTrad('a@ville.lu')
    await poster('/edition/traductions', { langue: 'de', modifications: { 'nav.limites': 'Grenzen' } }, avecJeton(jeton))
    const pub = await (await app.request('/api/traductions')).json()
    expect((pub as any).langues.de['nav.limites']).toBe('Grenzen')
  })

  it('refuse une publication sans langue reconnue', async () => {
    const jeton = await jetonTrad('a@ville.lu')
    const rep = await poster('/edition/traductions', { langue: 'es', modifications: {} }, avecJeton(jeton))
    expect(rep.status).toBe(400)
  })

  it('refuse un compte sans la capacité `traductions`', async () => {
    await creerCompte({ courriel: 'sans@ville.lu', capacites: ['credits'] })
    const jeton = await connecter('sans@ville.lu', 'motdepasse-solide')
    const rep = await poster('/edition/traductions', { langue: 'de', modifications: {} }, avecJeton(jeton))
    expect(rep.status).toBe(403)
  })
})

describe.skipIf(!avecBase)('édition — journal lisible par toute session', () => {
  it('ouvre le journal à une session valide, sans exiger de capacité', async () => {
    await creerCompte({ courriel: 'lecteur@ville.lu', capacites: [] })
    const jeton = await connecter('lecteur@ville.lu', 'motdepasse-solide')
    const rep = await app.request('/api/edition/journal', { headers: avecJeton(jeton) })
    expect(rep.status).toBe(200)
    expect(await rep.json()).toHaveProperty('entrees')
  })

  it('refuse le journal sans session', async () => {
    const rep = await app.request('/api/edition/journal')
    expect(rep.status).toBe(401)
  })
})

describe.skipIf(!avecBase)('mesure de fréquentation auto-hébergée', () => {
  it('compte une vue par relevé public, agrégée par jour et par écran', async () => {
    expect((await poster('/mesure', { chemin: '/plan' })).status).toBe(204)
    await poster('/mesure', { chemin: '/plan' })
    await poster('/mesure', { chemin: '/agenda' })

    const lignes = await db`select chemin, vues from mesure where jour = current_date order by chemin`
    expect(lignes).toEqual([
      { chemin: '/agenda', vues: 1 },
      { chemin: '/plan', vues: 2 },
    ])
  })

  it('normalise côté serveur : un identifiant d’enfant ou un chemin inconnu ne s’inscrit jamais tel quel', async () => {
    await poster('/mesure', { chemin: '/enfant/8f3a-secret/assistant' })
    await poster('/mesure', { chemin: '/plan?ref=courriel' })
    await poster('/mesure', { chemin: '/chemin-inexistant' })

    const chemins = (await db`select chemin from mesure where jour = current_date order by chemin`).map(
      (l) => l.chemin,
    )
    // `/enfant/…` réduit à `/enfant`, la requête tombée de `/plan`, l'inconnu en `autre`.
    expect(chemins).toEqual(['/enfant', '/plan', 'autre'])
    // Aucun identifiant ni fragment n'a survécu.
    expect(JSON.stringify(chemins)).not.toContain('secret')
  })

  it('la lecture agrégée exige une session, mais aucune capacité', async () => {
    await poster('/mesure', { chemin: '/plan' })
    expect((await app.request('/api/edition/mesure')).status).toBe(401)

    await creerCompte({ courriel: 'lecteur@ville.lu', capacites: [] })
    const jeton = await connecter('lecteur@ville.lu', 'motdepasse-solide')
    const rep = await app.request('/api/edition/mesure', { headers: avecJeton(jeton) })
    expect(rep.status).toBe(200)
    const m = (await rep.json()) as any
    expect(m.total).toBe(1)
    expect(m.parChemin).toEqual([{ chemin: '/plan', vues: 1 }])
    expect(m.parJour).toHaveLength(1)
  })
})
