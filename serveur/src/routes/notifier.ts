/**
 * Envoi déclenché de l'extérieur, aujourd'hui par GitHub Actions.
 *
 * `/notifier-lot` a disparu, et avec lui le drapeau `global_fetch_strictly_public`,
 * la réponse `507 trop-abonnes` et le plafond d'environ 450 abonnés par envoi. Il n'y
 * a plus qu'une route.
 *
 * **Cette route a elle aussi une date de péremption : le lot 25.** Quand les
 * perturbations vivront en base, la publication et l'envoi seront la même opération,
 * dans la même transaction, et `SECRET_NOTIFICATION` disparaîtra avec le workflow
 * `notifier.yml`.
 */
import type { Hono } from 'hono'
import { corpsJson } from '../http.ts'
import { envoyerATous, type Charge } from '../envois.ts'

export function monterNotifier(app: Hono): void {
  app.post('/notifier', async (c) => {
    const attendu = process.env.SECRET_NOTIFICATION
    if (!attendu || c.req.header('authorization') !== `Bearer ${attendu}`) {
      return c.json({ erreur: 'non-autorise' }, 401)
    }

    let charge: Charge
    try {
      charge = await corpsJson<Charge>(c, 16 * 1024)
    } catch (e) {
      return c.json({ erreur: String((e as Error).message) }, 400)
    }
    if (!charge?.corps) return c.json({ erreur: 'corps-manquant' }, 400)

    return c.json(await envoyerATous(charge))
  })
}
