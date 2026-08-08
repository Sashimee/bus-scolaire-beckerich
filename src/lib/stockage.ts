/**
 * Persistance locale.
 *
 * Rien ne quitte l'appareil : pas de compte, pas de serveur, pas de cookie de suivi.
 * `localStorage` suffit et reste lisible par le parent depuis son navigateur.
 */
import type { Foyer, Jour, RepasMidi, UsageBus } from './types'
import { JOURS } from './types'
import { deduireInscriptions } from './plan'

const CLE_FOYER = 'bus-beckerich.foyer'
const CLE_LANGUE = 'bus-beckerich.langue'
const CLE_AVERTISSEMENT = 'bus-beckerich.avertissement-accepte'

export const foyerVide: Foyer = { adresse: null, enfants: [] }

/** Grille de repas par défaut : l'enfant rentre manger tous les jours. */
export function repasParDefaut(): Record<Jour, RepasMidi> {
  return Object.fromEntries(JOURS.map((j) => [j, 'maison'])) as Record<Jour, RepasMidi>
}

/** Usage du bus par défaut : aller et retour tous les jours. */
export function busParDefaut(): Record<Jour, UsageBus> {
  return Object.fromEntries(JOURS.map((j) => [j, 'aller-retour'])) as Record<Jour, UsageBus>
}

/**
 * Par défaut, aucune présence déclarée au Dillendapp, ni avant ni après la classe :
 * l'enfant arrive et repart en bus. Sert aux deux grilles horaires.
 */
export function dillendappParDefaut(): Record<Jour, string | null> {
  return Object.fromEntries(JOURS.map((j) => [j, null])) as Record<Jour, string | null>
}

function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle)
    return brut === null ? defaut : (JSON.parse(brut) as T)
  } catch {
    // Mode privé, quota dépassé, données corrompues : on repart proprement du défaut
    // plutôt que d'empêcher l'application de démarrer.
    return defaut
  }
}

function ecrire(cle: string, valeur: unknown): void {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    /* Le stockage peut être indisponible : l'application reste utilisable sans. */
  }
}

/**
 * Relit le foyer enregistré en complétant les réglages introduits après coup.
 * Une configuration écrite avant l'ajout du réglage « usage du bus » reste valable :
 * on lui applique la valeur par défaut plutôt que de la rejeter.
 */
export const chargerFoyer = (): Foyer => {
  const f = lire(CLE_FOYER, foyerVide)
  return {
    ...f,
    enfants: (f.enfants ?? []).map((e) => {
      const complet = {
        ...e,
        repas: { ...repasParDefaut(), ...e.repas },
        bus: { ...busParDefaut(), ...e.bus },
        dillendappDepuis: { ...dillendappParDefaut(), ...e.dillendappDepuis },
        dillendappJusqua: { ...dillendappParDefaut(), ...e.dillendappJusqua },
        adresses: e.adresses ?? {},
      }
      // Les deux inscriptions n'ont pas toujours existé : les déduire de ce que le
      // parent a réellement saisi, sans quoi une famille inscrite verrait sa grille de
      // midi ou ses horaires disparaître à la mise à jour.
      const { midi, horsMidi } = deduireInscriptions(complet)
      return { ...complet, periscolaireMidi: midi, periscolaireHorsMidi: horsMidi }
    }),
  }
}
export const enregistrerFoyer = (f: Foyer): void => ecrire(CLE_FOYER, f)

export const chargerLangue = (): string | null => lire<string | null>(CLE_LANGUE, null)
export const enregistrerLangue = (l: string): void => ecrire(CLE_LANGUE, l)

export const avertissementAccepte = (): boolean => lire(CLE_AVERTISSEMENT, false)
export const accepterAvertissement = (): void => ecrire(CLE_AVERTISSEMENT, true)

/** Efface toutes les données locales, sur demande explicite du parent. */
export function toutEffacer(): void {
  for (const cle of [CLE_FOYER, CLE_LANGUE, CLE_AVERTISSEMENT]) {
    try {
      localStorage.removeItem(cle)
    } catch {
      /* rien à faire */
    }
  }
}
