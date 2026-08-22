/**
 * L'envoi des notifications.
 *
 * **Ce qui a disparu ici est la moitié du fichier d'origine.** Le Worker découpait les
 * abonnés en lots de dix, chaque lot repartant en sous-requête vers `/notifier-lot`
 * pour obtenir son propre budget de dix millisecondes de processeur ; au-delà de
 * quarante-cinq lots il répondait `507 trop-abonnes` et n'envoyait rien. Ce
 * découpage n'existait que pour le palier gratuit de Cloudflare. Il ne reste qu'une
 * boucle, avec une concurrence bornée pour ne pas ouvrir mille connexions d'un coup.
 *
 * La taille de lot valait 10, et le code disait d'elle qu'elle était « une estimation
 * prudente, NON MESURÉE ». Elle n'aura jamais été mesurée : la question ne se pose
 * plus.
 */
import { genererRequetePush, importerClesVapid } from './push.js'
import * as abonnements from './stockage/abonnements.ts'
import type { Abonnement } from './stockage/abonnements.ts'
import { PREFERENCES, PREFERENCE_DEFAUT } from './stockage/abonnements.ts'

/** Combien d'envois simultanés. Assez pour aller vite, pas assez pour saturer. */
const CONCURRENCE = 20

/** Une minute avant minuit, une annulation du matin n'a plus rien à dire. */
const DUREE_MIN_S = 5 * 60
const DUREE_MAX_S = 6 * 3600

export interface Charge {
  id?: string
  titre?: string
  corps?: string
  gravite?: string
  url?: string
  au?: string
  essai?: boolean
  rappel?: boolean
}

export interface Resultat {
  envoyees: number
  purgees: number
  echecs: number
  details: { service: string; statut: number; motif: string }[]
}

/**
 * Cet abonné doit-il recevoir cette notification ?
 *
 * Conséquence assumée : avec le défaut, une perturbation d'information ou d'attention
 * ne fait plus sonner les téléphones. Le bandeau dans l'application la montre déjà à
 * la prochaine ouverture, et réserver la sonnerie aux alertes est ce qui lui garde son
 * sens.
 */
export function accepte(preference: string, charge: Charge): boolean {
  const p = (PREFERENCES as readonly string[]).includes(preference)
    ? preference
    : PREFERENCE_DEFAUT
  // Un essai est demandé par l'abonné lui-même, pour lui-même : le filtrer sur sa
  // préférence le laisserait sans réponse, exactement là où il cherche à vérifier que
  // le mécanisme fonctionne.
  if (charge?.essai) return true
  if (charge?.rappel) return p !== 'urgences'
  if (p === 'tout') return true
  return charge?.gravite === 'alerte'
}

/**
 * Combien de temps le service de push doit retenir la notification si l'appareil est
 * éteint.
 *
 * Une annonce de bus annulé n'a d'intérêt que jusqu'à la fin de la journée d'école :
 * la délivrer le lendemain matin ferait courir un parent pour un bus qui roule.
 */
export function dureeDeVie(charge: Charge): number {
  const fin = Date.parse(`${charge?.au ?? ''}T18:30:00Z`)
  if (Number.isNaN(fin)) return 3600
  const restant = Math.floor((fin - Date.now()) / 1000)
  return Math.max(DUREE_MIN_S, Math.min(restant, DUREE_MAX_S))
}

/** Découpe une liste en tranches de `taille`, pour borner la concurrence. */
function tranches<T>(liste: T[], taille: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille))
  return out
}

/**
 * Envoie une charge à une liste d'abonnés.
 *
 * Les clés VAPID sont importées UNE fois pour tout l'envoi et non par destinataire :
 * sous Cloudflare, chaque lot repartant dans une invocation neuve, l'import était
 * refait à chaque fois. Ce n'est plus le cas.
 */
export async function envoyer(charge: Charge, liste: Abonnement[]): Promise<Resultat> {
  const cles = await importerClesVapid(process.env.VAPID_JWK)

  const resultat: Resultat = { envoyees: 0, purgees: 0, echecs: 0, details: [] }
  const contact = process.env.CONTACT_VAPID
  const ttl = dureeDeVie(charge)
  const urgence = charge.gravite === 'alerte' ? 'high' : 'normal'
  const corps = JSON.stringify(charge)

  // Un abonné qui n'a pas demandé ce type d'envoi n'est pas un échec : il est
  // simplement hors du périmètre, et ne doit apparaître dans aucun compteur d'erreur.
  const concernes = liste.filter((a) => accepte(a.preference, charge))

  for (const tranche of tranches(concernes, CONCURRENCE)) {
    await Promise.all(
      tranche.map(async (abonnement) => {
        try {
          const { headers, body, endpoint } = await genererRequetePush({
            cles,
            abonnement: { endpoint: abonnement.endpoint, keys: abonnement.keys },
            charge: corps,
            contact,
            ttl,
            urgence,
          })

          const reponse = await fetch(endpoint, { method: 'POST', headers, body })

          // 404 et 410 signifient que l'abonnement n'existe plus côté navigateur :
          // on le supprime plutôt que de le réessayer indéfiniment.
          if (reponse.status === 404 || reponse.status === 410) {
            await abonnements.supprimerParHash(abonnement.endpointHash)
            resultat.purgees++
          } else if (reponse.ok) {
            resultat.envoyees++
            await abonnements.noterSucces(abonnement.endpointHash)
          } else {
            // Les services de push expliquent leur refus dans le corps : on le garde.
            // Apple renvoie par exemple {"reason":"BadJwtToken"}.
            const motif = (await reponse.text().catch(() => '')).slice(0, 200)
            resultat.echecs++
            resultat.details.push({
              service: new URL(endpoint).host,
              statut: reponse.status,
              motif,
            })
            console.log(`push refusé par ${new URL(endpoint).host} : ${reponse.status} ${motif}`)
          }
        } catch (e) {
          // Une panne de chiffrement ou de réseau est passagère : surtout ne pas
          // supprimer un abonné valide à cause d'elle.
          resultat.echecs++
          resultat.details.push({ service: 'exception', statut: 0, motif: String(e).slice(0, 200) })
          console.log(`échec d'envoi pour ${abonnement.endpointHash} : ${e}`)
        }
      }),
    )
  }

  return resultat
}

/** Envoie à tout le monde. */
export async function envoyerATous(charge: Charge): Promise<Resultat & { total: number }> {
  const liste = await abonnements.tous()
  const resultat = await envoyer(charge, liste)
  return { ...resultat, total: liste.length }
}
