import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useUrgences } from '../urgences-contexte'
import { arrets } from '../lib/donnees'
import { nomArret } from '../lib/affichage'
import { distanceVolOiseau } from '../lib/distance'
import { CHEMIN_ARRETS, CHEMIN_URGENCES } from '../config'
import { ecrireFichier, lireFichier } from '../lib/github'
import type { Arret } from '../lib/types'
import type { CorrectionArret, Urgences } from '../lib/urgences'

interface Props {
  jeton: string
  auteur: string
  onErreur: (e: string | null) => void
}

/** Latitude/longitude affichées avec la précision utile, pas plus. */
const fmt = (n: number) => n.toFixed(5)

/**
 * Vérification et correction de la position des arrêts.
 *
 * Deux niveaux volontairement distincts : une correction temporaire prend effet en
 * une minute sans reconstruire le site, une correction définitive modifie les données
 * de référence. On veut pouvoir réagir vite à un arrêt mal placé sans être obligé de
 * trancher tout de suite s'il s'agit d'une erreur durable ou d'un déplacement passager.
 */
export function AdminArrets({ jeton, auteur, onErreur }: Props) {
  const { t } = useT()
  const { urgences, rafraichir } = useUrgences()
  const conteneur = useRef<HTMLDivElement>(null)

  const [selection, setSelection] = useState<Arret | null>(null)
  const [nouvelle, setNouvelle] = useState<[number, number] | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [temporaireJusqua, setTemporaireJusqua] = useState('')

  const corrections = urgences.correctionsArrets ?? []

  // Carte de tous les arrêts. Chargée paresseusement comme ailleurs dans l'app.
  useEffect(() => {
    if (!conteneur.current || !navigator.onLine) return
    let carte: import('leaflet').Map | undefined
    let annule = false

    void (async () => {
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      if (annule || !conteneur.current) return

      carte = L.map(conteneur.current)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(carte)

      for (const a of arrets) {
        L.circleMarker([a.coord[0], a.coord[1]], {
          radius: 7,
          weight: 2,
          color: a.precision === 'verifiee' ? '#9ece6a' : '#e0af68',
          fillOpacity: 0.7,
        })
          .addTo(carte)
          .bindTooltip(`${nomArret(a, t)} — ${t(`arrets.precision.${a.precision}`)}`)
          .on('click', () => {
            setSelection(a)
            setNouvelle(null)
          })
      }

      // Un clic hors marqueur déplace l'arrêt sélectionné.
      carte.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        setNouvelle([Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))])
      })

      carte.fitBounds(L.latLngBounds(arrets.map((a) => [a.coord[0], a.coord[1]])).pad(0.15))
    })()

    return () => {
      annule = true
      carte?.remove()
    }
  }, [t])

  async function publier(temporaire: boolean) {
    if (!selection || !nouvelle) return
    setOccupe(true)
    onErreur(null)
    try {
      if (temporaire) {
        const { contenu, sha } = await lireFichier<Urgences>(jeton, CHEMIN_URGENCES)
        const correction: CorrectionArret = {
          arret: selection.id,
          coord: nouvelle,
          ...(temporaireJusqua ? { jusqua: temporaireJusqua } : {}),
          publieLe: new Date().toISOString(),
          publiePar: auteur,
        }
        await ecrireFichier(
          jeton,
          CHEMIN_URGENCES,
          {
            ...contenu,
            misAJour: new Date().toISOString(),
            correctionsArrets: [
              ...(contenu.correctionsArrets ?? []).filter((c) => c.arret !== selection.id),
              correction,
            ],
          },
          sha,
          `Correction temporaire de l'arrêt ${selection.id}`,
        )
      } else {
        const { contenu, sha } = await lireFichier<{ arrets: Arret[] }>(jeton, CHEMIN_ARRETS)
        await ecrireFichier(
          jeton,
          CHEMIN_ARRETS,
          {
            ...contenu,
            arrets: contenu.arrets.map((a) =>
              a.id === selection.id
                ? {
                    ...a,
                    coord: nouvelle,
                    precision: 'verifiee',
                    source: `Position corrigée à la main le ${new Date().toISOString().slice(0, 10)}`,
                  }
                : a,
            ),
          },
          sha,
          `Position définitive de l'arrêt ${selection.id}`,
        )
      }
      setNouvelle(null)
      setTimeout(rafraichir, 90_000)
    } catch (e) {
      onErreur(e instanceof Error ? e.message : 'publication-impossible')
    } finally {
      setOccupe(false)
    }
  }

  async function retirerCorrection(idArret: string) {
    setOccupe(true)
    try {
      const { contenu, sha } = await lireFichier<Urgences>(jeton, CHEMIN_URGENCES)
      await ecrireFichier(
        jeton,
        CHEMIN_URGENCES,
        {
          ...contenu,
          misAJour: new Date().toISOString(),
          correctionsArrets: (contenu.correctionsArrets ?? []).filter((c) => c.arret !== idArret),
        },
        sha,
        `Retrait de la correction de l'arrêt ${idArret}`,
      )
      setTimeout(rafraichir, 90_000)
    } catch (e) {
      onErreur(e instanceof Error ? e.message : 'publication-impossible')
    } finally {
      setOccupe(false)
    }
  }

  const approximatifs = arrets.filter((a) => a.precision === 'approximative')
  const deplacement =
    selection && nouvelle ? Math.round(distanceVolOiseau(selection.coord, nouvelle)) : null

  return (
    <section className="pile pile--serre">
      <h3 className="titre-carte">{t('adminArrets.titre')}</h3>
      <p className="champ__aide">{t('adminArrets.aide')}</p>

      {approximatifs.length > 0 && (
        <div className="encart encart--attention">
          <div className="encart__titre">
            {t('adminArrets.aVerifier', { nombre: approximatifs.length })}
          </div>
          {approximatifs.map((a) => nomArret(a, t)).join(' · ')}
        </div>
      )}

      <div className="carte-osm" ref={conteneur} />
      <p className="champ__aide">{t('adminArrets.mode')}</p>

      {selection && (
        <div className="carte pile pile--serre">
          <strong>{nomArret(selection, t)}</strong>
          <p className="champ__aide">
            {t('adminArrets.actuelle')} : {fmt(selection.coord[0])}, {fmt(selection.coord[1])} —{' '}
            {t(`arrets.precision.${selection.precision}`)}
          </p>
          <p className="champ__aide">{selection.source}</p>

          {nouvelle ? (
            <>
              <p>
                <strong>{t('adminArrets.nouvelle')} :</strong> {fmt(nouvelle[0])}, {fmt(nouvelle[1])}
                {deplacement !== null && (
                  <span className="champ__aide"> · {t('adminArrets.deplace', { metres: deplacement })}</span>
                )}
              </p>

              <div className="champ">
                <label htmlFor="temp-jusqua">{t('adminArrets.jusqua')}</label>
                <input
                  id="temp-jusqua"
                  type="date"
                  value={temporaireJusqua}
                  onChange={(e) => setTemporaireJusqua(e.target.value)}
                />
                <p className="champ__aide">{t('adminArrets.jusquaAide')}</p>
              </div>

              <div className="rangee">
                <button
                  type="button"
                  className="bouton"
                  disabled={occupe}
                  onClick={() => publier(true)}
                >
                  {t('adminArrets.temporaire')}
                </button>
                <button
                  type="button"
                  className="bouton bouton--primaire"
                  disabled={occupe}
                  onClick={() => publier(false)}
                >
                  {t('adminArrets.definitive')}
                </button>
                <button
                  type="button"
                  className="bouton bouton--discret"
                  onClick={() => setNouvelle(null)}
                >
                  {t('commun.annuler')}
                </button>
              </div>
              <p className="champ__aide">{t('adminArrets.differenceAide')}</p>
            </>
          ) : (
            <p className="champ__aide">{t('adminArrets.cliquerCarte')}</p>
          )}
        </div>
      )}

      {corrections.length > 0 && (
        <div className="pile pile--serre">
          <h4>{t('adminArrets.enCours', { nombre: corrections.length })}</h4>
          {corrections.map((c) => (
            <div className="carte rangee rangee--espacee" key={c.arret}>
              <span>
                <strong>{c.arret}</strong>{' '}
                <span className="champ__aide">
                  {fmt(c.coord[0])}, {fmt(c.coord[1])}
                  {c.jusqua ? ` · ${t('adminArrets.expire', { date: c.jusqua })}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="bouton bouton--danger"
                disabled={occupe}
                onClick={() => retirerCorrection(c.arret)}
              >
                {t('admin.retirer')}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
