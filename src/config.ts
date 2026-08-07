/**
 * Points de configuration externes.
 *
 * Tout est optionnel : sans Worker configuré, l'application fonctionne exactement
 * comme avant, simplement sans notifications ni connexion GitHub. Rien ne casse.
 */

/** Dépôt qui héberge le fichier des urgences. */
export const DEPOT = {
  proprietaire: 'Sashimee',
  nom: 'bus-scolaire-beckerich',
  branche: 'main',
}

/** Chemin du fichier des urgences dans le dépôt. */
export const CHEMIN_URGENCES = 'public/urgences.json'

/** Position de référence des arrêts. Modifier ce fichier demande une reconstruction. */
export const CHEMIN_ARRETS = 'src/data/arrets.json'

/** Plan de référence. Le nom du fichier ne change pas : seul son contenu est remplacé. */
export const CHEMIN_PLAN = 'src/data/plan-2025-2026.json'

/**
 * Worker Cloudflare : échange OAuth GitHub et envoi des notifications push.
 * Défini à la construction via VITE_URL_WORKER. Vide = fonctionnalités désactivées.
 */
export const URL_WORKER: string = (import.meta.env.VITE_URL_WORKER ?? '').replace(/\/$/, '')

/** Clé publique VAPID, nécessaire pour s'abonner aux notifications. */
export const CLE_VAPID_PUBLIQUE: string = import.meta.env.VITE_CLE_VAPID ?? ''

export const notificationsConfigurees = () => Boolean(URL_WORKER && CLE_VAPID_PUBLIQUE)
export const connexionGithubConfiguree = () => Boolean(URL_WORKER)

/** Lien vers l'éditeur GitHub du fichier, secours quand la publication directe échoue. */
export const lienEditeurGithub = () =>
  `https://github.com/${DEPOT.proprietaire}/${DEPOT.nom}/edit/${DEPOT.branche}/${CHEMIN_URGENCES}`
