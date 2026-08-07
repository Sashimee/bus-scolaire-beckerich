/**
 * Moteur du plan de bus.
 *
 * Fonction centrale : `trajetsDuJour(contexte, jour)`. Tout le reste de l'application
 * — accueil, fiche enfant, export calendrier, feuille imprimable — passe par elle.
 * Une erreur ici ferait rater un bus à un enfant : c'est le fichier le plus testé.
 */
import { distanceMarche, distanceVolOiseau, tempsMarche } from './distance'
import { arret, arretEcoleDuCycle, arrets, maisonRelais, plan } from './donnees'
import type {
  Adresse,
  Arret,
  ArretDesservi,
  Coord,
  Direction,
  Enfant,
  Etape,
  Jour,
  JourneeEnfant,
  Ligne,
  Periode,
  RepasMidi,
  Reserve,
  Service,
  Trajet,
  TypeTrajet,
} from './types'
import { JOURS } from './types'

/** Deux arrêts distants de moins de ça sont considérés comme le même point d'embarquement. */
const RAYON_EQUIVALENCE_M = 150

/** Convertit « 07:25 » en minutes depuis minuit. `null` si l'heure n'est pas publiée. */
export function enMinutes(heure: string | null): number | null {
  if (!heure) return null
  const [h, m] = heure.split(':').map(Number)
  return h * 60 + m
}

/**
 * Arrêts confondus avec celui-ci sur le terrain. Le plan officiel note par exemple
 * « École/Dillendapp » pour un même point : le Dillendapp est à 90 m de l'école de
 * Beckerich, et un enfant passe de l'un à l'autre à pied sans que ce soit un trajet.
 */
export function arretsEquivalents(id: string): string[] {
  const ref = arret(id)
  return arrets
    .filter((a) => distanceVolOiseau(ref.coord, a.coord) <= RAYON_EQUIVALENCE_M)
    .map((a) => a.id)
}

/**
 * Une réservation est-elle satisfaite ? Sert aussi bien pour une ligne entière que
 * pour un arrêt particulier d'une course.
 */
function reserveSatisfaite(
  r: Reserve | undefined,
  enfant: Enfant,
  villageDomicile: string,
  repas: RepasMidi,
): boolean {
  if (!r) return true

  // Certains villages sont admis quel que soit le cycle : c'est le cas de Huttange,
  // dont les enfants n'ont pas d'autre desserte à ces heures-là.
  const village = villageDomicile.toLowerCase()
  if (r.villagesAussiAdmis?.some((v) => v.toLowerCase() === village)) return true

  if (r.cycles && !r.cycles.includes(enfant.cycle)) return false
  if (r.conditionDillendapp && repas !== 'dillendapp') return false
  return true
}

interface Liaison {
  ligne: Ligne
  service: Service
  depart: Etape
  arrivee: Etape
  notes: string[]
}

/**
 * Trouve, dans un service, le couple (montée, descente) le plus direct entre deux
 * ensembles d'arrêts. Certaines lignes passent deux fois au même endroit — l'Aller 3
 * dessert le Dillendapp à 07:38 puis à 07:52 — d'où la recherche sur toutes les paires.
 */
function meilleurePaire(
  service: Service,
  depuis: string[],
  vers: string[],
  utilisable: (a: ArretDesservi) => boolean,
): { i: number; j: number } | null {
  let meilleur: { i: number; j: number } | null = null
  for (let i = 0; i < service.arrets.length; i++) {
    if (!depuis.includes(service.arrets[i].arret)) continue
    if (!utilisable(service.arrets[i])) continue
    for (let j = i + 1; j < service.arrets.length; j++) {
      if (!vers.includes(service.arrets[j].arret)) continue
      if (!utilisable(service.arrets[j])) continue
      // Les heures publiées doivent rester croissantes : sinon la paire décrit un
      // passage antérieur et l'enfant ne peut pas l'emprunter.
      const hi = enMinutes(service.arrets[i].heure)
      const hj = enMinutes(service.arrets[j].heure)
      if (hi !== null && hj !== null && hj < hi) continue
      if (!meilleur || j - i < meilleur.j - meilleur.i) meilleur = { i, j }
      break
    }
  }
  return meilleur
}

