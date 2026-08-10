/**
 * État partagé du foyer.
 *
 * Une seule source de vérité pour l'adresse et les enfants, persistée dans
 * `localStorage` à chaque changement. Les contextes de calcul (arrêt le plus proche,
 * école) sont dérivés et mémorisés : changer le cycle d'un enfant suffit à tout
 * recalculer, sans qu'aucun composant ait à s'en préoccuper.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { chargerFoyer, enfantCalqueSur, enfantVierge, enregistrerFoyer } from './lib/stockage'
import { ajusterDillendapp, contexteEnfant, type ContexteEnfant } from './lib/plan'
import {
  avecHeureMatin,
  avecHeureSoir,
  avecMatin,
  avecMidi,
  avecSoir,
  type ChoixMatin,
  type ChoixMidi,
  type ChoixSoir,
} from './lib/moments'
import { useUrgences } from './urgences-contexte'
import type { Adresse, Cycle, Enfant, Foyer, Jour, SensAdresse } from './lib/types'

export type Theme = 'auto' | 'clair' | 'sombre'

interface EtatFoyer {
  foyer: Foyer
  /** Contexte de calcul par enfant, `null` si aucun arrêt ne dessert son école. */
  contextes: Map<string, ContexteEnfant | null>
  configure: boolean
  definirAdresse: (a: Adresse) => void
  /**
   * Renvoie l'identifiant du nouvel enfant, pour enchaîner sur son assistant.
   * `modele` : identifiant d'un frère ou d'une sœur dont on reprend la configuration.
   */
  ajouterEnfant: (prenom: string, cycle: Cycle, modele?: string) => string
  modifierEnfant: (id: string, champs: Partial<Omit<Enfant, 'id'>>) => void
  /**
   * Les trois moments de la journée, chacun écrit d'un seul geste sur les jours voulus.
   *
   * Une réponse de parent — « je le dépose à la maison relais » — vaut pour trois
   * champs du stockage à la fois. C'est `src/lib/moments.ts` qui fait la traduction et
   * qui ferme les contradictions ; le contexte ne fait que lui passer les jours et
   * l'enfant.
   */
  definirMatin: (id: string, jours: readonly Jour[], choix: ChoixMatin) => void
  definirMidi: (id: string, jours: readonly Jour[], choix: ChoixMidi) => void
  definirSoir: (id: string, jours: readonly Jour[], choix: ChoixSoir) => void
  definirHeureMatin: (id: string, jours: readonly Jour[], heure: string) => void
  definirHeureSoir: (id: string, jours: readonly Jour[], heure: string) => void
  definirAdresseJour: (id: string, jour: Jour, sens: SensAdresse, adresse: Adresse | null) => void
  supprimerEnfant: (id: string) => void
  remplacerFoyer: (f: Foyer) => void
  theme: Theme
  definirTheme: (t: Theme) => void
}

const Contexte = createContext<EtatFoyer | null>(null)

const CLE_THEME = 'bus-beckerich.theme'

