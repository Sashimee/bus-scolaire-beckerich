/**
 * Le relevé de visite, auto-hébergé (lots 27-28).
 *
 * Remplace le script GoatCounter tiers : un seul relevé part à l'ouverture, vers NOTRE
 * serveur (`URL_API`), et rien d'autre. Le serveur normalise le chemin — on lui envoie
 * `location.pathname`, jamais la requête ni le fragment `#partage=…` où vivent les données
 * de famille. Sans serveur configuré, la fonction ne fait rien : la mesure est un confort,
 * pas une condition de fonctionnement.
 *
 * On mesure la page d'ARRIVÉE seulement, comme avant : un relevé au démarrage, pas un par
 * navigation interne (décision assumée — voir R36). Sur la PWA installée, l'arrivée est
 * toujours `start_url`, donc `/`.
 */
import { URL_API } from '../config'

let deja = false

export function mesurer(): void {
  // Une seule fois par chargement, et jamais sans serveur en face.
  if (deja || !URL_API) return
  deja = true

  // On n'envoie que le chemin, sans la requête ni le fragment : `location.pathname` les
  // exclut déjà par construction. Le serveur le normalise encore à un écran connu.
  const corps = JSON.stringify({ chemin: location.pathname })

  try {
    // `sendBeacon` ne bloque pas le déchargement et n'attend aucune réponse — c'est ce
    // qu'il faut pour un relevé qui ne doit rien coûter à l'ouverture. Repli `fetch`
    // `keepalive` pour les rares navigateurs sans `sendBeacon`.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${URL_API}/mesure`, new Blob([corps], { type: 'application/json' }))
    } else {
      void fetch(`${URL_API}/mesure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corps,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    /* un relevé perdu n'est jamais une panne : on n'en dit rien */
  }
}
