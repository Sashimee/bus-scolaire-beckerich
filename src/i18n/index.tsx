/**
 * Traduction.
 *
 * Pas de bibliothèque : un dictionnaire JSON par langue et une recherche par chemin
 * pointé suffisent. Ajouter une langue = un import et une entrée dans `DICTIONNAIRES`.
 * Aucune chaîne visible ne doit être écrite en dur dans un composant.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import fr from './fr.json'
import { chargerLangue, enregistrerLangue } from '../lib/stockage'
import { chercher, DICTIONNAIRES } from './dictionnaires'
import { SURCOUCHE_VIDE, type Surcouche } from '../lib/traductions'
import { chargerTraductions } from './surcouche'
import { LANGUES, NOMS_LANGUES, type Langue } from './langues'

export { LANGUES, NOMS_LANGUES }
export type { Langue }

function interpoler(texte: string, params?: Record<string, string | number>): string {
  if (!params) return texte
  return texte.replace(/\{(\w+)\}/g, (brut, cle: string) =>
    cle in params ? String(params[cle]) : brut,
  )
}

export interface Traduction {
  langue: Langue
  changerLangue: (l: Langue) => void
  /** Traduit une clé. Repli sur le français, puis sur la clé elle-même. */
  t: (cle: string, params?: Record<string, string | number>) => string
  /** Traduit une clé dont la valeur est une liste (étapes d'installation, etc.). */
  tListe: (cle: string) => string[]
  /** Corrections publiées, telles qu'elles ont été relues. Sert à l'éditeur. */
  surcouche: Surcouche
}

const Contexte = createContext<Traduction | null>(null)

/** Devine la langue à partir des préférences du navigateur, français par défaut. */
function langueInitiale(): Langue {
  const enregistree = chargerLangue()
  if (enregistree && (LANGUES as readonly string[]).includes(enregistree)) {
    return enregistree as Langue
  }
  for (const pref of navigator.languages ?? [navigator.language]) {
    const code = pref.slice(0, 2).toLowerCase()
    // Le luxembourgeois se déclare « lb », l'allemand d'Autriche ou de Suisse « de ».
    if ((LANGUES as readonly string[]).includes(code)) return code as Langue
  }
  return 'fr'
}

export function FournisseurTraduction({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(langueInitiale)
  const [surcouche, setSurcouche] = useState<Surcouche>(SURCOUCHE_VIDE)

  useEffect(() => {
    document.documentElement.lang = langue
  }, [langue])

  // Les corrections publiées depuis `/traductions` ou `/admin`, relues à l'ouverture.
  // Le premier rendu se fait avec les dictionnaires du bundle, qui sont complets : la
  // surcouche ne fait que corriger, jamais compléter.
  useEffect(() => {
    const ctrl = new AbortController()
    chargerTraductions(ctrl.signal).then(setSurcouche)
    return () => ctrl.abort()
  }, [])

  const changerLangue = useCallback((l: Langue) => {
    setLangue(l)
    enregistrerLangue(l)
  }, [])

  /** Surcouche d'abord, puis la langue demandée, puis le français. */
  const brut = useCallback(
    (cle: string) =>
      surcouche[langue]?.[cle] ?? chercher(DICTIONNAIRES[langue], cle) ?? chercher(fr, cle),
    [langue, surcouche],
  )

  const t = useCallback(
    (cle: string, params?: Record<string, string | number>) => {
      const valeur = brut(cle)
      return typeof valeur === 'string' ? interpoler(valeur, params) : cle
    },
    [brut],
  )

  const tListe = useCallback(
    (cle: string) => {
      const valeur = brut(cle)
      return Array.isArray(valeur) ? (valeur as string[]) : []
    },
    [brut],
  )

  const valeur = useMemo(
    () => ({ langue, changerLangue, t, tListe, surcouche }),
    [langue, changerLangue, t, tListe, surcouche],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useT(): Traduction {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useT doit être utilisé dans FournisseurTraduction')
  return ctx
}
