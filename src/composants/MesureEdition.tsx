import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { lireMesures, type Mesures } from '../lib/edition'
import type { SessionCompte } from '../lib/comptes'

/**
 * La fréquentation, auto-hébergée (lots 27-28) — ce que montrait le tableau de bord
 * GoatCounter, désormais servi par notre serveur. Rien de personnel n'y figure : le
 * serveur ne garde qu'un écran connu et une date, jamais un identifiant ni un fragment.
 *
 * Volontairement sans graphique : des chiffres et une répartition par écran suffisent à
 * savoir si l'application sert, et une barre proportionnelle demanderait une largeur en
 * ligne, que la charte du projet interdit dans un composant.
 */
const FENETRE_JOURS = 30

export function MesureEdition({ session }: { session: SessionCompte }) {
  const { t } = useT()
  const [mesures, setMesures] = useState<Mesures | null>(null)
  const [echec, setEchec] = useState(false)

  const charger = async () => {
    setEchec(false)
    setMesures(null)
    try {
      setMesures(await lireMesures(session, FENETRE_JOURS))
    } catch {
      setEchec(true)
    }
  }

  useEffect(() => {
    void charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Le nom d'un écran : l'accueil et « autre » se disent, le reste garde son chemin. */
  const nomEcran = (chemin: string) =>
    chemin === '/' ? t('mesure.accueil') : chemin === 'autre' ? t('mesure.autre') : chemin

  return (
    <div className="pile pile--serre">
      <div className="rangee rangee--espacee">
        <p className="champ__aide">{t('mesure.aide', { jours: FENETRE_JOURS })}</p>
        <button type="button" className="bouton bouton--discret" onClick={() => void charger()}>
          {t('mesure.recharger')}
        </button>
      </div>

      {echec && <div className="encart encart--attention">{t('mesure.echec')}</div>}
      {!echec && mesures === null && <p className="champ__aide">{t('commun.chargement')}</p>}

      {mesures && (
        <>
          <p className="texte-fort">{t('mesure.total', { total: mesures.total, jours: FENETRE_JOURS })}</p>

          {mesures.parChemin.length === 0 ? (
            <p className="champ__aide">{t('mesure.vide')}</p>
          ) : (
            <div className="tableau-conteneur">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('mesure.ecran')}</th>
                    <th scope="col">{t('mesure.vues')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mesures.parChemin.map((l) => (
                    <tr key={l.chemin}>
                      <th scope="row" className="tableau__arret">
                        {nomEcran(l.chemin)}
                      </th>
                      <td>{l.vues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mesures.parJour.length > 0 && (
            <details className="repli carte">
              <summary>{t('mesure.parJour')}</summary>
              <ul className="liste-puces pile pile--serre">
                {mesures.parJour.map((j) => (
                  <li key={j.jour}>
                    {new Date(j.jour).toLocaleDateString()} — <b>{j.vues}</b>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
