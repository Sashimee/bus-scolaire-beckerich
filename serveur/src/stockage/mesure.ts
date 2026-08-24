/**
 * Mesure de fréquentation auto-hébergée (lots 27-28).
 *
 * Ce que faisait GoatCounter, mais sur notre serveur : un relevé à l'ouverture, agrégé
 * par jour et par écran. Deux garde-fous tiennent le premier principe du projet — aucune
 * donnée de famille ne quitte l'appareil :
 *
 *  — la NORMALISATION est faite ICI, pas chez le client : on ne garde que le premier
 *    segment du chemin, et seulement s'il fait partie d'une liste blanche d'écrans connus.
 *    `/enfant/8f3a…` devient `/enfant`, `/plan?x=y` devient `/plan`, tout le reste devient
 *    `autre`. Un identifiant d'enfant ou un fragment de partage ne peut donc pas s'y
 *    inscrire, même si un client trafiqué l'envoyait ;
 *  — aucune adresse, aucun cookie, aucun horodatage plus fin que le jour : aucune ligne
 *    ne peut être rattachée à une personne.
 */
import { base, type Sql } from './client.ts'

/**
 * Les écrans connus de l'application. Un chemin hors de cette liste est compté comme
 * `autre` : la table ne peut donc pas enfler, et rien d'imprévu ne s'y grave.
 */
const CHEMINS_CONNUS = new Set([
  '/',
  '/plan',
  '/limites',
  '/independance',
  '/credits',
  '/installer',
  '/agenda',
  '/reglages',
  '/edition',
  '/connexion',
  '/comptes',
  '/reinitialiser',
  '/enfant',
  '/configurer',
])

/** Le chemin ramené à un écran connu, ou `autre`. Jamais rien de personnel n'en sort. */
export function normaliserChemin(brut: unknown): string {
  if (typeof brut !== 'string') return 'autre'
  // On coupe avant toute requête ou fragment, puis on ne garde que le premier segment :
  // `/enfant/8f3a-…/assistant` → `/enfant`.
  const sansQuery = brut.split(/[?#]/)[0]
  const premier = sansQuery.replace(/^\/+/, '').split('/')[0]
  const chemin = premier ? `/${premier}` : '/'
  return CHEMINS_CONNUS.has(chemin) ? chemin : 'autre'
}

/** Enregistre une vue pour aujourd'hui, en un seul énoncé atomique. */
export async function enregistrerVue(chemin: string, db: Sql = base()): Promise<void> {
  await db`
    insert into mesure (jour, chemin, vues)
    values (current_date, ${chemin}, 1)
    on conflict (jour, chemin) do update set vues = mesure.vues + 1
  `
}

export interface Mesures {
  total: number
  parJour: { jour: string; vues: number }[]
  parChemin: { chemin: string; vues: number }[]
}

/** L'agrégat des `jours` derniers jours : total, courbe par jour, répartition par écran. */
export async function lireMesures(jours = 30, db: Sql = base()): Promise<Mesures> {
  // `make_interval(days => $1)` prend le nombre en PARAMÈTRE lié : aucun morceau de SQL
  // n'est fabriqué par concaténation.
  const fenetre = Math.max(1, Math.min(jours, 400)) - 1
  const parJour = await db`
    select jour::text as jour, sum(vues)::int as vues
    from mesure where jour >= current_date - make_interval(days => ${fenetre})
    group by jour order by jour
  `
  const parChemin = await db`
    select chemin, sum(vues)::int as vues
    from mesure where jour >= current_date - make_interval(days => ${fenetre})
    group by chemin order by vues desc
  `
  const total = parChemin.reduce((n, l) => n + Number(l.vues), 0)
  return {
    total,
    parJour: parJour.map((l) => ({ jour: l.jour as string, vues: Number(l.vues) })),
    parChemin: parChemin.map((l) => ({ chemin: l.chemin as string, vues: Number(l.vues) })),
  }
}

/** Retenue : au-delà de `jours`, une mesure de fréquentation n'apprend plus rien. */
export const RETENTION_MESURE_JOURS = 400

export async function balayerMesures(db: Sql = base()): Promise<number> {
  const efface = await db`
    delete from mesure where jour < current_date - make_interval(days => ${RETENTION_MESURE_JOURS})
  `
  return efface.count
}
