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
 *
 * Et il ne se charge QUE sur demande. Les tuiles sont réclamées à OpenStreetMap par
 * leurs coordonnées `{z}/{x}/{y}`, calculées depuis le domicile jusqu'au zoom 18 : la
 * tuile centrale désigne le pâté de maisons. Montée au montage, cette carte faisait
 * donc sortir de l'appareil une dérivée de l'adresse à chaque ouverture d'une fiche
 * enfant, alors que l'application affirme par ailleurs que rien n'en sort. Le premier
 * principe du projet veut que ce soit le parent qui le décide, en sachant quoi. R61.
 */
export function CarteTrajet({ depuis, vers }: Props) {
  const { t } = useT()
  const conteneur = useRef<HTMLDivElement>(null)
  const [echec, setEchec] = useState(!navigator.onLine)
  const [demandee, setDemandee] = useState(false)

  useEffect(() => {
    if (!demandee || !navigator.onLine || !conteneur.current) return
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
  }, [demandee, depuis, vers, t])

  if (echec) {
    return <p className="champ__aide sans-impression">{t('carte.horsLigne')}</p>
  }

  if (!demandee) {
    return (
      <div className="pile pile--serre sans-impression">
        <button type="button" className="bouton" onClick={() => setDemandee(true)}>
          {t('carte.afficher')}
        </button>
        <p className="champ__aide">{t('carte.avertissement')}</p>
      </div>
    )
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
