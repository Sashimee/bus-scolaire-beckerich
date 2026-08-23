/**
 * Amorçage du plan de référence (lot 25).
 *
 * Le plan est embarqué dans le bundle (graine et repli hors ligne) ; s'il en existe un
 * publié en base, on l'adopte AVANT le montage de React, en remplaçant le binding vivant
 * de `donnees.ts`. Toutes les lectures du plan étant postérieures au montage, elles
 * voient alors la bonne version, sans qu'aucune signature du moteur ne change.
 *
 * Le plan change une fois l'an : on ne cherche pas la propagation en direct (un onglet
 * déjà ouvert garde son plan jusqu'à la prochaine ouverture). Ce qui compte, c'est qu'un
 * plan malformé ne remplace JAMAIS un plan valide — une erreur ici ferait rater un bus.
 */
import { remplacerPlan } from './donnees'
import { validerPlan } from './validation'
import type { Plan } from './types'
import { URL_API } from '../config'

const CLE_CACHE = 'bus-beckerich.horaires'
/** Le réseau ne doit pas retarder l'affichage indéfiniment : au-delà, on garde le repli. */
const DELAI_MS = 5000

interface HorairesEnCache {
  version: string
  plan: Plan
}

function lireCache(): HorairesEnCache | null {
  try {
    const brut = localStorage.getItem(CLE_CACHE)
    return brut ? (JSON.parse(brut) as HorairesEnCache) : null
  } catch {
    return null
  }
}

function ecrireCache(valeur: HorairesEnCache): void {
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify(valeur))
  } catch {
    /* stockage indisponible : le plan vaudra pour cette session seulement */
  }
}

/**
 * Un plan n'est adopté que s'il passe la MÊME validation que l'éditeur (`validerPlan`,
 * partagé). Une erreur bloquante le fait rejeter : on garde alors le plan précédent.
 */
function planValide(brut: unknown): Plan | null {
  const problemes = validerPlan(brut as never)
  if (problemes.some((p) => p.gravite === 'erreur')) return null
  return brut as Plan
}

export async function initialiserHoraires(): Promise<void> {
  // 1. Repli immédiat : le dernier plan publié connu (cache), sinon l'embarqué déjà en
  //    place. Ainsi, même hors ligne, le plan affiché est le plus récent qu'on ait vu.
  const cache = lireCache()
  if (cache && planValide(cache.plan)) remplacerPlan(cache.plan)

  // 2. Sans serveur configuré, l'embarqué (ou le cache) fait autorité : rien de plus.
  if (!URL_API) return

  // 3. Réseau, borné dans le temps. Un plan plus récent est adopté et mis en cache pour
  //    la prochaine ouverture ; hors ligne, le fetch échoue vite et le repli tient.
  try {
    const ctrl = new AbortController()
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS)
    const rep = await fetch(`${URL_API}/horaires`, { cache: 'no-store', signal: ctrl.signal })
    clearTimeout(minuteur)
    if (!rep.ok) return

    const recu = (await rep.json()) as { version?: string; plan?: unknown }
    // 'embarque' = aucun plan publié : le fichier du bundle fait déjà autorité.
    if (!recu?.version || recu.version === 'embarque' || recu.version === cache?.version) return

    const valide = planValide(recu.plan)
    if (valide) {
      remplacerPlan(valide)
      ecrireCache({ version: recu.version, plan: valide })
    }
  } catch {
    /* hors ligne ou délai dépassé : le repli est déjà en place */
  }
}
