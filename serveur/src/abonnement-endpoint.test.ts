/**
 * Le filtre des points de terminaison push (réserve R58).
 *
 * `POST /abonner` n'exige aucun compte, et chaque notification fait un `fetch` sur le
 * endpoint enregistré. Ces tests fixent ce que le serveur accepte d'appeler ; les
 * assouplir revient à rouvrir la requête forgée vers l'intérieur de la VPS.
 */
import { describe, expect, it } from 'vitest'
import { endpointAcceptable } from './stockage/abonnements.ts'

describe('endpoints de push acceptés', () => {
  it('accepte les services de push des quatre navigateurs', () => {
    const vrais = [
      'https://fcm.googleapis.com/fcm/send/abc123:APA91b',
      'https://android.googleapis.com/gcm/send/abc123',
      'https://web.push.apple.com/QF7Yq9xN2mK',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYA',
    ]
    for (const endpoint of vrais) expect(endpointAcceptable(endpoint)).toBe(true)
  })

  it('refuse les adresses internes — le cas qui rendait la requête forgée possible', () => {
    const forges = [
      'http://127.0.0.1:3000/api/edition/credits',
      'https://127.0.0.1/interne',
      'https://localhost/interne',
      'https://bus-postgres:5432/',
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.5/interne',
    ]
    for (const endpoint of forges) expect(endpointAcceptable(endpoint)).toBe(false)
  })

  it("refuse un hôte qui imite un service de push sans en être un", () => {
    const imitations = [
      'https://web.push.apple.com.attaquant.example/x',
      'https://fcm.googleapis.com.evil.test/x',
      'https://notfcm.googleapis.com/x',
      'https://push.services.mozilla.com.ru/x',
    ]
    for (const endpoint of imitations) expect(endpointAcceptable(endpoint)).toBe(false)
  })

  it('exige https, sans port ni identifiants dans l’URL', () => {
    expect(endpointAcceptable('http://fcm.googleapis.com/fcm/send/x')).toBe(false)
    expect(endpointAcceptable('https://fcm.googleapis.com:8080/fcm/send/x')).toBe(false)
    expect(endpointAcceptable('https://u:p@fcm.googleapis.com/fcm/send/x')).toBe(false)
  })

  it('refuse ce qui n’est pas une URL', () => {
    for (const brut of ['', 'pas une url', '//fcm.googleapis.com/x', 'javascript:alert(1)']) {
      expect(endpointAcceptable(brut)).toBe(false)
    }
  })

  it('accepte le sous-domaine et le domaine nu, jamais un suffixe accolé', () => {
    expect(endpointAcceptable('https://push.services.mozilla.com/x')).toBe(true)
    expect(endpointAcceptable('https://a.b.push.services.mozilla.com/x')).toBe(true)
    expect(endpointAcceptable('https://xpush.services.mozilla.com/x')).toBe(false)
  })
})