interface RechercheOptions {
  jour: Jour
  depuis: string[]
  vers: string[]
  periodes: Periode[]
  directions: Direction[]
  enfant: Enfant
  villageDomicile: string
  repas: RepasMidi
}

/** Toutes les liaisons possibles pour un déplacement donné, triées par heure de départ. */
function liaisons(o: RechercheOptions): Liaison[] {
  const trouvees: Liaison[] = []

  // Un arrêt n'est empruntable que s'il est réellement desservi et que sa restriction
  // propre est satisfaite : le plan liste par exemple Huttange sur l'Aller 2 sans le
  // desservir, et n'ouvre le départ de 07:25 sur l'Aller 1 qu'aux cycles 3.
  const utilisable = (a: ArretDesservi) =>
    a.desservi !== false && reserveSatisfaite(a.reserve, o.enfant, o.villageDomicile, o.repas)

  for (const ligne of plan.lignes) {
    if (!o.directions.includes(ligne.direction)) continue
    if (!reserveSatisfaite(ligne.reserve, o.enfant, o.villageDomicile, o.repas)) continue

    for (const service of ligne.services) {
      if (!service.jours.includes(o.jour)) continue
      if (!o.periodes.includes(service.periode)) continue

      const paire = meilleurePaire(service, o.depuis, o.vers, utilisable)
      if (!paire) continue

      const d = service.arrets[paire.i]
      const a = service.arrets[paire.j]
      trouvees.push({
        ligne,
        service,
        depart: { arret: arret(d.arret), heure: d.heure },
        arrivee: { arret: arret(a.arret), heure: a.heure },
        notes: [...(d.notes ?? []), ...(a.notes ?? [])],
      })
    }
  }

  // Tri par heure de départ. Les courses sans heure publiée passent en dernier :
  // elles sont utilisables mais moins informatives pour le parent.
  return trouvees.sort((x, y) => {
    const hx = enMinutes(x.depart.heure)
    const hy = enMinutes(y.depart.heure)
    if (hx === null) return 1
    if (hy === null) return -1
    return hx - hy
  })
}

export interface ArretProche {
  arret: Arret
  distance: number
  temps: number
}

/** Tous les arrêts, du plus proche au plus éloigné d'un point. */
export function arretsProches(coord: Coord): ArretProche[] {
  return arrets
    .map((a) => ({
      arret: a,
      distance: distanceMarche(coord, a.coord),
      temps: tempsMarche(coord, a.coord),
    }))
    .sort((x, y) => x.distance - y.distance)
}

export interface ContexteEnfant {
  enfant: Enfant
  arretDomicile: Arret
  arretEcole: Arret
  distance: number
  temps: number
  /** L'école est l'arrêt le plus proche : l'enfant peut y aller à pied. */
  marcheDirecte: boolean
}

/**
 * Détermine l'arrêt de départ d'un enfant.
 *
 * Ce n'est pas simplement l'arrêt le plus proche : encore faut-il qu'une ligne y passe
 * DANS LE BON SENS vers l'école de son cycle. Un enfant d'Hovelange scolarisé à
 * Noerdange ne peut pas prendre l'Aller 1, qui dessert Noerdange avant Hovelange ;
 * il lui faut l'Aller 2. On retient donc le plus proche arrêt réellement utile.
 */
