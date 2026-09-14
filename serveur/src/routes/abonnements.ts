/**
 * Abonnement, désabonnement et notification d'essai.
 */
import type { Hono } from 'hono'
import { corpsJson } from '../http.ts'
import * as stock from '../stockage/abonnements.ts'
import { PREFERENCES, PREFERENCE_DEFAUT, endpointAcceptable } from '../stockage/abonnements.ts'
import { ecrireEphemere, lireEphemere } from '../stockage/ephemeres.ts'
import { empreinte } from '../crypto.ts'
import { envoyer } from '../envois.ts'

/** Un essai par endpoint et par minute : de quoi vérifier, pas de quoi harceler. */
const PREFIXE_DEBIT_ESSAI = 'essai:'
const DELAI_ESSAI_S = 60

export function monterAbonnements(app: Hono): void {
  app.post('/abonner', async (c) => {
    let abonnement: Record<string, unknown>
    try {
      abonnement = await corpsJson(c)
    } catch (e) {
      return c.json({ erreur: String((e as Error).message) }, 400)
    }
    if (!abonnement?.endpoint || typeof abonnement.endpoint !== 'string') {
      return c.json({ erreur: 'abonnement-invalide' }, 400)
    }
    if (!endpointAcceptable(abonnement.endpoint)) {
      return c.json({ erreur: 'endpoint-refuse' }, 400)
    }

    const preference = (PREFERENCES as readonly string[]).includes(
      abonnement.preference as string,
    )
      ? (abonnement.preference as string)
      : PREFERENCE_DEFAUT

    await stock.enregistrer(abonnement.endpoint, abonnement.keys, preference)
    return c.json({ ok: true, preference })
  })

  app.post('/desabonner', async (c) => {
    let endpoint: unknown
    try {
      ;({ endpoint } = await corpsJson<{ endpoint?: unknown }>(c))
    } catch (e) {
      return c.json({ erreur: String((e as Error).message) }, 400)
    }
    if (!endpoint || typeof endpoint !== 'string') {
      return c.json({ erreur: 'endpoint-manquant' }, 400)
    }
    await stock.supprimerParEndpoint(endpoint)
    return c.json({ ok: true })
  })

  /**
   * Notification d'essai à UN abonnement, celui du demandeur.
   *
   * C'est le seul moyen pour un parent de vérifier son propre réglage après avoir
   * suivi la marche à suivre de son téléphone : autrement, il ne le découvrirait
   * qu'un matin de bus annulé, au pire moment.
   *
   * L'authentification, c'est le endpoint lui-même. Il contient un jeton long tiré
   * par le service de push et n'est connu que du navigateur abonné : le fournir
   * prouve qu'on est cet abonné, et la seule chose qu'on obtient est de se faire
   * vibrer soi-même. On n'accepte que des endpoints DÉJÀ enregistrés, et jamais plus
   * d'un essai par minute — un endpoint qui fuiterait ne deviendrait pas un moyen de
   * harceler quelqu'un.
   */
  app.post('/essai', async (c) => {
    let corps: { endpoint?: unknown; titre?: string; message?: string }
    try {
      corps = await corpsJson(c, 4 * 1024)
    } catch (e) {
      return c.json({ erreur: String((e as Error).message) }, 400)
    }
    if (!corps?.endpoint || typeof corps.endpoint !== 'string') {
      return c.json({ erreur: 'abonnement-invalide' }, 400)
    }

    const abonnement = await stock.lireParEndpoint(corps.endpoint)
    if (!abonnement) return c.json({ erreur: 'abonnement-inconnu' }, 404)

    const cleDebit = PREFIXE_DEBIT_ESSAI + (await empreinte(corps.endpoint))
    if (await lireEphemere(cleDebit)) return c.json({ erreur: 'trop-frequent' }, 429)
    await ecrireEphemere(cleDebit, 1, DELAI_ESSAI_S)

    // Charge délibérément inoffensive : ni gravité `alerte`, ni `requireInteraction`.
    // Un essai ne doit pas ressembler à une vraie annulation.
    const resultat = await envoyer(
      {
        titre: corps.titre ?? 'Essai',
        corps: corps.message ?? '',
        gravite: 'info',
        id: 'essai',
        essai: true,
      },
      [abonnement],
    )
    return c.json(resultat)
  })
}
