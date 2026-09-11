/**
 * Traduction.
 *
 * Pas de bibliothèque : un dictionnaire JSON par langue et une recherche par chemin
 * pointé suffisent. Ajouter une langue = une entrée dans `SOURCES` (`dictionnaires.ts`).
 * Aucune chaîne visible ne doit être écrite en dur dans un composant.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import fr from './fr.json'
import { chargerLangue, enregistrerLangue } from '../lib/stockage'
import { chargerDictionnaire, chercher, dictionnaire, dictionnaireCharge } from './dictionnaires'
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
  /**
   * Vrai dès que la langue a été choisie par quelqu'un, faux tant qu'elle n'est que
   * devinée. Ce sont deux choses différentes : `langue` vaut toujours quelque chose,
   * y compris au tout premier lancement.
   */
  langueChoisie: boolean
  changerLangue: (l: Langue) => void
  /** Traduit une clé. Repli sur le français, puis sur la clé elle-même. */
  t: (cle: string, params?: Record<string, string | number>) => string
  /** Traduit une clé dont la valeur est une liste (étapes d'installation, etc.). */
  tListe: (cle: string) => string[]
  /** Corrections publiées, telles qu'elles ont été relues. Sert à l'éditeur. */
  surcouche: Surcouche
}

const Contexte = createContext<Traduction | null>(null)

/**
 * La langue déjà choisie, ou `null` si personne ne l'a encore choisie.
 *
 * Une valeur stockée hors de `LANGUES` — dictionnaire retiré, stockage bricolé — n'est
 * pas un choix : elle ne se traduirait nulle part, et on repose la question.
 */
function langueEnregistree(): Langue | null {
  const enregistree = chargerLangue()
  if (enregistree && (LANGUES as readonly string[]).includes(enregistree)) {
    return enregistree as Langue
  }
  return null
}

/**
 * Devine la langue à partir des préférences du navigateur, français par défaut.
 *
 * Exportée pour la barrière d'erreur : elle s'affiche hors du fournisseur — c'est
 * précisément lui qui peut avoir échoué — et n'a donc pas accès au contexte.
 */
export function langueInitiale(): Langue {
  const enregistree = langueEnregistree()
  if (enregistree) return enregistree
  for (const pref of navigator.languages ?? [navigator.language]) {
    const code = pref.slice(0, 2).toLowerCase()
    // Le luxembourgeois se déclare « lb », l'allemand d'Autriche ou de Suisse « de ».
    if ((LANGUES as readonly string[]).includes(code)) return code as Langue
  }
  return 'fr'
}

export function FournisseurTraduction({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(langueInitiale)
  const [langueChoisie, setLangueChoisie] = useState(() => langueEnregistree() !== null)
  const [surcouche, setSurcouche] = useState<Surcouche>(SURCOUCHE_VIDE)
  /** Compte les dictionnaires arrivés : sert uniquement à refaire le rendu. */
  const [charge, setCharge] = useState(0)

  /*
   * Filet de sécurité : `main.tsx` attend le dictionnaire de la langue devinée avant
   * le premier rendu. Ce fournisseur peut pourtant être monté ailleurs — un test, un
   * futur point d'entrée — et doit alors se procurer sa langue lui-même.
   */
  useEffect(() => {
    if (dictionnaireCharge(langue)) return
    void chargerDictionnaire(langue).finally(() => setCharge((n) => n + 1))
  }, [langue])

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

  /*
   * Le dictionnaire arrive avant le changement : basculer d'abord ferait clignoter la
   * page en français le temps du chargement. En cas d'échec — hors ligne, morceau
   * absent — on bascule quand même : la langue est choisie, et le repli français est
   * déjà la règle pour une clé manquante.
   */
  const changerLangue = useCallback((l: Langue) => {
    enregistrerLangue(l)
    void chargerDictionnaire(l).finally(() => {
      setLangue(l)
      setLangueChoisie(true)
      setCharge((n) => n + 1)
    })
  }, [])

  /** Surcouche d'abord, puis la langue demandée, puis le français. */
  const brut = useCallback(
    (cle: string) =>
      surcouche[langue]?.[cle] ?? chercher(dictionnaire(langue), cle) ?? chercher(fr, cle),
    // `charge` n'entre pas dans le calcul : il dit seulement que le dictionnaire vient
    // d'arriver, et qu'il faut refaire la traduction avec.
    [langue, surcouche, charge],
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
    () => ({ langue, langueChoisie, changerLangue, t, tListe, surcouche }),
    [langue, langueChoisie, changerLangue, t, tListe, surcouche],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useT(): Traduction {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useT doit être utilisé dans FournisseurTraduction')
  return ctx
}