export function contexteEnfant(enfant: Enfant, adresse: Adresse): ContexteEnfant | null {
  const arretEcole = arretEcoleDuCycle(enfant.cycle)
  const proches = arretsProches(adresse.coord)
  if (!proches.length) return null

  if (proches[0].arret.id === arretEcole.id) {
    return {
      enfant,
      arretDomicile: arretEcole,
      arretEcole,
      distance: proches[0].distance,
      temps: proches[0].temps,
      marcheDirecte: true,
    }
  }

  for (const p of proches) {
    if (p.arret.id === arretEcole.id) continue
    const utile = JOURS.some(
      (jour) =>
        liaisons({
          jour,
          depuis: [p.arret.id],
          vers: arretsEquivalents(arretEcole.id),
          periodes: ['matin'],
          directions: ['vers-ecole'],
          enfant,
          villageDomicile: p.arret.village,
          repas: enfant.repas[jour],
        }).length > 0,
    )
    if (utile) {
      return {
        enfant,
        arretDomicile: p.arret,
        arretEcole,
        distance: p.distance,
        temps: p.temps,
        marcheDirecte: false,
      }
    }
  }
  return null
}

/** Y a-t-il cours l'après-midi ce jour-là ? */
export function coursApresMidi(jour: Jour): boolean {
  return plan.horairesEcole.apresMidi.jours.includes(jour)
}

/**
 * Les trajets d'un enfant pour un jour donné, dans l'ordre chronologique.
 *
 * Selon le jour et le repas de midi, il y en a de deux à quatre :
 *  — lundi/mercredi/vendredi + rentre manger : aller, retour midi, aller, retour soir
 *  — lundi/mercredi/vendredi + Dillendapp    : aller, navettes internes, retour soir
 *  — mardi/jeudi (pas de cours l'après-midi) : aller, retour midi
 */
