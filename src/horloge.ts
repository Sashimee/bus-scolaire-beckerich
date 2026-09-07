/**
 * L'heure courante, qui avance d'elle-même.
 *
 * `new Date()` au fil du rendu donne une heure juste au premier affichage et fausse
 * ensuite : rien ne provoque de nouveau rendu quand une minute passe. L'écran
 * « Aujourd'hui » s'en accommodait par accident — la relecture des perturbations, toutes
 * les dix minutes, le rafraîchissait au passage. Un compte à rebours qui dépend d'un
 * `fetch` est une horloge qui s'arrête hors ligne, et un « prochain départ » qui peut
 * désigner un bus déjà parti.
 *
 * Le battement est calé sur le changement de minute plutôt que posé toutes les
 * soixante secondes : l'application affiche des minutes, elles doivent tourner quand
 * elles tournent au clocher, pas trente secondes plus tard.
 */
import { useEffect, useState } from 'react'

const MINUTE_MS = 60_000

export function useMaintenant(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date())

  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout>

    const programmer = () => {
      minuterie = setTimeout(battre, MINUTE_MS - (Date.now() % MINUTE_MS))
    }

    function battre() {
      setMaintenant(new Date())
      programmer()
    }

    programmer()

    // iOS gèle les minuteries d'un onglet en arrière-plan, et une application installée
    // passe son temps en arrière-plan : au retour, l'heure affichée peut avoir des
    // heures de retard. C'est le moment exact où le parent regarde l'écran.
    const auRetour = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(minuterie)
      battre()
    }
    document.addEventListener('visibilitychange', auRetour)

    return () => {
      clearTimeout(minuterie)
      document.removeEventListener('visibilitychange', auRetour)
    }
  }, [])

  return maintenant
}
