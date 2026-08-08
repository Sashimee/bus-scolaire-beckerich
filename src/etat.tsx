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
import {
  busParDefaut,
  chargerFoyer,
  dillendappParDefaut,
  enregistrerFoyer,
  repasParDefaut,
} from './lib/stockage'
import { contexteEnfant, type ContexteEnfant } from './lib/plan'
import { useUrgences } from './urgences-contexte'
import type { Adresse, Cycle, Enfant, Foyer, Jour, RepasMidi, UsageBus } from './lib/types'
import { JOURS } from './lib/types'

export type Theme = 'auto' | 'clair' | 'sombre'

interface EtatFoyer {
  foyer: Foyer
  /** Contexte de calcul par enfant, `null` si aucun arrêt ne dessert son école. */
  contextes: Map<string, ContexteEnfant | null>
  configure: boolean
  definirAdresse: (a: Adresse) => void
  /** Renvoie l'identifiant du nouvel enfant, pour enchaîner sur son assistant. */
  ajouterEnfant: (prenom: string, cycle: Cycle) => string
  modifierEnfant: (id: string, champs: Partial<Omit<Enfant, 'id'>>) => void
  definirRepas: (id: string, jour: Jour, repas: RepasMidi) => void
  definirRepasSemaine: (id: string, repas: RepasMidi) => void
  definirBus: (id: string, jour: Jour, usage: UsageBus) => void
  definirBusSemaine: (id: string, usage: UsageBus) => void
  definirPeriscolaire: (id: string, inscrit: boolean) => void
  definirDillendappDepuis: (id: string, jour: Jour, heure: string | null) => void
  definirDillendappJusqua: (id: string, jour: Jour, heure: string | null) => void
  definirAdresseJour: (
    id: string,
    jour: Jour,
    sens: 'matin' | 'soir',
    adresse: Adresse | null,
  ) => void
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

      ajouterEnfant: (prenom, cycle) => {
        // L'identifiant est forgé ici, et non dans le `setFoyer`, pour pouvoir être
        // renvoyé à l'appelant : c'est lui qui enchaîne sur l'assistant du nouvel enfant.
        const id = `${Date.now().toString(36)}-${foyer.enfants.length}`
        setFoyer((f) => ({
          ...f,
          enfants: [
            ...f.enfants,
            {
              id,
              prenom: prenom.trim(),
              cycle,
              repas: repasParDefaut(),
              bus: busParDefaut(),
              periscolaire: false,
              dillendappDepuis: dillendappParDefaut(),
              dillendappJusqua: dillendappParDefaut(),
              adresses: {},
            },
          ],
        }))
        return id
      },

      modifierEnfant: (id, champs) => majEnfant(id, (e) => ({ ...e, ...champs })),

      definirRepas: (id, jour, repas) =>
        majEnfant(id, (e) => ({ ...e, repas: { ...e.repas, [jour]: repas } })),

      definirRepasSemaine: (id, repas) =>
        majEnfant(id, (e) => ({
          ...e,
          repas: Object.fromEntries(
            Object.keys(e.repas).map((j) => [j, repas]),
          ) as Record<Jour, RepasMidi>,
        })),

      definirBus: (id, jour, usage) =>
        majEnfant(id, (e) => ({
          ...e,
          bus: { ...busParDefaut(), ...e.bus, [jour]: usage },
        })),

      definirPeriscolaire: (id, inscrit) => majEnfant(id, (e) => ({ ...e, periscolaire: inscrit })),

      definirDillendappDepuis: (id, jour, heure) =>
        majEnfant(id, (e) => ({
          ...e,
          dillendappDepuis: { ...dillendappParDefaut(), ...e.dillendappDepuis, [jour]: heure },
        })),

      definirDillendappJusqua: (id, jour, heure) =>
        majEnfant(id, (e) => ({
          ...e,
          dillendappJusqua: { ...dillendappParDefaut(), ...e.dillendappJusqua, [jour]: heure },
        })),

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
          if (duJour.matin || duJour.soir) adresses[jour] = duJour
          else delete adresses[jour]
          return { ...e, adresses }
        }),

      definirBusSemaine: (id, usage) =>
        majEnfant(id, (e) => ({
          ...e,
          bus: Object.fromEntries(JOURS.map((j) => [j, usage])) as Record<Jour, UsageBus>,
        })),

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
