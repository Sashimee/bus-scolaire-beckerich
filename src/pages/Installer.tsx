import { useEffect, useState } from 'react'
import { useT } from '../i18n'

type Plateforme = 'ios' | 'android' | 'bureau' | 'firefox'

/** Devine la plateforme pour mettre en avant la bonne procédure, sans masquer les autres. */
function detecter(): Plateforme {
  const ua = navigator.userAgent
  // iPadOS se déclare comme un Mac depuis iOS 13 : le test tactile lève l'ambiguïté.
  const estIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (estIOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Firefox\//.test(ua)) return 'firefox'
  return 'bureau'
}

interface EvenementInstallation extends Event {
  prompt: () => Promise<void>
}

export function Installer() {
  const { t, tListe } = useT()
  const [plateforme] = useState(detecter)
  const [invite, setInvite] = useState<EvenementInstallation | null>(null)
  const [installee, setInstallee] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  )

  useEffect(() => {
    // Chrome et Edge proposent une installation programmatique ; Safari non.
    const capturer = (e: Event) => {
      e.preventDefault()
      setInvite(e as EvenementInstallation)
    }
    const installe = () => setInstallee(true)
    window.addEventListener('beforeinstallprompt', capturer)
    window.addEventListener('appinstalled', installe)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturer)
      window.removeEventListener('appinstalled', installe)
    }
  }, [])

  const procedures: { cle: Plateforme; etapes: string[]; note?: string }[] = [
    { cle: 'ios', etapes: tListe('installer.iosEtapes'), note: t('installer.iosNote') },
    { cle: 'android', etapes: tListe('installer.androidEtapes') },
    { cle: 'bureau', etapes: tListe('installer.bureauEtapes') },
    { cle: 'firefox', etapes: [], note: t('installer.firefoxNote') },
  ]

  const misEnAvant = procedures.find((p) => p.cle === plateforme)!
  const autres = procedures.filter((p) => p.cle !== plateforme)

  const bloc = (p: (typeof procedures)[number], principal: boolean) => (
    <section className={principal ? 'carte carte--accent pile pile--serre' : 'pile pile--serre'} key={p.cle}>
      <h3 style={{ fontSize: '1rem' }}>{t(`installer.${p.cle}`)}</h3>
      {p.etapes.length > 0 && (
        <ol className="pile pile--serre" style={{ paddingInlineStart: '1.2rem' }}>
          {p.etapes.map((etape) => (
            <li key={etape}>{etape}</li>
          ))}
        </ol>
      )}
      {p.note && <p className="champ__aide">{p.note}</p>}
    </section>
  )

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('installer.titre')}</h2>
        <p>{t('installer.intro')}</p>
      </header>

      {installee && <div className="encart encart--info">{t('installer.dejaInstallee')}</div>}

      {invite && !installee && (
        <button
          type="button"
          className="bouton bouton--primaire"
          onClick={async () => {
            await invite.prompt()
            setInvite(null)
          }}
        >
          {t('installer.boutonInstaller')}
        </button>
      )}

      <div className="pile">
        <span className="etiquette">{t('installer.detecte')}</span>
        {bloc(misEnAvant, true)}
      </div>

      <div className="pile">
        <span className="etiquette">{t('installer.autres')}</span>
        {autres.map((p) => bloc(p, false))}
      </div>
    </div>
  )
}
