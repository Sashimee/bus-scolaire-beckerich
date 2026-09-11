/**
 * Les règles de l'écran « Aujourd'hui ».
 *
 * Elles décidaient jusqu'ici du contenu de la page sans qu'aucun test ne les regarde,
 * parce qu'elles étaient écrites dans la page. Ce qui se joue : l'heure qu'un parent
 * lit en grand, le bus qu'on lui cache parce qu'il est annulé, et le moment où
 * l'application lui dit de sortir de chez lui.
 */
import { describe, expect, it } from 'vitest'
import {
  estPassee,
  etapesDuJour,
  heureUtile,
  minutesAvantDepart,
  minutesDuJour,
  restantes,
  type EtapeDuJour,
} from './aujourdhui'
import { contexteEnfant, trajetsDuJour } from './plan'
import { JOURS } from './types'
import type { Adresse, Cycle, Enfant, Jour, RepasMidi, Trajet } from './types'
import type { Perturbation } from './urgences'

function enfant(cycle: Cycle, repas: RepasMidi = 'maison'): Enfant {
  return {
    id: 'e1',
    prenom: 'Mia',
    cycle,
    repas: Object.fromEntries(JOURS.map((j) => [j, repas])) as Record<Jour, RepasMidi>,
  }
}

const HOVELANGE: Adresse = { libelle: 'Hovelange', localite: 'Hovelange', coord: [49.7228, 5.9049] }

const journee = (jour: Jour = 'lundi'): Trajet[] =>
  trajetsDuJour(contexteEnfant(enfant('c2'), HOVELANGE)!, jour).trajets

const a = (heure: string): Date => {
  const [h, m] = heure.split(':').map(Number)
  return new Date(2026, 8, 7, h, m)
}

/** Une étape minimale : seule son heure compte pour les règles de temps. */
const etape = (effective: string): EtapeDuJour =>
  ({ trajet: {} as Trajet, heure: effective, effective }) as EtapeDuJour

const perturbation = (p: Partial<Perturbation>): Perturbation =>
  ({
    id: 'p1',
    du: '2026-09-07',
    au: '2026-09-07',
    message: { fr: 'test' },
    publieLe: '2026-09-07',
    publiePar: 'test',
    gravite: 'alerte',
    ...p,
  }) as Perturbation

describe('l’heure qu’un parent doit retenir', () => {
  it("prend le départ à l'aller et l'arrivée au retour", () => {
    const aller = journee().find((t) => t.type === 'aller-matin')!
    const retour = journee().find((t) => t.type === 'retour-midi')!

    expect(heureUtile(aller)).toBe(aller.depart.heure)
    expect(heureUtile(retour)).toBe(retour.arrivee.heure)
    // Ce n'est pas la même heure : c'est tout l'intérêt de la règle.
    expect(heureUtile(retour)).not.toBe(retour.depart.heure)
  })
})

describe('les étapes du jour', () => {
  it('ne retient que les trajets qui concernent le parent', () => {
    const trajets = journee()
    const etapes = etapesDuJour(trajets, [])

    expect(etapes.length).toBeGreaterThan(0)
    expect(etapes.every((e) => e.trajet.concerneParent)).toBe(true)
    expect(etapes.length).toBeLessThanOrEqual(trajets.length)
  })

  /*
   * Le cas qui a motivé la règle : afficher l'heure d'un bus supprimé, c'est envoyer un
   * enfant attendre au bord d'une route.
   */
  it('efface un trajet annulé plutôt que d’en afficher l’heure', () => {
    const trajets = journee()
    const vise = etapesDuJour(trajets, [])[0]
    const annulation = perturbation({ type: 'annulation', ligne: vise.trajet.ligne.id })

    const restant = etapesDuJour(trajets, [annulation])

    expect(restant.some((e) => e.trajet.ligne.id === vise.trajet.ligne.id)).toBe(false)
  })

  it('décale l’heure d’un retard sans perdre l’heure publiée', () => {
    const trajets = journee()
    const vise = etapesDuJour(trajets, [])[0]
    const retard = perturbation({ type: 'retard', minutes: 10, ligne: vise.trajet.ligne.id })

    const [premiere] = etapesDuJour(trajets, [retard])

    expect(premiere.heure).toBe(vise.heure)
    expect(premiere.effective).not.toBe(premiere.heure)
    expect(minutesDuJour(a(premiere.effective))).toBe(minutesDuJour(a(premiere.heure)) + 10)
  })
})

describe('ce qui reste à venir', () => {
  const etapes = [etape('07:12'), etape('12:20'), etape('16:05')]

  it('garde le bus de la minute même : il n’est pas encore parti', () => {
    expect(restantes(etapes, a('07:12')).map((e) => e.effective)).toEqual([
      '07:12',
      '12:20',
      '16:05',
    ])
  })

  it('écarte ce qui est derrière nous', () => {
    expect(restantes(etapes, a('07:13')).map((e) => e.effective)).toEqual(['12:20', '16:05'])
    expect(restantes(etapes, a('20:00'))).toEqual([])
  })

  it('marque comme passée une étape dont l’heure est franchie, pas celle en cours', () => {
    expect(estPassee(etape('07:12'), a('07:12'))).toBe(false)
    expect(estPassee(etape('07:12'), a('07:13'))).toBe(true)
  })
})

describe('le temps qu’il reste avant de sortir', () => {
  it('retire le temps de marche jusqu’à l’arrêt', () => {
    expect(minutesAvantDepart(etape('07:30'), a('07:00'), 8)).toBe(22)
  })

  /*
   * Négatif = il est déjà trop tard. L'écran le traduit par « partir maintenant » ;
   * l'important est que la règle ne le ramène pas à zéro en douce, ce qui ferait croire
   * qu'on est pile à l'heure.
   */
  it('passe sous zéro quand le temps de marche ne suffit plus', () => {
    expect(minutesAvantDepart(etape('07:30'), a('07:25'), 8)).toBe(-3)
  })
})
