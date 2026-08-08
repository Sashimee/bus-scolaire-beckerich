/**
 * Nettoyage et validation de toute donnée entrante.
 *
 * Point de passage unique. Trois sources échappent au contrôle de l'application :
 * un lien de partage — que n'importe qui peut faire ouvrir —, le fichier des urgences
 * relu à chaque ouverture, et les formulaires d'administration. Aucune n'est digne de
 * confiance, y compris celles que nous produisons nous-mêmes : il suffit d'un `curl`
 * ou d'un lien trafiqué pour y injecter n'importe quoi.
 *
 * La règle est de **refuser proprement**, jamais de deviner : une adresse de domicile
 * placée au large de l'Afrique parce qu'une coordonnée valait `NaN` est pire qu'un
 * lien rejeté.
 */

/**
 * Boîte englobante du Luxembourg, marges comprises.
 *
 * Volontairement large : la commune de Beckerich est au nord-ouest, mais une adresse
 * dérogatoire peut être ailleurs dans le pays. Ce n'est pas un contrôle de précision,
 * c'est un garde-fou contre l'absurde — un `0, 0` ou un `NaN` qui passerait pour un point.
 */
export const BOITE_LUXEMBOURG = {
  latMin: 49.44,
  latMax: 50.19,
  lonMin: 5.72,
  lonMax: 6.55,
}

/**
 * Une heure « HH:MM » sur 24 heures, et une date ISO.
 *
 * Exportées : la validation du plan officiel s'en sert aussi. Deux copies de la même
 * expression finiraient par diverger, et l'une des deux laisserait passer ce que
 * l'autre refuse.
 */
export const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/
export const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Caractères de contrôle (`Cc`) et de formatage (`Cf`).
 *
 * `Cf` couvre les marques de direction bidirectionnelle. Un RIGHT-TO-LEFT OVERRIDE
 * glissé dans un prénom inverse l'affichage de toute la ligne qui suit : le prénom
 * devient illisible, et surtout il peut déguiser ce qui l'entoure. Ces caractères
 * n'ont aucune place dans un prénom ni dans un nom de rue, on les retire.
 *
 * Les propriétés Unicode plutôt qu'une liste de points de code : la liste serait
 * écrite avec les caractères eux-mêmes, donc invisible dans l'éditeur comme dans une
 * revue de code — précisément le défaut qu'ils servent à exploiter.
 */
const INDESIRABLES = /[\p{Cc}\p{Cf}]/gu

/**
 * Ramène une valeur quelconque à un texte sûr, tronqué à `max` caractères.
 *
 * `normalize('NFC')` d'abord : sans elle, « é » composé en deux points de code compte
 * double dans la troncature et se coupe parfois en son milieu, laissant un accent
 * orphelin.
 */
export function texteSur(valeur: unknown, max: number): string {
  if (typeof valeur !== 'string') return ''
  return valeur
    .normalize('NFC')
    .replace(INDESIRABLES, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Une coordonnée exploitable : deux nombres finis, dans le pays. */
export function coordValide(valeur: unknown): valeur is [number, number] {
  if (!Array.isArray(valeur) || valeur.length !== 2) return false
  const [lat, lon] = valeur
  if (typeof lat !== 'number' || typeof lon !== 'number') return false
  // `Number.isFinite` écarte `NaN` et les infinis, que `typeof === 'number'` accepte.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  return (
    lat >= BOITE_LUXEMBOURG.latMin &&
    lat <= BOITE_LUXEMBOURG.latMax &&
    lon >= BOITE_LUXEMBOURG.lonMin &&
    lon <= BOITE_LUXEMBOURG.lonMax
  )
}

/** « HH:MM » sur 24 heures. */
export function heureValide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && HEURE.test(valeur)
}

/**
 * « AAAA-MM-JJ », et une date qui existe vraiment.
 *
 * L'expression seule laisserait passer un 2026-02-31 : on reconstruit la date et on
 * vérifie qu'elle se réécrit à l'identique.
 */
export function dateIsoValide(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || !DATE_ISO.test(valeur)) return false
  const d = new Date(`${valeur}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur
}

/** Un entier dans un intervalle fermé. Sert aux minutes de retard, aux compteurs. */
export function entierEntre(valeur: unknown, min: number, max: number): valeur is number {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= min && valeur <= max
}
