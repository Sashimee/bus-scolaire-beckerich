/**
 * Ce que l'écran « Aujourd'hui » retient de la journée d'un enfant.
 *
 * Ces règles vivaient dans la page. Elles n'y avaient rien à faire : décider quelle
 * heure d'un trajet compte pour un parent, écarter un bus annulé, savoir s'il reste
 * assez de temps pour marcher jusqu'à l'arrêt — ce sont des règles, pas de l'affichage,
 * et une règle qu'on ne peut pas éprouver seule finit par se tromper en silence.
 */
import { enMinutes } from './plan'
import { sensTrajet } from './affichage'
import { heureArriveeEffective, heureEffective, perturbationsDuTrajet } from './urgences'
import type { Perturbation } from './urgences'
import type { Trajet } from './types'

export interface EtapeDuJour {
  trajet: Trajet
  /** L'heure telle qu'elle est publiée au plan. */
  heure: string
  /** La même, décalée par un retard éventuel. Identique à `heure` en temps normal. */
  effective: string
}

/** Les minutes écoulées depuis minuit. L'unité dans laquelle se comparent les horaires. */
export function minutesDuJour(maintenant: Date): number {
  return maintenant.getHours() * 60 + maintenant.getMinutes()
}

/**
 * L'heure que le parent doit retenir d'un trajet.
 *
 * À l'aller, c'est le départ : c'est là qu'il faut être à l'arrêt. Au retour, c'est
 * l'arrivée — savoir quand le bus quitte l'école ne dit rien à qui attend au bout de la
 * rue. La page « semaine » applique déjà cette règle ; l'écran d'accueil s'en écartait,
 * ce qui n'avait guère de conséquence tant que l'heure y était petite.
 */
export function heureUtile(trajet: Trajet): string | null {
  return sensTrajet(trajet.type) === 'retour' ? trajet.arrivee.heure : trajet.depart.heure
}

/** La même heure, une fois les perturbations du jour appliquées. */
export function heureUtileEffective(trajet: Trajet, perturbations: Perturbation[]): string | null {
  return sensTrajet(trajet.type) === 'retour'
    ? heureArriveeEffective(trajet, perturbations)
    : heureEffective(trajet, perturbations)
}

/**
 * Les trajets du jour qui concernent le parent, dans l'ordre.
 *
 * Un trajet annulé disparaît de la liste : afficher l'heure d'un bus qui ne passera pas
 * est pire que ne rien afficher, et le bandeau de perturbation en tête de page dit déjà
 * ce qui se passe.
 */
export function etapesDuJour(trajets: Trajet[], perturbations: Perturbation[]): EtapeDuJour[] {
  return trajets
    .filter((x) => x.concerneParent)
    .flatMap((trajet) => {
      const concernees = perturbationsDuTrajet(perturbations, trajet)
      if (concernees.some((p) => p.type === 'annulation')) return []

      const heure = heureUtile(trajet)
      const effective = heureUtileEffective(trajet, concernees) ?? heure
      if (heure === null || effective === null) return []
      return [{ trajet, heure, effective }]
    })
}

/** Ce qui reste à venir : tout ce dont l'heure n'est pas encore passée. */
export function restantes(etapes: EtapeDuJour[], maintenant: Date): EtapeDuJour[] {
  const minutes = minutesDuJour(maintenant)
  return etapes.filter((e) => (enMinutes(e.effective) ?? 0) >= minutes)
}

/** Une étape dont l'heure est derrière nous : elle s'affiche en grisé, pas en attente. */
export function estPassee(etape: EtapeDuJour, maintenant: Date): boolean {
  return (enMinutes(etape.effective) ?? 0) < minutesDuJour(maintenant)
}

/**
 * Le temps qu'il reste avant de devoir sortir de chez soi.
 *
 * Ce n'est pas le temps avant le bus : le temps de marche jusqu'à l'arrêt en est déjà
 * retiré. « Dans 24 min » veut donc dire « il reste 24 minutes avant de partir », et la
 * valeur devient négative quand il est déjà trop tard — ce que l'écran traduit par
 * « partir maintenant » plutôt que par un compte à rebours à l'envers.
 */
export function minutesAvantDepart(
  etape: EtapeDuJour,
  maintenant: Date,
  tempsMarche: number,
): number {
  return (enMinutes(etape.effective) ?? 0) - minutesDuJour(maintenant) - tempsMarche
}
