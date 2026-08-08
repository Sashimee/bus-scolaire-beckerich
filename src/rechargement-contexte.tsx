/**
 * Garde-fou du rechargement automatique.
 *
 * Recharger la page dès qu'une version est publiée est le bon défaut : des horaires
 * périmés dans un onglet ouvert depuis trois jours n'ont aucune valeur. Mais un
 * rechargement au mauvais moment détruit une saisie en cours — un agent communal qui
 * tape le texte d'une annulation, par exemple. Les pages concernées déclarent donc leur
 * raison de ne pas recharger, et le bandeau retombe alors sur un bouton manuel.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface EtatRechargement {
  /** Au moins une raison de ne pas recharger automatiquement est active. */
  bloque: boolean
  /** Enregistre une raison. Renvoie la fonction qui la retire. */
  bloquerRechargement: (raison: string) => () => void
}

const Contexte = createContext<EtatRechargement | null>(null)

export function FournisseurRechargement({ children }: { children: ReactNode }) {
  const [raisons, setRaisons] = useState<string[]>([])

  const bloquerRechargement = useCallback((raison: string) => {
    setRaisons((liste) => (liste.includes(raison) ? liste : [...liste, raison]))
    return () => setRaisons((liste) => liste.filter((r) => r !== raison))
  }, [])

  const valeur = useMemo(
    () => ({ bloque: raisons.length > 0, bloquerRechargement }),
    [raisons, bloquerRechargement],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useRechargement(): EtatRechargement {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useRechargement hors de FournisseurRechargement')
  return ctx
}

/**
 * Bloque le rechargement automatique tant que `actif` est vrai.
 *
 * Forme prévue pour l'appel depuis un composant : la raison se retire d'elle-même au
 * démontage, sans quoi une page quittée continuerait de bloquer le rechargement.
 */
export function useBlocageRechargement(actif: boolean, raison: string): void {
  const { bloquerRechargement } = useRechargement()
  useEffect(() => {
    if (!actif) return
    return bloquerRechargement(raison)
  }, [actif, raison, bloquerRechargement])
}
