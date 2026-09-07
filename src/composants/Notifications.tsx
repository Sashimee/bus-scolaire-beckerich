import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { URL_API, notificationsConfigurees } from '../config'

type Etat = 'indisponible' | 'non-configure' | 'proposable' | 'active' | 'refusee' | 'erreur'

/** Ce que le parent accepte de recevoir. Le serveur filtre sur cette valeur. */
type Preference = 'urgences' | 'urgences-rappels' | 'tout'

const PREFERENCES: Preference[] = ['urgences', 'urgences-rappels', 'tout']
const CLE_PREFERENCE = 'bus-beckerich.notifications-preference'

function preferenceInitiale(): Preference {
  try {
    const v = localStorage.getItem(CLE_PREFERENCE)
    return PREFERENCES.includes(v as Preference) ? (v as Preference) : 'urgences-rappels'
  } catch {
    return 'urgences-rappels'
  }
}

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

/** L'inverse, pour relire la clé d'un abonnement DÉJÀ créé et la comparer à celle du serveur. */
function octetsEnCle(tampon: ArrayBuffer | null): string {
  if (!tampon) return ''
  let binaire = ''
  for (const octet of new Uint8Array(tampon)) binaire += String.fromCharCode(octet)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * La clé publique du serveur, demandée à ce même serveur.
 *
 * Elle était autrefois figée dans le paquet à la construction. Un abonnement se crée
 * pourtant sans la moindre erreur avec une clé que le serveur n'a jamais eue : il ne
 * reçoit simplement jamais rien. Demander la clé à celui qui signe supprime la seule
 * chose qui pouvait diverger.
 */
async function lireCleServeur(): Promise<string> {
  try {
    const rep = await fetch(`${URL_API}/sante`)
    if (!rep.ok) return ''
    const { clePubliqueVapid } = (await rep.json()) as { clePubliqueVapid?: string }
    return clePubliqueVapid ?? ''
  } catch {
    return ''
  }
}

/** Résilie côté serveur PUIS côté navigateur : l'ordre inverse perdrait l'identifiant à supprimer. */
async function resilier(abonnement: PushSubscription): Promise<void> {
  await fetch(`${URL_API}/desabonner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: abonnement.endpoint }),
  }).catch(() => undefined)
  await abonnement.unsubscribe()
}

async function abonner(
  sw: ServiceWorkerRegistration,
  cle: string,
  preference: Preference,
): Promise<boolean> {
  const abonnement = await sw.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: cleEnOctets(cle),
  })
  const rep = await fetch(`${URL_API}/abonner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...abonnement.toJSON(), preference }),
  })
  return rep.ok
}

/**
 * Abonnement aux notifications de perturbation.
 *
 * On ne déclenche jamais la demande de permission au chargement : un navigateur
 * n'accorde qu'une seule fois cette permission, et un refus réflexe est très difficile
 * à rattraper. Le parent lit d'abord à quoi il s'engage, puis clique.
 */
