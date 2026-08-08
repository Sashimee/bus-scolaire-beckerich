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
import { ajusterDillendapp, contexteEnfant, coursApresMidi, type ContexteEnfant } from './lib/plan'
import { useUrgences } from './urgences-contexte'
import type {
  Adresse,
  Cycle,
  Enfant,
  Foyer,
  Jour,
  RepasMidi,
  SensAdresse,
  UsageBus,
} from './lib/types'
import { JOURS } from './lib/types'

/**
 * Retire une adresse dérogatoire devenue contradictoire.
 *
 * Deux réglages ne doivent jamais se contredire dans le stockage : un enfant déposé au
 * Dillendapp le lundi matin ne part de nulle part ailleurs ce matin-là. L'interface le
 * cache déjà ; encore faut-il que la donnée disparaisse, sinon elle ressort au prochain
 * décochage — ou pire, dans un lien de partage.
 */
function sansAdresse(e: Enfant, jour: Jour, sens: SensAdresse): Enfant {
  const duJour = e.adresses?.[jour]
  if (!duJour?.[sens]) return e
  const restant = { ...duJour, [sens]: null }
  const adresses = { ...e.adresses }
  if (restant.matin || restant.midi || restant.soir) adresses[jour] = restant
  else delete adresses[jour]
  return { ...e, adresses }
}

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
  /** Inscription au repas de midi. Commande la grille des repas. */
  definirPeriscolaireMidi: (id: string, inscrit: boolean) => void
  /** Inscription avant la classe ou après l'école. Commande les grilles d'horaires. */
  definirPeriscolaireHorsMidi: (id: string, inscrit: boolean) => void
  definirDillendappDepuis: (id: string, jour: Jour, heure: string | null) => void
  definirDillendappJusqua: (id: string, jour: Jour, heure: string | null) => void
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
              periscolaireMidi: false,
              periscolaireHorsMidi: false,
              dillendappDepuis: dillendappParDefaut(),
              dillendappJusqua: dillendappParDefaut(),
              adresses: {},
            },
          ],
        }))
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

      definirRepas: (id, jour, repas) =>
        majEnfant(id, (e) => {
          const avecRepas = { ...e, repas: { ...e.repas, [jour]: repas } }
          // Déjeuner au Dillendapp, c'est déjeuner au Dillendapp : l'adresse de midi
          // n'a plus de destinataire.
          return repas === 'dillendapp' ? sansAdresse(avecRepas, jour, 'midi') : avecRepas
        }),

      definirRepasSemaine: (id, repas) =>
        majEnfant(id, (e) => {
          const avecRepas = {
            ...e,
            repas: Object.fromEntries(JOURS.map((j) => [j, repas])) as Record<Jour, RepasMidi>,
          }
          return repas === 'dillendapp'
            ? JOURS.reduce<Enfant>((acc, j) => sansAdresse(acc, j, 'midi'), avecRepas)
            : avecRepas
        }),

      definirBus: (id, jour, usage) =>
        majEnfant(id, (e) => ({
          ...e,
          bus: { ...busParDefaut(), ...e.bus, [jour]: usage },
        })),

      /**
       * Cocher l'inscription du midi bascule toute la semaine sur le Dillendapp : on
       * ne s'inscrit pas au périscolaire pour n'y déjeuner aucun jour. Une grille déjà
       * réglée jour par jour n'est en revanche jamais écrasée — décocher puis recocher
       * ne doit pas détruire le travail du parent.
       */
      definirPeriscolaireMidi: (id, inscrit) =>
        majEnfant(id, (e) => {
          if (!inscrit) return { ...e, periscolaireMidi: false }
          if (JOURS.some((j) => e.repas[j] === 'dillendapp')) return { ...e, periscolaireMidi: true }
          const repas = Object.fromEntries(JOURS.map((j) => [j, 'dillendapp'])) as Record<
            Jour,
            RepasMidi
          >
          return JOURS.reduce<Enfant>((acc, j) => sansAdresse(acc, j, 'midi'), {
            ...e,
            periscolaireMidi: true,
            repas,
          })
        }),

      definirPeriscolaireHorsMidi: (id, inscrit) =>
        majEnfant(id, (e) => ({ ...e, periscolaireHorsMidi: inscrit })),

      /** Le parent dépose lui-même : il n'y a plus d'adresse de départ ce matin-là. */
      definirDillendappDepuis: (id, jour, heure) =>
        majEnfant(id, (e) => {
          const avecHeure = {
            ...e,
            dillendappDepuis: { ...dillendappParDefaut(), ...e.dillendappDepuis, [jour]: heure },
          }
          return heure ? sansAdresse(avecHeure, jour, 'matin') : avecHeure
        }),

      /**
       * Le parent vient chercher l'enfant sur place : plus d'adresse de retour ce
       * soir-là. Et les jours sans cours l'après-midi, y rester suppose d'y avoir
       * déjeuné — la classe s'arrête à 11:45, il n'y a pas d'autre midi possible.
       */
      definirDillendappJusqua: (id, jour, heure) =>
        majEnfant(id, (e) => {
          const avecHeure = {
            ...e,
            dillendappJusqua: { ...dillendappParDefaut(), ...e.dillendappJusqua, [jour]: heure },
          }
          if (!heure) return avecHeure
          const sansRetour = sansAdresse(avecHeure, jour, 'soir')
          if (coursApresMidi(jour)) return sansRetour
          return sansAdresse(
            {
              ...sansRetour,
              periscolaireMidi: true,
              repas: { ...sansRetour.repas, [jour]: 'dillendapp' },
            },
            jour,
            'midi',
          )
        }),

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