function themeInitial(): Theme {
  try {
    const v = localStorage.getItem(CLE_THEME)
    return v === 'clair' || v === 'sombre' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function FournisseurFoyer({ children }: { children: ReactNode }) {
  const [foyer, setFoyer] = useState<Foyer>(chargerFoyer)
  const [theme, setThemeEtat] = useState<Theme>(themeInitial)
  // Une correction de position d'arrêt doit relancer le calcul des trajets.
  const { versionArrets } = useUrgences()

  useEffect(() => {
    enregistrerFoyer(foyer)
  }, [foyer])

  useEffect(() => {
    const racine = document.documentElement
    if (theme === 'auto') racine.removeAttribute('data-theme')
    else racine.dataset.theme = theme
    try {
      localStorage.setItem(CLE_THEME, theme)
    } catch {
      /* stockage indisponible : le thème vaudra pour la session seulement */
    }
  }, [theme])

  const contextes = useMemo(() => {
    const m = new Map<string, ContexteEnfant | null>()
    if (!foyer.adresse) return m
    for (const e of foyer.enfants) m.set(e.id, contexteEnfant(e, foyer.adresse))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foyer, versionArrets])

  const majEnfant = useCallback((id: string, transformer: (e: Enfant) => Enfant) => {
    setFoyer((f) => ({
      ...f,
      enfants: f.enfants.map((e) => (e.id === id ? transformer(e) : e)),
    }))
  }, [])

  const valeur = useMemo<EtatFoyer>(
    () => ({
      foyer,
      contextes,
      configure: foyer.adresse !== null && foyer.enfants.length > 0,

      definirAdresse: (adresse) => setFoyer((f) => ({ ...f, adresse })),

      /**
       * Crée un enfant, éventuellement calqué sur un frère ou une sœur.
       *
       * `modele` est l'identifiant de l'enfant à recopier ; sans lui, on part d'une
       * configuration vierge. Les heures de présence au Dillendapp sont écrêtées aux
       * bornes du NOUVEAU cycle : recopier telles quelles celles d'un C2 sur un C4
       * décrirait un dépôt que plus aucune navette ne prolonge.
       */
      ajouterEnfant: (prenom, cycle, modele) => {
        // L'identifiant est forgé ici, et non dans le `setFoyer`, pour pouvoir être
        // renvoyé à l'appelant : c'est lui qui enchaîne sur l'assistant du nouvel enfant.
        const id = `${Date.now().toString(36)}-${foyer.enfants.length}`
        setFoyer((f) => {
          const source = modele ? f.enfants.find((e) => e.id === modele) : undefined
          const neuf = source
            ? enfantCalqueSur(source, id, prenom, cycle)
            : enfantVierge(id, prenom, cycle)
          return {
            ...f,
            enfants: [...f.enfants, f.adresse ? ajusterDillendapp(neuf, f.adresse) : neuf],
          }
        })
        return id
      },

      /**
       * Un changement de cycle change le plan de bus de l'enfant, donc les heures de
       * présence encore possibles au Dillendapp. Les laisser telles quelles décrirait
       * un dépôt que plus aucune navette ne prolonge.
       */
      modifierEnfant: (id, champs) =>
        majEnfant(id, (e) => {
          const modifie = { ...e, ...champs }
          if (!champs.cycle || champs.cycle === e.cycle || !foyer.adresse) return modifie
          return ajusterDillendapp(modifie, foyer.adresse)
        }),

      definirMatin: (id, jours, choix) =>
        majEnfant(id, (e) => avecMatin(e, jours, choix, contextes.get(id) ?? null)),

      definirMidi: (id, jours, choix) => majEnfant(id, (e) => avecMidi(e, jours, choix)),

      definirSoir: (id, jours, choix) =>
        majEnfant(id, (e) => avecSoir(e, jours, choix, contextes.get(id) ?? null)),

      definirHeureMatin: (id, jours, heure) =>
        majEnfant(id, (e) => avecHeureMatin(e, jours, heure)),

      definirHeureSoir: (id, jours, heure) => majEnfant(id, (e) => avecHeureSoir(e, jours, heure)),

      /**
       * Pose ou retire une adresse dérogatoire. Un jour dont les deux sens reviennent
       * au domicile est retiré de la table plutôt que d'y rester en creux : sans ça, un
       * `{ matin: null, soir: null }` traînerait dans le stockage et dans les liens de
       * partage sans rien vouloir dire.
       */
      definirAdresseJour: (id, jour, sens, adresse) =>
        majEnfant(id, (e) => {
          const duJour = { ...e.adresses?.[jour], [sens]: adresse }
          const adresses = { ...e.adresses }
          if (duJour.matin || duJour.midi || duJour.soir) adresses[jour] = duJour
          else delete adresses[jour]
          return { ...e, adresses }
        }),

      supprimerEnfant: (id) =>
        setFoyer((f) => ({ ...f, enfants: f.enfants.filter((e) => e.id !== id) })),

      remplacerFoyer: setFoyer,

      theme,
      definirTheme: setThemeEtat,
    }),
    [foyer, contextes, majEnfant, theme],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useFoyer(): EtatFoyer {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useFoyer doit être utilisé dans FournisseurFoyer')
  return ctx
}
