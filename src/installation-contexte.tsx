/**
 * Installation de l'application sur l'écran d'accueil.
 *
 * L'invitation du navigateur (`beforeinstallprompt`) n'est émise qu'une fois, très tôt,
 * et sur n'importe quelle page. Elle n'était captée que par `/installer`, que la
 * quasi-totalité des parents ne visitera jamais : l'invitation était donc perdue avant
 * d'avoir servi. On la capte désormais au niveau de l'application et on la conserve.
 *
 * On ne la déclenche pas pour autant à la première seconde. Une demande d'installation
 * adressée à quelqu'un qui n'a encore rien vu se refuse par réflexe, et un refus ne se
 * rattrape pas : le navigateur ne réémettra pas l'invitation. On attend donc que le
 * parent se soit réellement servi de l'application.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const CLE_VISITES = 'bus-beckerich.visites'
const CLE_FICHE_VUE = 'bus-beckerich.fiche-vue'
const CLE_REPORTEE = 'bus-beckerich.installation-reportee'

/** Un refus vaut pour un mois : reproposer chaque semaine serait du harcèlement. */
const REPORT_JOURS = 30
const VISITES_MINIMUM = 2

interface EvenementInstallation extends Event {
  prompt: () => Promise<void>
}

interface EtatInstallation {
  /** Le navigateur propose une installation programmatique (Chrome, Edge). */
  invite: boolean
  installee: boolean
  /** iOS n'a pas d'API : l'installation s'y explique, elle ne se déclenche pas. */
  estIOS: boolean
  /** Le parent s'est assez servi de l'application pour qu'on ose lui proposer. */
  proposable: boolean
  installer: () => Promise<void>
  reporter: () => void
  /** À appeler quand le parent consulte la fiche d'un enfant. */
  noterFicheVue: () => void
}

const Contexte = createContext<EtatInstallation | null>(null)

function lireNombre(cle: string): number {
  try {
    return Number(localStorage.getItem(cle) ?? 0)
  } catch {
    return 0
  }
}

function ecrire(cle: string, valeur: string) {
  try {
    localStorage.setItem(cle, valeur)
  } catch {
    /* mode privé : l'invitation se represente, ce qui reste préférable à une panne */
  }
}

/** L'installation a-t-elle été refusée récemment ? */
function reportRecent(): boolean {
  const quand = lireNombre(CLE_REPORTEE)
  return quand > 0 && Date.now() - quand < REPORT_JOURS * 24 * 3600 * 1000
}

function estInstallee(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari sur iOS n'implémente pas `display-mode` : il expose son propre drapeau.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

/** iPadOS se déclare comme un Mac depuis iOS 13 : le test tactile lève l'ambiguïté. */
export function estAppareilIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function FournisseurInstallation({ children }: { children: ReactNode }) {
  const [invite, setInvite] = useState<EvenementInstallation | null>(null)
  const [installee, setInstallee] = useState(estInstallee)
  const [reportee, setReportee] = useState(reportRecent)
  const [ficheVue, setFicheVue] = useState(() => lireNombre(CLE_FICHE_VUE) > 0)
  const [visites] = useState(() => {
    const n = lireNombre(CLE_VISITES) + 1
    ecrire(CLE_VISITES, String(n))
    return n
  })

  useEffect(() => {
    const capturer = (e: Event) => {
      // Sans `preventDefault`, Chrome affiche sa propre barre au moment qui l'arrange.
      e.preventDefault()
      setInvite(e as EvenementInstallation)
    }
    const installe = () => {
      setInstallee(true)
      setInvite(null)
    }
    window.addEventListener('beforeinstallprompt', capturer)
    window.addEventListener('appinstalled', installe)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturer)
      window.removeEventListener('appinstalled', installe)
    }
  }, [])

  const installer = useCallback(async () => {
    if (!invite) return
    await invite.prompt()
    // L'invitation n'est utilisable qu'une fois, quelle que soit la réponse.
    setInvite(null)
  }, [invite])

  const reporter = useCallback(() => {
    ecrire(CLE_REPORTEE, String(Date.now()))
    setReportee(true)
  }, [])

  const noterFicheVue = useCallback(() => {
    ecrire(CLE_FICHE_VUE, '1')
    setFicheVue(true)
  }, [])

  const valeur = useMemo<EtatInstallation>(
    () => ({
      invite: invite !== null,
      installee,
      estIOS: estAppareilIOS(),
      // Deux visites, ou une fiche enfant consultée : dans les deux cas, le parent a
      // vu à quoi sert l'application. Avant, la question n'a pas de sens pour lui.
      proposable: !installee && !reportee && (visites >= VISITES_MINIMUM || ficheVue),
      installer,
      reporter,
      noterFicheVue,
    }),
    [invite, installee, reportee, visites, ficheVue, installer, reporter, noterFicheVue],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useInstallation(): EtatInstallation {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useInstallation doit être utilisé dans FournisseurInstallation')
  return ctx
}
