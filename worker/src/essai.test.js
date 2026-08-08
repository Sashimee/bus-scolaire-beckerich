/**
 * La route d'essai : un parent se fait envoyer une notification à lui-même.
 *
 * Ce qui compte ici n'est pas qu'elle marche — c'est qu'elle ne serve à rien d'autre.
 * Le endpoint tient lieu d'authentification, ce qui n'est acceptable que si la seule
 * chose qu'on obtienne en le connaissant est de faire vibrer l'appareil qui le porte,
 * et pas plus d'une fois par minute.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index.js'

const ENDPOINT = 'https://web.push.apple.com/abc123'
const AUTRE = 'https://fcm.googleapis.com/fcm/send/xyz789'

/** Les clés d'un abonnement, empruntées au vecteur de test de la RFC 8291. */
const CLES = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
}

let env
let envoyes

const kv = () => {
  const donnees = new Map()
  return {
    donnees,
    async get(cle) {
      return donnees.has(cle) ? donnees.get(cle) : null
    },
    async put(cle, valeur) {
      donnees.set(cle, valeur)
    },
    async delete(cle) {
      donnees.delete(cle)
    },
    async list({ prefix }) {
      return {
        keys: [...donnees.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      }
    },
  }
}

async function empreinteDe(texte) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('')
}

beforeEach(async () => {
  const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const privee = await crypto.subtle.exportKey('jwk', paire.privateKey)
  const publique = await crypto.subtle.exportKey('jwk', paire.publicKey)

  env = {
    ABONNEMENTS: kv(),
    ORIGINES_AUTORISEES: 'https://exemple.lu',
    CONTACT_VAPID: 'mailto:a@b.org',
    VAPID_JWK: JSON.stringify({ ...privee, x: publique.x, y: publique.y }),
  }

  // Le service de push n'existe pas ici : on retient seulement ce qui lui aurait été
  // envoyé, ce qui suffit à vérifier la charge et le destinataire.
  envoyes = []
  vi.stubGlobal('fetch', async (url, options) => {
    envoyes.push({ url: String(url), options })
    return new Response(null, { status: 201 })
  })
})

afterEach(() => vi.unstubAllGlobals())

const inscrire = async (endpoint, preference = 'urgences') => {
  await env.ABONNEMENTS.put(
    'abonnement:' + (await empreinteDe(endpoint)),
    JSON.stringify({ endpoint, keys: CLES, preference }),
  )
}

const demander = (corps) =>
  worker.fetch(
    new Request('https://worker.test/essai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://exemple.lu' },
      body: JSON.stringify(corps),
    }),
    env,
  )

describe('notification d’essai', () => {
  it('envoie à l’abonnement demandé, et à lui seul', async () => {
    await inscrire(ENDPOINT)
    await inscrire(AUTRE)

    const rep = await demander({ endpoint: ENDPOINT, titre: 'Essai', message: 'Ça marche.' })
    expect(rep.status).toBe(200)
    expect((await rep.json()).envoyees).toBe(1)

    // Un seul appel, vers le bon service : connaître un endpoint ne permet pas
    // d'arroser les autres abonnés.
    expect(envoyes).toHaveLength(1)
    expect(envoyes[0].url).toBe(ENDPOINT)
  })

  it('refuse un endpoint qui n’est pas déjà abonné', async () => {
    // Sinon la route deviendrait un envoyeur de push vers n'importe quelle adresse.
    const rep = await demander({ endpoint: ENDPOINT })
    expect(rep.status).toBe(404)
    expect(envoyes).toHaveLength(0)
  })

  it('refuse un corps sans endpoint', async () => {
    expect((await demander({})).status).toBe(400)
    expect((await demander({ endpoint: 42 })).status).toBe(400)
  })

  it('n’en laisse pas passer plus d’un par minute', async () => {
    await inscrire(ENDPOINT)
    expect((await demander({ endpoint: ENDPOINT })).status).toBe(200)

    const rep = await demander({ endpoint: ENDPOINT })
    expect(rep.status).toBe(429)
    expect((await rep.json()).erreur).toBe('trop-frequent')
    expect(envoyes).toHaveLength(1)
  })

  it('compte la limite par abonnement, pas globalement', async () => {
    await inscrire(ENDPOINT)
    await inscrire(AUTRE)
    expect((await demander({ endpoint: ENDPOINT })).status).toBe(200)
    expect((await demander({ endpoint: AUTRE })).status).toBe(200)
  })

  it('part malgré une préférence restrictive', async () => {
    // Un abonné réglé sur « urgences seulement » ne reçoit pas les envois d'information.
    // Filtrer l'essai sur ce réglage le laisserait sans réponse, exactement là où il
    // cherche à vérifier que le mécanisme fonctionne.
    await inscrire(ENDPOINT, 'urgences')
    expect((await demander({ endpoint: ENDPOINT })).json().then((r) => r.envoyees)).resolves.toBe(1)
  })

  it('porte l’urgence ordinaire, pas celle d’une alerte', async () => {
    // Un essai ne doit pas ressembler à un vrai bus annulé : ni bannière persistante,
    // ni priorité de transport.
    await inscrire(ENDPOINT)
    await demander({ endpoint: ENDPOINT })
    expect(envoyes[0].options.headers.Urgency).toBe('normal')
  })
})
