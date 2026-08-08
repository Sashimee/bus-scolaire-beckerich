import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { foyerDepuisUrl } from '../lib/partage'
import type { Foyer } from '../lib/types'

/**
 * Configuration reçue par lien : détection et décision.
 *
 * On ne remplace jamais la configuration existante sans demander : le lien peut être
 * ouvert par erreur, ou par quelqu'un qui a déjà réglé ses propres enfants.
 */
export function usePartageRecu() {
  const { remplacerFoyer } = useFoyer()
  const [recu, setRecu] = useState<Foyer | null>(null)

  useEffect(() => {
    const f = foyerDepuisUrl()
    if (f && f.enfants.length) setRecu(f)
  }, [])

  // Le fragment est retiré dans les deux cas : une adresse de domicile n'a pas à rester
  // dans la barre d'adresse ni dans l'historique une fois la décision prise.
  const oublier = useCallback(() => {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    setRecu(null)
  }, [])

  const accepter = useCallback(() => {
    if (recu) remplacerFoyer(recu)
    oublier()
  }, [recu, remplacerFoyer, oublier])

  return { recu, accepter, refuser: oublier }
}

export function ReceptionPartage({
  recu,
  onAccepter,
  onRefuser,
}: {
  recu: Foyer
  onAccepter: () => void
  onRefuser: () => void
}) {
  const { t } = useT()

  return (
    <div className="carte carte--accent carte--surelevee pile pile--serre">
      <h2 className="titre-carte">{t('partage.recu')}</h2>
      <p>
        {recu.adresse?.libelle} — {recu.enfants.map((e) => e.prenom).join(', ')}
      </p>
      <p className="champ__aide">{t('partage.recuAide')}</p>
      <div className="rangee">
        <button type="button" className="bouton bouton--primaire" onClick={onAccepter}>
          {t('partage.accepter')}
        </button>
        <button type="button" className="bouton bouton--discret" onClick={onRefuser}>
          {t('partage.refuser')}
        </button>
      </div>
    </div>
  )
}
