import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { nomArret } from '../lib/affichage'
import type { Arret, Coord } from '../lib/types'

interface Props {
  depuis: Coord
  vers: Arret
}

/**
 * Petite carte du trajet à pied domicile → arrêt.
 *
 * C'est le SEUL élément de l'application qui a besoin du réseau. Il se charge donc
 * paresseusement et, hors ligne, cède la place à un texte : l'application doit rester
 * pleinement utilisable à l'arrêt de bus, sans couverture.
 */
export function CarteTrajet({ depuis, vers }: Props) {
  const { t } = useT()
  const conteneur = useRef<HTMLDivElement>(null)
  const [echec, setEchec] = useState(!navigator.onLine)

  useEffect(() => {
    if (!navigator.onLine || !conteneur.current) return
    let carte: import('leaflet').Map | undefined
    let annule = false

    // Import différé : Leaflet ne pèse dans le bundle initial d'aucun parent qui
    // n'ouvre jamais une fiche enfant.
    ;(async () => {
      try {
        const L = await import('leaflet')
        await import('leaflet/dist/leaflet.css')
        if (annule || !conteneur.current) return

        carte = L.map(conteneur.current, { attributionControl: true })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '© OpenStreetMap',
        }).addTo(carte)

        const domicile = L.latLng(depuis[0], depuis[1])
        const arret = L.latLng(vers.coord[0], vers.coord[1])

        L.marker(domicile).addTo(carte).bindPopup(t('carte.domicile'))
        L.marker(arret).addTo(carte).bindPopup(nomArret(vers, t))
        // Leaflet dessine sur un canevas : il lui faut une couleur résolue, pas une
        // variable CSS. On la lit donc sur la racine, pour que le tracé suive le thème.
        const accent =
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
          '#a9dcf5'
        L.polyline([domicile, arret], { color: accent, dashArray: '6 6' }).addTo(carte)

        carte.fitBounds(L.latLngBounds([domicile, arret]).pad(0.35))
      } catch {
        if (!annule) setEchec(true)
      }
    })()

    return () => {
      annule = true
      carte?.remove()
    }
  }, [depuis, vers, t])

  if (echec) {
    return <p className="champ__aide sans-impression">{t('carte.horsLigne')}</p>
  }

  return (
    <div
      className="carte-osm sans-impression"
      ref={conteneur}
      role="img"
      aria-label={`${t('carte.titre')} — ${t('carte.domicile')} → ${nomArret(vers, t)}`}
    />
  )
}
