import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { CLE_VAPID_PUBLIQUE, URL_WORKER, notificationsConfigurees } from '../config'

type Etat = 'indisponible' | 'non-configure' | 'proposable' | 'active' | 'refusee' | 'erreur'

/**
 * Convertit la clé VAPID base64url en tableau d'octets, format exigé par l'API Push.
 * Le tampon est alloué explicitement pour satisfaire `BufferSource`, qui n'accepte
 * pas un `Uint8Array` potentiellement adossé à une mémoire partagée.
 */
function cleEnOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const binaire = atob(base64)
  const octets = new Uint8Array(new ArrayBuffer(binaire.length))
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return octets
}

/**
 * Abonnement aux notifications de perturbation.
 *
 * On ne déclenche jamais la demande de permission au chargement : un navigateur
 * n'accorde qu'une seule fois cette permission, et un refus réflexe est très difficile
 * à rattraper. Le parent lit d'abord à quoi il s'engage, puis clique.
 */
export function Notifications() {
  const { t } = useT()
  const [etat, setEtat] = useState<Etat>('proposable')
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    if (!notificationsConfigurees()) return setEtat('non-configure')
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return setEtat('indisponible')
    }
    if (Notification.permission === 'denied') return setEtat('refusee')

    void navigator.serviceWorker.ready
      .then((sw) => sw.pushManager.getSubscription())
      .then((abonnement) => setEtat(abonnement ? 'active' : 'proposable'))
      .catch(() => setEtat('indisponible'))
  }, [])

  async function activer() {
    setOccupe(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setEtat(permission === 'denied' ? 'refusee' : 'proposable')
        return
      }
      const sw = await navigator.serviceWorker.ready
      const abonnement = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: cleEnOctets(CLE_VAPID_PUBLIQUE),
      })
      const rep = await fetch(`${URL_WORKER}/abonner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(abonnement),
      })
      if (!rep.ok) throw new Error('abonnement-refuse')
      setEtat('active')
    } catch {
      setEtat('erreur')
    } finally {
      setOccupe(false)
    }
  }

  async function desactiver() {
    setOccupe(true)
    try {
      const sw = await navigator.serviceWorker.ready
      const abonnement = await sw.pushManager.getSubscription()
      if (abonnement) {
        // On prévient le serveur avant de résilier : une fois l'abonnement détruit
        // côté navigateur, on n'aurait plus l'identifiant à supprimer.
        await fetch(`${URL_WORKER}/desabonner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: abonnement.endpoint }),
        }).catch(() => undefined)
        await abonnement.unsubscribe()
      }
      setEtat('proposable')
    } finally {
      setOccupe(false)
    }
  }

  if (etat === 'non-configure') return null

  const estIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const installee = window.matchMedia('(display-mode: standalone)').matches

  return (
    <section className="carte pile pile--serre">
      <h3 style={{ fontSize: '1rem' }}>{t('notifications.titre')}</h3>
      <p className="champ__aide">{t('notifications.aide')}</p>

      {estIOS && !installee && (
        <div className="encart encart--info">{t('notifications.iosNote')}</div>
      )}

      {etat === 'indisponible' && (
        <p className="champ__aide">{t('notifications.nonSupportees')}</p>
      )}
      {etat === 'refusee' && (
        <div className="encart encart--attention">{t('notifications.refusees')}</div>
      )}
      {etat === 'erreur' && <div className="encart encart--alerte">{t('notifications.erreur')}</div>}

      {etat === 'active' ? (
        <>
          <p>✓ {t('notifications.activees')}</p>
          <button type="button" className="bouton" disabled={occupe} onClick={desactiver}>
            {t('notifications.desactiver')}
          </button>
        </>
      ) : (
        etat !== 'indisponible' &&
        etat !== 'refusee' && (
          <button
            type="button"
            className="bouton bouton--primaire"
            disabled={occupe}
            onClick={activer}
          >
            {occupe ? t('commun.chargement') : t('notifications.activer')}
          </button>
        )
      )}

      <p className="champ__aide">{t('notifications.confidentialite')}</p>
    </section>
  )
}
