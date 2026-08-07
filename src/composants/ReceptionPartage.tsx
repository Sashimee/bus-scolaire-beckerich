import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { foyerDepuisUrl } from '../lib/partage'
import type { Foyer } from '../lib/types'

/**
 * Prise en charge d'une configuration reçue par lien.
 *
 * On ne remplace jamais la configuration existante sans demander : le lien peut être
 * ouvert par erreur, ou par quelqu'un qui a déjà réglé ses propres enfants.
 */
export function ReceptionPartage() {
  const { t } = useT()
  const { remplacerFoyer } = useFoyer()
  const [recu, setRecu] = useState<Foyer | null>(null)

  useEffect(() => {
    const f = foyerDepuisUrl()
    if (f && f.enfants.length) setRecu(f)
  }, [])

  if (!recu) return null

  const nettoyerUrl = () => {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    setRecu(null)
  }

  return (
    <div className="page">
      <div className="carte carte--accent pile pile--serre">
        <h2 style={{ fontSize: '1rem' }}>{t('partage.recu')}</h2>
        <p>
          {recu.adresse?.libelle} — {recu.enfants.map((e) => e.prenom).join(', ')}
        </p>
        <p className="champ__aide">{t('partage.recuAide')}</p>
        <div className="rangee">
          <button
            type="button"
            className="bouton bouton--primaire"
            onClick={() => {
              remplacerFoyer(recu)
              nettoyerUrl()
            }}
          >
            {t('partage.accepter')}
          </button>
          <button type="button" className="bouton bouton--discret" onClick={nettoyerUrl}>
            {t('partage.refuser')}
          </button>
        </div>
      </div>
    </div>
  )
}
