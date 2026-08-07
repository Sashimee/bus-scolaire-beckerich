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
import de from './de.json'
import lb from './lb.json'
import pt from './pt.json'
import en from './en.json'
import { chargerLangue, enregistrerLangue } from '../lib/stockage'

export const LANGUES = ['fr', 'de', 'lb', 'pt', 'en'] as const
export type Langue = (typeof LANGUES)[number]

type Dictionnaire = Record<string, unknown>

const DICTIONNAIRES: Record<Langue, Dictionnaire> = { fr, de, lb, pt, en }

/** Nom de chaque langue, écrit dans cette langue. */
export const NOMS_LANGUES: Record<Langue, string> = {
  fr: 'Français',
  de: 'Deutsch',
  lb: 'Lëtzebuergesch',
  pt: 'Português',
  en: 'English',
}

function chercher(dico: Dictionnaire, chemin: string): unknown {
  return chemin.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, dico)
}

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

  useEffect(() => {
    document.documentElement.lang = langue
  }, [langue])

  const changerLangue = useCallback((l: Langue) => {
    setLangue(l)
    enregistrerLangue(l)
  }, [])

  const t = useCallback(
    (cle: string, params?: Record<string, string | number>) => {
      const valeur = chercher(DICTIONNAIRES[langue], cle) ?? chercher(fr, cle)
      return typeof valeur === 'string' ? interpoler(valeur, params) : cle
    },
    [langue],
  )

  const tListe = useCallback(
    (cle: string) => {
      const valeur = chercher(DICTIONNAIRES[langue], cle) ?? chercher(fr, cle)
      return Array.isArray(valeur) ? (valeur as string[]) : []
    },
    [langue],
  )

  const valeur = useMemo(
    () => ({ langue, changerLangue, t, tListe }),
    [langue, changerLangue, t, tListe],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useT(): Traduction {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useT doit être utilisé dans FournisseurTraduction')
  return ctx
}
