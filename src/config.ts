/**
 * Points de configuration externes.
 *
 * Tout est optionnel : sans serveur configuré, l'application fonctionne exactement
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

/** Corrections de traduction, hors bundle : relues à chaque ouverture. */
export const CHEMIN_TRADUCTIONS = 'public/traductions.json'

/** Crédits. Dans le bundle : les modifier demande une reconstruction. */
export const CHEMIN_CREDITS = 'src/data/credits.json'

/**
 * Serveur : échange OAuth GitHub, abonnements et envoi des notifications push.
 *
 * Défini à la construction via `VITE_URL_API`. **Vide = fonctionnalités désactivées**,
 * et c'est le comportement à préserver : sans serveur, l'espace commune s'affiche
 * « non configuré », les notifications et Google Agenda disparaissent de l'interface,
 * et l'application parent continue de fonctionner intégralement.
 *
 * Aucune valeur par défaut, donc — surtout pas `/api`. Une origine sans serveur en
 * face y répondrait par la page de l'application, l'appel échouerait sur du HTML, et
 * la panne se lirait « erreur réseau » au lieu de « non configuré ».
 *
 * `VITE_URL_WORKER` reste lu en second : c'est le nom que porte encore la variable de
 * dépôt pendant la bascule, et une construction faite avec l'ancien nom doit produire
 * une application qui marche, pas une application muette.
 */
export const URL_API: string = (
  // `||` et non `??` : une variable de dépôt GitHub non définie arrive ici comme
  // chaîne VIDE, pas comme `undefined`. Avec `??`, le repli sur l'ancien nom ne se
  // déclencherait jamais, et une construction faite avant le renommage de la variable
  // produirait une application sans notifications, sans espace commune et sans
  // Google Agenda — sans qu'aucune erreur ne le dise.
  import.meta.env.VITE_URL_API ||
  import.meta.env.VITE_URL_WORKER ||
  ''
).replace(/\/$/, '')

/** Clé publique VAPID, nécessaire pour s'abonner aux notifications. */
export const CLE_VAPID_PUBLIQUE: string = import.meta.env.VITE_CLE_VAPID ?? ''

/**
 * ID client OAuth Google, pour l'écriture dans Google Agenda.
 *
 * Public par construction : le flux PKCE n'a pas de secret client. Vide, l'intégration
 * disparaît de l'interface et l'export `.ics` reste seul — même politique que les
 * notifications.
 */
export const ID_CLIENT_GOOGLE: string = import.meta.env.VITE_ID_CLIENT_GOOGLE ?? ''

export const notificationsConfigurees = () => Boolean(URL_API && CLE_VAPID_PUBLIQUE)
export const connexionGithubConfiguree = () => Boolean(URL_API)

/** Lien vers l'éditeur GitHub du fichier, secours quand la publication directe échoue. */
export const lienEditeurGithub = () =>
  `https://github.com/${DEPOT.proprietaire}/${DEPOT.nom}/edit/${DEPOT.branche}/${CHEMIN_URGENCES}`
