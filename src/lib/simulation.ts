/**
 * Simulation d'une date, pour la mise au point.
 *
 * Rien ne se vérifie aussi mal qu'un écran qui dépend de l'heure : « pas d'école
 * aujourd'hui », le prochain départ, le passage au trajet suivant ne se montrent que le
 * jour et à la minute où ils tombent. Attendre un lundi de Carnaval à 7 h 12 pour voir
 * l'écran d'accueil dans cet état n'est pas une méthode de vérification.
 *
 * Le réglage vit dans `localStorage`, comme le reste : il n'y a pas de serveur pour le
 * porter, et il ne concerne que l'appareil sur lequel on met au point. Il s'active
 * depuis `/admin` — nulle part ailleurs, pour qu'un parent ne le rencontre jamais par
 * hasard — et se voit alors sur la page « Aujourd'hui ».
 */
const CLE_ACTIVE = 'bus-beckerich.simulation'
const CLE_DATE = 'bus-beckerich.simulation-date'

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}

function ecrire(cle: string, valeur: string | null): void {
  try {
    if (valeur === null) localStorage.removeItem(cle)
    else localStorage.setItem(cle, valeur)
  } catch {
    /* Stockage indisponible : la simulation ne survivra pas au rechargement, sans plus. */
  }
}

/** Le sélecteur de date doit-il apparaître sur la page « Aujourd'hui » ? */
export const simulationActive = (): boolean => lire(CLE_ACTIVE) === 'oui'

export function definirSimulationActive(actif: boolean): void {
  ecrire(CLE_ACTIVE, actif ? 'oui' : null)
  // Couper la simulation doit rendre l'heure réelle, pas laisser une date figée qui
  // ressortirait à la prochaine activation sans qu'on comprenne d'où elle vient.
  if (!actif) ecrire(CLE_DATE, null)
}

/** La valeur brute du champ, au format d'un `input[type=datetime-local]`. */
export const valeurSimulee = (): string => (simulationActive() ? (lire(CLE_DATE) ?? '') : '')

export function definirValeurSimulee(valeur: string): void {
  ecrire(CLE_DATE, valeur || null)
}

/**
 * La date simulée, ou `null` s'il faut s'en tenir à l'heure réelle.
 *
 * Le champ est lu comme une date LOCALE, chiffre par chiffre : `new Date('2026-02-16')`
 * serait compris en UTC et déplacerait le jour simulé, ce qui est exactement l'erreur
 * qu'on cherche à traquer avec cet outil.
 */
export function dateSimulee(): Date | null {
  const valeur = valeurSimulee()
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valeur)
  if (!m) return null
  const [, a, mois, j, h, min] = m.map(Number)
  return new Date(a, mois - 1, j, h, min)
}

/** L'instant sur lequel l'application doit se régler : la date simulée, sinon l'heure. */
export const maintenantSimule = (): Date => dateSimulee() ?? new Date()