export function trajetsDuJour(ctx: ContexteEnfant, jour: Jour): JourneeEnfant {
  const { enfant, arretDomicile, arretEcole } = ctx
  const repas = enfant.repas[jour]
  const apresMidi = coursApresMidi(jour)

  // Une famille peut n'utiliser le bus qu'à moitié : déposer l'enfant en voiture le
  // matin et le laisser rentrer en bus, ou l'inverse. On ne propose alors que les
  // trajets réellement empruntés — et on ne signale surtout pas comme « non couvert »
  // un retour que le parent assure lui-même.
  const usage = enfant.bus?.[jour] ?? 'aller-retour'
  const prendAller = usage === 'aller-retour' || usage === 'aller'
  const prendRetour = usage === 'aller-retour' || usage === 'retour'

  // Heure de fin de présence à la maison relais. Elle change la destination du soir :
  // l'enfant retourne bien en classe l'après-midi — l'école est obligatoire — mais le
  // bus du soir le dépose au Dillendapp au lieu de le ramener chez lui.
  const finDillendapp = repas === 'dillendapp' ? (enfant.dillendappJusqua?.[jour] ?? null) : null

  const domicile = [arretDomicile.id]
  const ecole = arretsEquivalents(arretEcole.id)
  const dillendapp = arretsEquivalents(maisonRelais.arret)

  const trajets: Trajet[] = []
  const manquants: TypeTrajet[] = []
  const incertitudes: string[] = []

  if (ctx.marcheDirecte) return { jour, trajets, manquants, incertitudes }

  const base = {
    jour,
    enfant,
    villageDomicile: arretDomicile.village,
    repas,
  }

  const ajouter = (
    type: TypeTrajet,
    o: Omit<RechercheOptions, 'jour' | 'enfant' | 'villageDomicile' | 'repas'> & {
      /** Force la visibilité côté parent quand le trajet ne touche pas son arrêt. */
      concerneParent?: boolean
    },
  ) => {
    const trouvees = liaisons({ ...base, ...o })
    if (!trouvees.length) {
      manquants.push(type)
      return
    }
    const [principal, ...reste] = trouvees
    trajets.push({
      type,
      ligne: principal.ligne,
      serviceId: principal.service.id,
      depart: principal.depart,
      arrivee: principal.arrivee,
      notes: principal.notes,
      incertitude: principal.service.incertitude,
      concerneParent:
        o.concerneParent ??
        (principal.depart.arret.id === arretDomicile.id ||
          principal.arrivee.arret.id === arretDomicile.id),
      alternatives: reste.map((l) => ({ ligne: l.ligne, heureDepart: l.depart.heure })),
    })
  }

  // 1. Le matin, tout le monde va à l'école.
  if (prendAller) {
    ajouter('aller-matin', {
      depuis: domicile,
      vers: ecole,
      periodes: ['matin'],
      directions: ['vers-ecole'],
    })
  }

  if (repas === 'maison') {
    // 2. Retour à la maison pour déjeuner.
    if (prendRetour) {
      ajouter('retour-midi', {
        depuis: ecole,
        vers: domicile,
        periodes: ['midi'],
        directions: ['vers-domicile'],
      })
    }
    // 3. Retour en classe, uniquement les jours où il y a cours l'après-midi.
    if (apresMidi && prendAller) {
      ajouter('aller-apres-midi', {
        depuis: domicile,
        vers: ecole,
        periodes: ['apres-midi'],
        directions: ['vers-ecole'],
      })
    }
  } else {
    // 2 bis. L'enfant rejoint la maison relais. Selon son cycle, c'est le bus
    // Dillendapp dédié (C2) ou le Retour 2 (C3 et autres), comme le précise le plan.
    ajouter('navette-dillendapp-midi', {
      depuis: ecole,
      vers: dillendapp,
      periodes: ['midi'],
      directions: ['vers-domicile', 'vers-dillendapp'],
    })
    if (apresMidi) {
      ajouter('navette-dillendapp-retour', {
        depuis: dillendapp,
        vers: ecole,
        periodes: ['apres-midi'],
        directions: ['vers-ecole'],
      })
    }
  }

  // 4. Le soir. Trois cas, selon que l'enfant rentre, reste à la maison relais, ou
  //    n'a tout simplement pas de bus ce jour-là.
  if (apresMidi) {
    if (prendRetour) {
      if (finDillendapp) {
        // L'enfant reste au Dillendapp après la classe : le bus du soir l'y dépose.
        // Le parent ne l'attend donc pas à son arrêt, il vient le chercher sur place.
        ajouter('retour-soir-dillendapp', {
          depuis: ecole,
          vers: dillendapp,
          periodes: ['soir'],
          directions: ['vers-domicile'],
          concerneParent: true,
        })
      } else {
        ajouter('retour-soir', {
          depuis: ecole,
          vers: domicile,
          periodes: ['soir'],
          directions: ['vers-domicile'],
        })
      }
    }
  } else if (repas === 'dillendapp' && prendRetour && !finDillendapp) {
    // Pas de cours l'après-midi, et les retours de fin de journée ne circulent pas ces
    // jours-là — confirmé auprès de la commune. Un enfant resté à la maison relais
    // doit donc être récupéré sur place : ce n'est pas une incertitude du plan, c'est
    // une absence de desserte, et le parent doit le savoir clairement.
    manquants.push('retour-soir')
  }

  trajets.sort((a, b) => {
    const ha = enMinutes(a.depart.heure)
    const hb = enMinutes(b.depart.heure)
    if (ha === null) return 1
    if (hb === null) return -1
    return ha - hb
  })

  return {
    jour,
    trajets,
    manquants,
    incertitudes,
    // Dès que le parent a indiqué une heure de fin de présence, l'absence de bus
    // n'est plus un manque : c'est lui qui vient chercher l'enfant, et l'application
    // le rappelle au lieu de l'alerter.
    ...(finDillendapp ? { recuperation: { lieu: 'dillendapp' as const, heure: finDillendapp } } : {}),
  }
}

/** La semaine complète d'un enfant. */
export function semaineEnfant(ctx: ContexteEnfant): JourneeEnfant[] {
  return JOURS.map((jour) => trajetsDuJour(ctx, jour))
}
