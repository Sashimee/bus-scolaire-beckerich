import { useEffect, useState } from 'react'
import { useT } from '../i18n'

const INTERVALLE_MS = 30 * 60 * 1000

/**
 * Détecte les nouveaux déploiements.
 *
 * Le service worker se met à jour tout seul, mais l'onglet déjà ouvert peut rester
 * des jours sur une version périmée — ce qui, pour des horaires, n'est pas anodin.
 * On interroge donc `version.json` régulièrement et on propose le rechargement.
 */
export function BandeauVersion() {
  const { t } = useT()
  const [nouvelle, setNouvelle] = useState(false)
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine)

  useEffect(() => {
    const enLigne = () => setHorsLigne(false)
    const deconnecte = () => setHorsLigne(true)
    window.addEventListener('online', enLigne)
    window.addEventListener('offline', deconnecte)
    return () => {
      window.removeEventListener('online', enLigne)
      window.removeEventListener('offline', deconnecte)
    }
  }, [])

  useEffect(() => {
    if (__VERSION__ === 'dev') return

    const verifier = async () => {
      try {
        const rep = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
        if (!rep.ok) return
        const { version } = (await rep.json()) as { version: string }
        if (version && version !== __VERSION__) setNouvelle(true)
      } catch {
        /* Hors ligne : ce n'est pas une erreur, on réessaiera plus tard. */
      }
    }

    verifier()
    const id = setInterval(verifier, INTERVALLE_MS)
    document.addEventListener('visibilitychange', verifier)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', verifier)
    }
  }, [])

  if (nouvelle) {
    return (
      <div className="bandeau" role="status">
        <div className="bandeau__interne">
          <span>{t('maj.disponible')}</span>
          <button
            type="button"
            className="bouton bouton--primaire"
            onClick={() => window.location.reload()}
          >
            {t('maj.recharger')}
          </button>
        </div>
      </div>
    )
  }

  if (horsLigne) {
    return (
      <div className="bandeau" role="status">
        <div className="bandeau__interne">{t('maj.horsLigne')}</div>
      </div>
    )
  }

  return null
}