export function Notifications() {
  const { t, tListe } = useT()
  const [etat, setEtat] = useState<Etat>('proposable')
  const [occupe, setOccupe] = useState(false)
  const [preference, setPreference] = useState<Preference>(preferenceInitiale)
  const [essai, setEssai] = useState<'envoye' | 'trop-frequent' | 'echec' | null>(null)
  const [cleServeur, setCleServeur] = useState('')

  useEffect(() => {
    if (!notificationsConfigurees()) return setEtat('non-configure')
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return setEtat('indisponible')
    }
    if (Notification.permission === 'denied') return setEtat('refusee')

    let vivant = true
    void (async () => {
      const cle = await lireCleServeur()
      if (!vivant) return
      setCleServeur(cle)
      // Serveur joignable mais sans clé : il ne peut envoyer aucune notification. Le
      // dire par l'absence de la carte vaut mieux qu'un bouton qui ne mène à rien.
      if (!cle) return setEtat('non-configure')

      try {
        const sw = await navigator.serviceWorker.ready
        const abonnement = await sw.pushManager.getSubscription()
        if (!vivant) return
        if (!abonnement) return setEtat('proposable')
        if (octetsEnCle(abonnement.options.applicationServerKey) === cle) {
          return setEtat('active')
        }

        // Abonnement lié à une clé que le serveur n'a plus : il ne recevra jamais rien,
        // et rien ne le signale — ni erreur, ni changement d'état. On le refait sur
        // place. La permission est déjà accordée, donc rien n'est redemandé au parent,
        // qui autrement se croirait couvert jusqu'au matin où il ne le serait pas.
        await resilier(abonnement)
        const refait = await abonner(sw, cle, preferenceInitiale())
        if (vivant) setEtat(refait ? 'active' : 'proposable')
      } catch {
        if (vivant) setEtat('indisponible')
      }
    })()

    return () => {
      vivant = false
    }
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
      if (!(await abonner(sw, cleServeur, preference))) throw new Error('abonnement-refuse')
      setEtat('active')
    } catch {
      setEtat('erreur')
    } finally {
      setOccupe(false)
    }
  }

  /**
   * Demande au serveur de renvoyer une notification à cet appareil-ci.
   *
   * Le endpoint sert d'authentification : lui seul le connaît, et la seule chose qu'il
   * obtient est de se faire vibrer lui-même.
   */
  async function envoyerEssai() {
    setOccupe(true)
    setEssai(null)
    try {
      const sw = await navigator.serviceWorker.ready
      const abonnement = await sw.pushManager.getSubscription()
      if (!abonnement) return setEssai('echec')

      const rep = await fetch(`${URL_API}/essai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: abonnement.endpoint,
          titre: t('notifications.essaiTitre'),
          message: t('notifications.essaiCorps'),
        }),
      })
      if (rep.status === 429) return setEssai('trop-frequent')
      if (!rep.ok) return setEssai('echec')

      // Le serveur répond 200 même quand le service de push a refusé : c'est le
      // compteur qui dit si quelque chose est réellement parti.
      const { envoyees } = (await rep.json()) as { envoyees?: number }
      setEssai(envoyees ? 'envoye' : 'echec')
    } catch {
      setEssai('echec')
    } finally {
      setOccupe(false)
    }
  }

  async function desactiver() {
    setOccupe(true)
    try {
      const sw = await navigator.serviceWorker.ready
      const abonnement = await sw.pushManager.getSubscription()
      if (abonnement) await resilier(abonnement)
      setEtat('proposable')
    } finally {
      setOccupe(false)
    }
  }

  /**
   * Change la préférence.
   *
   * Elle est renvoyée au serveur en réutilisant `/abonner` : la clé y étant dérivée du
   * endpoint, l'enregistrement est remplacé et non dupliqué. Pas besoin d'une route de
   * plus pour un champ.
   */
  async function changerPreference(nouvelle: Preference) {
    setPreference(nouvelle)
    try {
      localStorage.setItem(CLE_PREFERENCE, nouvelle)
    } catch {
      /* stockage indisponible : la préférence vaudra pour cette session */
    }
    if (etat !== 'active') return
    try {
      const sw = await navigator.serviceWorker.ready
      const abonnement = await sw.pushManager.getSubscription()
      if (!abonnement) return
      await fetch(`${URL_API}/abonner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...abonnement.toJSON(), preference: nouvelle }),
      })
    } catch {
      // Le réglage local est déjà enregistré : il repartira au prochain abonnement.
    }
  }

  if (etat === 'non-configure') return null

  const estIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const installee = window.matchMedia('(display-mode: standalone)').matches
  // La marche à suivre n'est pas la même selon le système ; montrer les trois à la
  // fois, c'est n'en faire lire aucune.
  const plateforme = estIOS ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'ordinateur'

  return (
    <section className="carte pile pile--serre">
      <h3 className="titre-carte">{t('notifications.titre')}</h3>
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

          {/*
              Accorder la permission ne suffit pas : le système décide seul de la
              discrétion d'une notification web, et personne ne va chercher ces
              réglages de lui-même. On les donne donc ici, au moment où l'on vient
              d'activer — et pour la plateforme qu'on a sous les yeux.
          */}
          <details className="repli" open>
            <summary>{t('notifications.priorite')}</summary>
            <div className="pile pile--serre">
              <p className="champ__aide">{t('notifications.prioriteAide')}</p>
              <ol className="liste-puces">
                {tListe(`notifications.${plateforme}Etapes`).map((etape) => (
                  <li key={etape}>{etape}</li>
                ))}
              </ol>
            </div>
          </details>

          <div className="champ">
            <label htmlFor="preference-notifications">{t('notifications.recevoir')}</label>
            <select
              id="preference-notifications"
              value={preference}
              onChange={(e) => void changerPreference(e.target.value as Preference)}
            >
              {PREFERENCES.map((p) => (
                <option key={p} value={p}>
                  {t(`notifications.preference.${p}`)}
                </option>
              ))}
            </select>
            <p className="champ__aide">{t(`notifications.preferenceAide.${preference}`)}</p>
          </div>

          {/*
              Sans cet essai, un parent ne découvrirait un réglage mal posé qu'un matin
              de bus annulé — au pire moment. C'est la seule vérification qu'il puisse
              faire lui-même.
          */}
          <div className="pile pile--serre">
            <button type="button" className="bouton" disabled={occupe} onClick={envoyerEssai}>
              {t('notifications.essai')}
            </button>
            {essai === 'envoye' && <p className="champ__aide">✓ {t('notifications.essaiEnvoye')}</p>}
            {essai === 'trop-frequent' && (
              <p className="champ__aide">{t('notifications.essaiTropFrequent')}</p>
            )}
            {essai === 'echec' && (
              <div className="encart encart--attention">{t('notifications.essaiEchec')}</div>
            )}
          </div>

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

      {/*
          Permanent et non repliable, quel que soit l'état : c'est la seule chose que
          l'application doive absolument dire sur ses notifications. Les cacher derrière
          un repli reviendrait à laisser croire à une promesse qu'elle ne tient pas.
      */}
      <div className="encart encart--attention">
        <div className="encart__titre">{t('notifications.pasUneGarantie')}</div>
        <p>{t('notifications.pasUneGarantieDetail')}</p>
        <p className="texte-fort">{t('notifications.ecoleReste')}</p>
      </div>

      <p className="champ__aide">{t('notifications.confidentialite')}</p>
    </section>
  )
}
