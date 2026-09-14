/**
 * Les abonnements aux notifications.
 *
 * Le serveur ne détient ici aucune donnée de famille : un point de terminaison push
 * est un identifiant d'appareil opaque, émis par Apple, Google ou Mozilla. Ni nom, ni
 * adresse, ni cycle — c'est le premier principe du projet, et il ne change pas parce
 * que le stockage change.
 */
import { base, type Sql } from './client.ts'
import { empreinte } from '../crypto.ts'

/**
 * Ce que chaque abonné accepte de recevoir.
 *
 * `urgences-rappels` est le défaut, y compris pour les abonnements enregistrés avant
 * ce réglage : c'est le compromis que la plupart des parents choisiraient, et il vaut
 * mieux qu'une absence de valeur ne veuille dire « tout » par accident.
 */
export const PREFERENCES = ['urgences', 'urgences-rappels', 'tout'] as const
export const PREFERENCE_DEFAUT = 'urgences-rappels'

/**
 * Les services de push que nous acceptons d'appeler.
 *
 * Un endpoint arrive d'un inconnu — `POST /abonner` n'exige aucun compte — et
 * `envois.ts` en fait un `fetch` à chaque notification. Sans cette liste, n'importe
 * qui faisait émettre au serveur une requête vers l'adresse de son choix, y compris
 * une adresse interne à la VPS, et en relisait le début de la réponse dans le rapport
 * d'envoi. Le sous-domaine varie (`updates.push.services.mozilla.com`,
 * `wns2-*.notify.windows.com`) : on compare donc sur le suffixe, jamais sur l'égalité
 * seule. Voir la réserve R58.
 */
const HOTES_PUSH = [
  'android.googleapis.com',
  'fcm.googleapis.com',
  'web.push.apple.com',
  'push.services.mozilla.com',
  'notify.windows.com',
] as const

/** Vrai si `endpoint` est une URL d'un service de push connu, appelable sans risque. */
export function endpointAcceptable(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  // Un port ou des identifiants dans l'URL ne servent à aucun service de push : les
  // refuser ferme le détournement vers un autre service du même hôte.
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false
  const hote = url.hostname.toLowerCase()
  return HOTES_PUSH.some((h) => hote === h || hote.endsWith(`.${h}`))
}

export interface Abonnement {
  endpointHash: string
  endpoint: string
  keys: Record<string, string>
  preference: string
}

const versAbonnement = (l: Record<string, unknown>): Abonnement => ({
  endpointHash: l.endpoint_hash as string,
  endpoint: l.endpoint as string,
  keys: l.cles as Record<string, string>,
  preference: l.preference as string,
})

/**
 * Enregistre ou remplace un abonnement.
 *
 * La clé est dérivée du endpoint : se réabonner ne crée pas de doublon, et rechanger
 * de préférence remplace simplement l'enregistrement. `cree_le` est conservé au
 * remplacement — c'est la date du premier abonnement qui a du sens, pas celle du
 * dernier changement de réglage.
 */
export async function enregistrer(
  endpoint: string,
  keys: unknown,
  preference: string,
  db: Sql = base(),
): Promise<void> {
  const hash = await empreinte(endpoint)
  await db`
    insert into abonnement (endpoint_hash, endpoint, cles, preference)
    values (${hash}, ${endpoint}, ${db.json((keys ?? {}) as never)}, ${preference})
    on conflict (endpoint_hash) do update
      set endpoint = excluded.endpoint,
          cles = excluded.cles,
          preference = excluded.preference
  `
}

export async function supprimerParEndpoint(endpoint: string, db: Sql = base()): Promise<void> {
  await db`delete from abonnement where endpoint_hash = ${await empreinte(endpoint)}`
}

export async function supprimerParHash(hash: string, db: Sql = base()): Promise<void> {
  await db`delete from abonnement where endpoint_hash = ${hash}`
}

export async function lireParEndpoint(
  endpoint: string,
  db: Sql = base(),
): Promise<Abonnement | null> {
  const lignes = await db`
    select * from abonnement where endpoint_hash = ${await empreinte(endpoint)}
  `
  return lignes.length ? versAbonnement(lignes[0]) : null
}

/**
 * Tous les abonnements.
 *
 * Le Worker devait paginer et découper en lots de dix pour tenir dans dix
 * millisecondes de processeur. Ici, quelques centaines de lignes tiennent en mémoire
 * sans que la question se pose.
 */
export async function tous(db: Sql = base()): Promise<Abonnement[]> {
  const lignes = await db`select * from abonnement order by cree_le`
  return lignes.map(versAbonnement)
}

export async function noterSucces(hash: string, db: Sql = base()): Promise<void> {
  await db`update abonnement set dernier_succes = now() where endpoint_hash = ${hash}`
}

export async function compter(db: Sql = base()): Promise<number> {
  const [ligne] = await db`select count(*)::int as n from abonnement`
  return ligne.n as number
}
