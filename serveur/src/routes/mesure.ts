/**
 * Le relevé de fréquentation (lots 27-28), reçu ici au lieu de partir chez GoatCounter.
 *
 * Route PUBLIQUE, sans compte : chaque visiteur dépose une vue à l'ouverture. Elle est
 * donc, comme l'était GoatCounter, approximative — rien n'empêche d'appeler l'endpoint à
 * la main pour gonfler un compteur. C'est un ordre de grandeur d'usage, pas une métrique
 * de confiance, et on l'assume (voir la réserve du lot).
 *
 * Le chemin est NORMALISÉ côté serveur (`normaliserChemin`) : on ne garde qu'un écran
 * connu, jamais un identifiant d'enfant ni un fragment de partage. La réponse est un 204
 * muet — un `sendBeacon` n'attend rien en retour.
 */
import type { Context, Hono } from 'hono'
import { corpsJson } from '../http.ts'
import { baseConfiguree } from '../stockage/client.ts'
import { enregistrerVue, normaliserChemin } from '../stockage/mesure.ts'

async function mesurer(c: Context): Promise<Response> {
  // Sans base, il n'y a rien où compter : on répond 204 sans bruit plutôt que d'échouer.
  if (!baseConfiguree()) return c.body(null, 204)
  try {
    const corps = await corpsJson<{ chemin?: unknown }>(c, 1024).catch(
      () => ({}) as { chemin?: unknown },
    )
    await enregistrerVue(normaliserChemin(corps?.chemin))
  } catch (e) {
    // Un relevé raté n'est jamais une panne visible : on le note et on répond 204.
    console.log(`mesure : relevé ignoré — ${(e as Error)?.message}`)
  }
  return c.body(null, 204)
}

export function monterMesure(app: Hono): void {
  app.post('/mesure', mesurer)
}
