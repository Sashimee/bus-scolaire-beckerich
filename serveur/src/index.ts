/**
 * Serveur du site « Bus scolaire Beckerich ».
 *
 * Reprend, à l'identique de l'extérieur, ce que faisait le Worker Cloudflare :
 *  1. échanger le code OAuth GitHub contre un jeton (il détient le secret client) ;
 *  2. conserver les abonnements aux notifications et les envoyer ;
 *  3. tenir les deux espaces à code personnel — commune et traductions.
 *
 * Il ne stocke aucune donnée personnelle de famille : ni adresse, ni prénom, ni
 * cycle. Seulement des points de terminaison push, qui sont des identifiants
 * d'appareil opaques, des empreintes de codes d'accès et un journal de 90 jours.
 *
 * Tout est monté sous `BASE_API` (`/api` par défaut) : le site et l'API partagent une
 * seule origine, ce qui fait disparaître le CORS et permet à la politique de sécurité
 * de se contenter de `connect-src 'self'`.
 */
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { entetesCors, originesPermises } from './http.ts'
import { monterSante } from './routes/sante.ts'
import { monterAbonnements } from './routes/abonnements.ts'
import { monterGoogle } from './routes/google.ts'
import { monterComptes } from './routes/comptes.ts'
import { monterPubliques } from './routes/publiques.ts'
import { monterEdition } from './routes/edition.ts'
import { monterMesure } from './routes/mesure.ts'
import { demarrerPlanificateur } from './planificateur.ts'
import { baseConfiguree, fermerBase, migrer } from './stockage/client.ts'

/**
 * Les espaces authentifiés — comptes et édition — envoient un en-tête `Authorization`,
 * et leur préflight doit donc l'autoriser : sans quoi le navigateur refuse la requête
 * avant même de l'émettre, et l'édition est inutilisable sans qu'aucune erreur serveur
 * ne l'explique.
 *
 * Le chemin est comparé APRÈS retrait de `BASE_API`. `c.req.path` rend l'URL entière,
 * `/api/edition/horaires`, alors que les routes sont déclarées `/edition/horaires` :
 * comparer les deux sans retirer le préfixe faisait passer tout l'espace pour une route
 * ordinaire. Constaté au premier essai de préflight.
 */
export function aJeton(chemin: string, base = process.env.BASE_API ?? '/api'): boolean {
  const prefixe = base.replace(/\/$/, '')
  const relatif = prefixe && chemin.startsWith(prefixe) ? chemin.slice(prefixe.length) : chemin
  return relatif.startsWith('/comptes/') || relatif.startsWith('/edition/')
}

export function creerApplication(): Hono {
  const api = new Hono()

  /**
   * Les en-têtes CORS comptent SURTOUT sur les erreurs.
   *
   * Sans eux, le navigateur bloque la réponse d'erreur et `fetch` échoue :
   * l'application concluait à une panne réseau alors que le serveur avait répondu, et
   * le vrai motif — un jeton machine refusé par GitHub, par exemple — restait
   * invisible. L'intergiciel les pose donc sur TOUTE réponse, y compris celles que
   * personne n'a prévues.
   */
  api.use('*', async (c, next) => {
    const entetes = entetesCors(c.req.header('origin') ?? '*', aJeton(c.req.path))

    if (c.req.method === 'OPTIONS') {
      // Sans ce préflight-là, le navigateur refuse une requête portant
      // `Authorization` avant même de l'émettre.
      return c.body(null, 204, entetes)
    }

    await next()
    for (const [nom, valeur] of Object.entries(entetes)) c.header(nom, valeur)
  })

  api.onError((e, c) => {
    console.log(`exception sur ${c.req.method} ${c.req.path} : ${(e as Error)?.stack ?? e}`)
    // Le détail reste dans le journal du serveur : rendu au client, il livrait le
    // texte de la requête SQL, un nom de table, voire « password authentication
    // failed for user "bus" ». R58 et suivantes.
    return c.json({ erreur: 'exception' }, 500)
  })

  api.notFound((c) => c.json({ erreur: 'route-inconnue' }, 404))

  monterSante(api)
  monterAbonnements(api)
  monterGoogle(api)
  monterComptes(api)
  monterPubliques(api)
  monterEdition(api)
  monterMesure(api)

  const app = new Hono()
  app.route(process.env.BASE_API ?? '/api', api)
  return app
}

async function demarrer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000)

  // Les migrations tournent au démarrage, avant d'écouter : un serveur qui accepte
  // des requêtes sur un schéma incomplet répondrait des erreurs illisibles. Sans
  // base configurée, on démarre quand même — `/sante` doit pouvoir dire ce qui
  // manque, et l'application parent n'a besoin de rien de tout cela.
  if (baseConfiguree()) {
    const appliquees = await migrer()
    if (appliquees.length) console.log(`migrations appliquées : ${appliquees.join(', ')}`)
  } else {
    console.log('DATABASE_URL absente : le serveur démarre, mais /sante dira que la base manque.')
  }

  if (!originesPermises().length) {
    console.log('ORIGINES_AUTORISEES vide : aucune origine ne pourra appeler ce serveur.')
  }

  const serveur = serve({ fetch: creerApplication().fetch, port }, (info) => {
    console.log(`serveur à l'écoute sur le port ${info.port}, base ${process.env.BASE_API ?? '/api'}`)
  })

  const arreterPlanificateur = demarrerPlanificateur()

  /**
   * Arrêt propre.
   *
   * Dokploy envoie `SIGTERM` puis attend. Sans cette écoute, Node s'arrête net : une
   * notification en cours d'envoi est perdue au milieu de la boucle, et la connexion
   * à PostgreSQL reste ouverte côté serveur jusqu'à son expiration.
   */
  const arreter = (signal: string) => async () => {
    console.log(`${signal} reçu : arrêt.`)
    arreterPlanificateur()
    serveur.close()
    await fermerBase()
    process.exit(0)
  }
  process.on('SIGTERM', arreter('SIGTERM'))
  process.on('SIGINT', arreter('SIGINT'))
}

// Le module est aussi importé par les tests, qui ne veulent pas d'un serveur qui
// écoute : on ne démarre que si l'on est le point d'entrée.
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  demarrer().catch((e) => {
    console.error(`démarrage impossible : ${e?.stack ?? e}`)
    process.exit(1)
  })
}
