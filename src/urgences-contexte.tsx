/**
 * Suivi des perturbations en cours.
 *
 * Relit le fichier des urgences à l'ouverture, au retour dans l'onglet, au retour du
 * réseau, et toutes les dix minutes. Ce rythme soutenu est assumé : le fichier pèse
 * quelques centaines d'octets, et une annulation de bus n'a de valeur que si elle
 * arrive à temps.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  chargerUrgences,
  correctionsActives,
  URGENCES_VIDES,
  type Urgences,
} from './lib/urgences'
import { appliquerCorrectionsArrets } from './lib/donnees'

const INTERVALLE_MS = 10 * 60 * 1000
const CLE_CACHE = 'bus-beckerich.urgences'
const CLE_VUES = 'bus-beckerich.urgences-vues'

interface EtatUrgences {
  urgences: Urgences
  /**
   * Incrémenté chaque fois qu'une correction déplace un arrêt. Les calculs de trajet
   * en dépendent : sans cela, un arrêt corrigé ne serait pris en compte qu'au
   * prochain rechargement de la page.
   */
  versionArrets: number
  /** Identifiants des perturbations déjà vues par ce parent. */
  vues: string[]
  marquerVues: (ids: string[]) => void
  rafraichir: () => void
}

const Contexte = createContext<EtatUrgences | null>(null)

function lireCache<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle)
    return brut ? (JSON.parse(brut) as T) : defaut
  } catch {
    return defaut
  }
}

function ecrireCache(cle: string, valeur: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    /* stockage indisponible : on fonctionne sans mémoire entre deux sessions */
  }
}

export function FournisseurUrgences({ children }: { children: ReactNode }) {
  // On repart de la dernière version connue : hors ligne, un parent doit continuer
  // de voir l'annulation publiée hier soir.
  const [urgences, setUrgences] = useState<Urgences>(() => lireCache(CLE_CACHE, URGENCES_VIDES))
  const [vues, setVues] = useState<string[]>(() => lireCache<string[]>(CLE_VUES, []))
  const [versionArrets, setVersionArrets] = useState(0)
  const enCours = useRef<AbortController | null>(null)

  const rafraichir = useCallback(() => {
    enCours.current?.abort()
    const ctrl = new AbortController()
    enCours.current = ctrl
    void chargerUrgences(ctrl.signal).then((recu) => {
      if (!recu || ctrl.signal.aborted) return
      setUrgences(recu)
      ecrireCache(CLE_CACHE, recu)
      const deplaces = appliquerCorrectionsArrets(correctionsActives(recu, new Date()))
      if (deplaces) setVersionArrets((v) => v + 1)
    })
  }, [])

  useEffect(() => {
    rafraichir()
    const minuterie = setInterval(rafraichir, INTERVALLE_MS)
    const auRetour = () => {
      if (document.visibilityState === 'visible') rafraichir()
    }
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('online', rafraichir)
    return () => {
      clearInterval(minuterie)
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('online', rafraichir)
      enCours.current?.abort()
    }
  }, [rafraichir])

  const marquerVues = useCallback((ids: string[]) => {
    setVues((precedentes) => {
      const fusion = [...new Set([...precedentes, ...ids])]
      ecrireCache(CLE_VUES, fusion)
      return fusion
    })
  }, [])

  const valeur = useMemo(
    () => ({ urgences, versionArrets, vues, marquerVues, rafraichir }),
    [urgences, versionArrets, vues, marquerVues, rafraichir],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useUrgences(): EtatUrgences {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useUrgences doit être utilisé dans FournisseurUrgences')
  return ctx
}
