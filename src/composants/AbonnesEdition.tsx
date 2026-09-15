import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { lireAbonnes, type Abonnes } from '../lib/edition'
import type { SessionCompte } from '../lib/comptes'

/**
 * Combien de téléphones sont abonnés aux notifications.
 *
 * Le chiffre existait en base depuis le lot 10 et n'était lisible nulle part : il fallait
 * ouvrir `psql` sur la production pour le connaître. Il est ici, à côté du journal et de
 * la fréquentation, et ouvert comme eux à toute session — savoir n'est pas éditer.
 *
 * Les deux nuances sont AFFICHÉES et non laissées au lecteur : un abonnement est un
 * navigateur et non une personne, et un abonnement qui n'a jamais rien reçu peut être
 * mort sans que le serveur le sache. Un nombre seul se lirait comme un nombre de
 * familles joignables, ce qu'il n'est pas.
 */
export function AbonnesEdition({ session }: { session: SessionCompte }) {
  const { t } = useT()
  const [abonnes, setAbonnes] = useState<Abonnes | null>(null)
  const [echec, setEchec] = useState(false)

  const charger = async () => {
    setEchec(false)
    setAbonnes(null)
    try {
      setAbonnes(await lireAbonnes(session))
    } catch {
      setEchec(true)
    }
  }

  useEffect(() => {
    void charger()
    // La session ne change pas sous cet onglet ; on charge une fois au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Le libellé d'une préférence, ou la valeur brute si elle n'a pas de traduction. */
  const libellePreference = (preference: string) => {
    const cle = `notifications.preference.${preference}`
    const rendu = t(cle)
    return rendu === cle ? preference : rendu
  }

  return (
    <div className="pile pile--serre">
      <div className="rangee rangee--espacee">
        <p className="champ__aide">{t('abonnes.aide')}</p>
        <button type="button" className="bouton bouton--discret" onClick={() => void charger()}>
          {t('abonnes.recharger')}
        </button>
      </div>

      {echec && <div className="encart encart--attention">{t('abonnes.echec')}</div>}
      {!echec && abonnes === null && <p className="champ__aide">{t('commun.chargement')}</p>}

      {abonnes && (
        <>
          <p className="texte-fort">{t('abonnes.total', { total: abonnes.total })}</p>

          {abonnes.total === 0 ? (
            <p className="champ__aide">{t('abonnes.vide')}</p>
          ) : (
            <>
              <div className="tableau-conteneur">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('abonnes.preference')}</th>
                      <th scope="col">{t('abonnes.nombre')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abonnes.parPreference.map((l) => (
                      <tr key={l.preference}>
                        <th scope="row" className="tableau__arret">
                          {libellePreference(l.preference)}
                        </th>
                        <td>{l.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="champ__aide">
                {t('abonnes.periode', {
                  premier: abonnes.premier ? new Date(abonnes.premier).toLocaleDateString() : '—',
                  dernier: abonnes.dernier ? new Date(abonnes.dernier).toLocaleDateString() : '—',
                })}
              </p>

              <div className="encart encart--attention">
                <p>{t('abonnes.pasDesPersonnes')}</p>
                <p>{t('abonnes.ayantRecu', { ayantRecu: abonnes.ayantRecu })}</p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
