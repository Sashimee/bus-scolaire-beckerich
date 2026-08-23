/**
 * Les lectures publiques (lot 25) : ce que le site lit à chaque ouverture — urgences,
 * surcouche de traduction, horaires, crédits. Servies sans authentification, à la même
 * origine que le site.
 *
 * Ce que le dépôt GitHub servait dans des fichiers statiques, la base le sert ici. Quand
 * une table ou un document est vide — au tout premier démarrage, avant toute
 * publication —, on retombe sur les données EMBARQUÉES dans le paquet : le site a
 * toujours un plan et des crédits, même sur une base neuve.
 */
import type { Hono } from 'hono'
import { plan as planEmbarque } from '../../../src/lib/donnees.ts'
import creditsEmbarques from '../../../src/data/credits.json'
import {
  lireDocument,
  listerCorrections,
  listerPerturbations,
} from '../stockage/publications.ts'
import { baseConfiguree } from '../stockage/client.ts'

/** L'empreinte du plan embarqué, pour que le client distingue « plan d'usine » d'un plan publié. */
const VERSION_PLAN_EMBARQUE = 'embarque'

export function monterPubliques(app: Hono): void {
  /**
   * Urgences : perturbations et corrections d'arrêts réunies, dans la forme même
   * qu'`urgences.json` servait. `misAJour` est la plus récente des publications, ce qui
   * permettra plus tard un `ETag` sans changer la forme.
   */
  app.get('/urgences', async (c) => {
    if (!baseConfiguree()) {
      return c.json({ version: 1, misAJour: new Date(0).toISOString(), perturbations: [], correctionsArrets: [] })
    }
    const [perturbations, correctionsArrets] = await Promise.all([
      listerPerturbations(),
      listerCorrections(),
    ])
    return c.json({ version: 1, misAJour: new Date().toISOString(), perturbations, correctionsArrets })
  })

  /** Surcouche de traduction. Vide par défaut : le client a ses traductions de base. */
  app.get('/traductions', async (c) => {
    const doc = baseConfiguree() ? await lireDocument('traductions') : null
    const contenu = (doc?.contenu ?? {}) as { langues?: unknown }
    return c.json({
      misAJour: doc?.misAJour ?? new Date(0).toISOString(),
      langues: contenu.langues ?? {},
    })
  })

  /**
   * Horaires : le plan. Le document publié l'emporte ; à défaut, le plan embarqué, avec
   * une version qui dit « embarqué » pour que le client sache qu'aucune mise à jour n'a
   * encore été publiée.
   */
  app.get('/horaires', async (c) => {
    const doc = baseConfiguree() ? await lireDocument('horaires') : null
    if (doc) return c.json({ version: doc.version, misAJour: doc.misAJour, plan: doc.contenu })
    return c.json({ version: VERSION_PLAN_EMBARQUE, misAJour: new Date(0).toISOString(), plan: planEmbarque })
  })

  /** Crédits. Le document publié l'emporte ; à défaut, les crédits embarqués. */
  app.get('/credits', async (c) => {
    const doc = baseConfiguree() ? await lireDocument('credits') : null
    if (doc) return c.json({ version: doc.version, misAJour: doc.misAJour, credits: doc.contenu })
    return c.json({ version: VERSION_PLAN_EMBARQUE, misAJour: new Date(0).toISOString(), credits: creditsEmbarques })
  })
}
