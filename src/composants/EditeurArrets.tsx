import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useUrgences } from '../urgences-contexte'
import { arrets } from '../lib/donnees'
import { nomArret } from '../lib/affichage'
import { distanceVolOiseau } from '../lib/distance'
import { publierCorrection, retirerCorrection, type SessionCompte } from '../lib/comptes'
import type { Arret } from '../lib/types'

/** Latitude/longitude affichées avec la précision utile, pas plus. */
const fmt = (n: number) => n.toFixed(5)

/**
 * Correction de position d'un arrêt, gardée par la capacité `arrets` (lot 25, 7b —
 * remplace l'onglet Arrêts de l'ancien `/admin` par jeton GitHub).
 *
 * Une seule sorte de correction ici : la TEMPORAIRE, publiée en base et effective tout
 * de suite. La correction définitive de l'ancien `/admin` écrivait dans `arrets.json` du
 * dépôt — une donnée de référence qui se corrige par une mise à jour du dépôt, pas depuis
 * une page web. On garde donc le geste rapide et réversible, et on renvoie le durable là
 * où il appartient.
 */
export function EditeurArrets({ session }: { session: SessionCompte }) {
  const { t } = useT()
  const { urgences, rafraichir } = useUrgences()
  const conteneur = useRef<HTMLDivElement>(null)

  const [selection, setSelection] = useState<Arret | null>(null)
  const [nouvelle, setNouvelle] = useState<[number, number] | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [jusqua, setJusqua] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

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

  async function publier() {
    if (!selection || !nouvelle) return
    setOccupe(true)
    setErreur(null)
    try {
      await publierCorrection(session, {
        arret: selection.id,
        coord: nouvelle,
        ...(jusqua ? { jusqua } : {}),
      })
      setNouvelle(null)
      // Effectif tout de suite, plus d'attente de reconstruction : on relit sans délai.
      rafraichir()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'publication-impossible')
    } finally {
      setOccupe(false)
    }
  }

  async function retirer(idArret: string) {
    setOccupe(true)
    setErreur(null)
    try {
      await retirerCorrection(session, idArret)
      rafraichir()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'publication-impossible')
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

      {erreur && <div className="encart encart--alerte">{erreur}</div>}

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
                <label htmlFor="corr-jusqua">{t('adminArrets.jusqua')}</label>
                <input
                  id="corr-jusqua"
                  type="date"
                  value={jusqua}
                  onChange={(e) => setJusqua(e.target.value)}
                />
                <p className="champ__aide">{t('adminArrets.jusquaAide')}</p>
              </div>

              <div className="rangee">
                <button
                  type="button"
                  className="bouton bouton--primaire"
                  disabled={occupe}
                  onClick={() => void publier()}
                >
                  {t('adminArrets.temporaire')}
                </button>
                <button
                  type="button"
                  className="bouton bouton--discret"
                  onClick={() => setNouvelle(null)}
                >
                  {t('commun.annuler')}
                </button>
              </div>
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
                onClick={() => void retirer(c.arret)}
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
