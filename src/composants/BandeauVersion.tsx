import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useRechargement } from '../rechargement-contexte'

const INTERVALLE_MS = 5 * 60 * 1000
/** Délai avant le rechargement, pour que le parent voie ce qui se passe. */
const DELAI_RECHARGEMENT_MS = 2000
const CLE_TENTATIVE = 'bus-beckerich.rechargement-auto'

/** La version pour laquelle un rechargement automatique a déjà été tenté. */
function tentativePrecedente(): string | null {
  try {
    return sessionStorage.getItem(CLE_TENTATIVE)
  } catch {
    return null
  }
}

function memoriserTentative(version: string) {
  try {
    sessionStorage.setItem(CLE_TENTATIVE, version)
  } catch {
    /* stockage indisponible : on rechargera au plus une fois de trop, sans plus */
  }
}

/**
 * Détecte les nouveaux déploiements et remet l'onglet à jour.
 *
 * Le service worker se met à jour tout seul, mais l'onglet déjà ouvert peut rester des
 * jours sur une version périmée — ce qui, pour des horaires, n'est pas anodin. On
 * interroge donc `version.json` régulièrement et on recharge sans rien demander : un
 * bouton « Recharger » suppose que le parent comprenne l'enjeu, ce qui est déjà trop.
 *
 * Deux exceptions, où le bouton manuel réapparaît : une saisie en cours (voir
 * `rechargement-contexte`), et un rechargement déjà tenté en vain pour cette même
 * version — sans quoi un déploiement incohérent enfermerait l'application dans une
 * boucle de rechargements.
 */
export function BandeauVersion() {
  const { t } = useT()
  const { bloque } = useRechargement()
  const [nouvelle, setNouvelle] = useState<string | null>(null)
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine)
  const [rechargeEnCours, setRechargeEnCours] = useState(false)
  const echecPrecedent = useRef(false)

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
        if (!version || version === __VERSION__) return
        // Déjà rechargé pour cette version sans que l'écart disparaisse : le
        // déploiement est incohérent, on ne recommence pas indéfiniment.
        echecPrecedent.current = tentativePrecedente() === version
        setNouvelle(version)
      } catch {
        /* Hors ligne : ce n'est pas une erreur, on réessaiera plus tard. */
      }
    }

    // Le retour dans l'onglet est le moment décisif : c'est là que le parent va lire
    // des horaires, et donc là qu'il ne faut pas qu'ils soient périmés.
    const auRetour = () => {
      if (document.visibilityState === 'visible') void verifier()
    }

    void verifier()
    const id = setInterval(verifier, INTERVALLE_MS)
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('focus', auRetour)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('focus', auRetour)
    }
  }, [])

  useEffect(() => {
    // Une boîte de dialogue ouverte porte une décision en cours : la faire disparaître
    // sous les doigts du parent serait pire que d'attendre.
    const empeche =
      !nouvelle || bloque || echecPrecedent.current || document.querySelector('dialog[open]')
    if (empeche) {
      // Une saisie commencée pendant le compte à rebours doit ramener le bouton
      // manuel, et non laisser un « mise à jour… » qui n'arrivera jamais.
      setRechargeEnCours(false)
      return
    }

    setRechargeEnCours(true)
    memoriserTentative(nouvelle)
    const id = setTimeout(() => window.location.reload(), DELAI_RECHARGEMENT_MS)
    return () => clearTimeout(id)
  }, [nouvelle, bloque])

  if (nouvelle) {
    return (
      <div className="bandeau" role="status">
        <div className="bandeau__interne">
          <span>{rechargeEnCours ? t('maj.miseAJour') : t('maj.disponible')}</span>
          {!rechargeEnCours && (
            <button
              type="button"
              className="bouton bouton--primaire"
              onClick={() => window.location.reload()}
            >
              {t('maj.recharger')}
            </button>
          )}
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
