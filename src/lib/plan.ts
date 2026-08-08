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
  Reserve,
  SensAdresse,
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

/** L'inverse : 445 → « 07:25 ». Borné à la journée, sans débordement. */
export function enHeure(minutes: number): string {
  const borne = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${String(Math.floor(borne / 60)).padStart(2, '0')}:${String(borne % 60).padStart(2, '0')}`
}

/**
 * Les deux inscriptions au périscolaire, déduites quand elles ne sont pas enregistrées.
 *
 * Une seule case commandait autrefois le repas et la présence. Les configurations
 * enregistrées avant la séparation, et les liens de partage antérieurs, ne portent que
 * cette case — voire rien du tout. On retombe alors sur ce que le parent a réellement
 * saisi, faute de quoi une famille inscrite verrait sa configuration s'évaporer à la
 * mise à jour.
 */
export function deduireInscriptions(enfant: Enfant): { midi: boolean; horsMidi: boolean } {
  const heuresSaisies = JOURS.some(
    (j) => enfant.dillendappDepuis?.[j] || enfant.dillendappJusqua?.[j],
  )
  const repasAuDillendapp = JOURS.some((j) => enfant.repas[j] === 'dillendapp')
  return {
    midi: enfant.periscolaireMidi ?? enfant.periscolaire ?? repasAuDillendapp,
    horsMidi:
      enfant.periscolaireHorsMidi ?? ((enfant.periscolaire ?? repasAuDillendapp) && heuresSaisies),
  }
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
 *
 * `inscritDillendapp` dit que l'enfant fréquente la maison relais ce jour-là, à quelque
 * moment que ce soit. Ce n'est pas la même chose que « déjeune au Dillendapp » : depuis
 * que la présence du matin et celle du soir sont indépendantes du repas, un enfant peut
 * rentrer manger chez lui et rejoindre la maison relais après la classe. Les dessertes
 * réservées aux inscrits doivent lui rester ouvertes.
 */
function reserveSatisfaite(
  r: Reserve | undefined,
  enfant: Enfant,
  villageDomicile: string,
  inscritDillendapp: boolean,
): boolean {
  if (!r) return true

  // Certains villages sont admis quel que soit le cycle : c'est le cas de Huttange,
  // dont les enfants n'ont pas d'autre desserte à ces heures-là.
  const village = villageDomicile.toLowerCase()
  if (r.villagesAussiAdmis?.some((v) => v.toLowerCase() === village)) return true

  if (r.cycles && !r.cycles.includes(enfant.cycle)) return false
  if (r.conditionDillendapp && !inscritDillendapp) return false
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
  /** L'enfant fréquente-t-il la maison relais ce jour-là, à un moment quelconque ? */
  inscritDillendapp: boolean
  /** Ne retenir que les courses qui partent à cette heure ou après. */
  apres?: string | null
}

/** Toutes les liaisons possibles pour un déplacement donné, triées par heure de départ. */
function liaisons(o: RechercheOptions): Liaison[] {
  const trouvees: Liaison[] = []

  // Un arrêt n'est empruntable que s'il est réellement desservi et que sa restriction
  // propre est satisfaite : le plan liste par exemple Huttange sur l'Aller 2 sans le
  // desservir, et n'ouvre le départ de 07:25 sur l'Aller 1 qu'aux cycles 3.
  const utilisable = (a: ArretDesservi) =>
    a.desservi !== false &&
    reserveSatisfaite(a.reserve, o.enfant, o.villageDomicile, o.inscritDillendapp)

  for (const ligne of plan.lignes) {
    if (!o.directions.includes(ligne.direction)) continue
    if (!reserveSatisfaite(ligne.reserve, o.enfant, o.villageDomicile, o.inscritDillendapp))
      continue

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

  // Une course déjà partie quand l'enfant arrive ne lui sert à rien. Les heures non
  // publiées échappent au filtre : on ne peut rien en dire, et les écarter reviendrait
  // à affirmer que la course ne convient pas.
  const seuil = enMinutes(o.apres ?? null)
  const retenues =
    seuil === null
      ? trouvees
      : trouvees.filter((l) => {
          const h = enMinutes(l.depart.heure)
          return h === null || h >= seuil
        })

  // Tri par heure de départ. Les courses sans heure publiée passent en dernier :
  // elles sont utilisables mais moins informatives pour le parent.
  return retenues.sort((x, y) => {
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

/** De quel côté du trajet on cherche l'arrêt : celui du départ, ou celui du retour. */
export type SensArret = 'depart' | 'arrivee'

/** Les arrêts d'un jour : au départ, à la coupure de midi, et au retour du soir. */
export interface ArretsDuJour {
  matin: ArretProche | null
  /** Où l'enfant déjeune quand il ne rentre pas chez lui. Ne sert que les jours où il
   *  y a cours l'après-midi : sinon le retour de midi est le retour de la journée. */
  midi: ArretProche | null
  soir: ArretProche | null
}

export interface ContexteEnfant {
  enfant: Enfant
  arretDomicile: Arret
  arretEcole: Arret
  distance: number
  temps: number
  /** L'école est l'arrêt le plus proche : l'enfant peut y aller à pied. */
  marcheDirecte: boolean
  /**
   * L'arrêt réellement utilisé chaque jour, dans chaque sens. Il ne diffère du
   * domicile que les jours où le parent a déclaré une adresse dérogatoire.
   */
  arretsParJour: Record<Jour, ArretsDuJour>
}

/**
 * Le plus proche arrêt réellement utile depuis (ou vers) un point donné.
 *
 * Ce n'est pas simplement l'arrêt le plus proche : encore faut-il qu'une ligne y passe
 * DANS LE BON SENS vers l'école de son cycle. Un enfant d'Hovelange scolarisé à
 * Noerdange ne peut pas prendre l'Aller 1, qui dessert Noerdange avant Hovelange ;
 * il lui faut l'Aller 2.
 *
 * Le sens compte : un arrêt desservi le matin vers l'école ne l'est pas forcément au
 * retour. Chercher l'arrêt d'une adresse de retour avec le critère du matin donnerait
 * un arrêt où aucun bus ne dépose jamais l'enfant.
 */
export function arretUtile(coord: Coord, enfant: Enfant, sens: SensArret): ArretProche | null {
  const arretEcole = arretEcoleDuCycle(enfant.cycle)
  const proches = arretsProches(coord)
  if (!proches.length) return null

  // L'école est l'arrêt le plus proche : l'enfant y va à pied, aucune ligne à trouver.
  if (proches[0].arret.id === arretEcole.id) return proches[0]

  const ecole = arretsEquivalents(arretEcole.id)

  for (const p of proches) {
    if (p.arret.id === arretEcole.id) continue
    const utile = JOURS.some(
      (jour) =>
        liaisons({
          jour,
          depuis: sens === 'depart' ? [p.arret.id] : ecole,
          vers: sens === 'depart' ? ecole : [p.arret.id],
          periodes: sens === 'depart' ? ['matin'] : ['midi', 'soir'],
          directions: sens === 'depart' ? ['vers-ecole'] : ['vers-domicile'],
          enfant,
          villageDomicile: p.arret.village,
          inscritDillendapp: enfant.repas[jour] === 'dillendapp',
        }).length > 0,
    )
    if (utile) return p
  }
  return null
}

/**
 * Tout ce qu'il faut savoir pour calculer la semaine d'un enfant.
 *
 * `arretDomicile`, `distance` et `temps` décrivent le cas courant — le domicile du
 * foyer — et restent la valeur affichée en tête de fiche. `arretsParJour` porte le
 * détail, jour par jour et sens par sens.
 */
export function contexteEnfant(enfant: Enfant, adresse: Adresse): ContexteEnfant | null {
  const arretEcole = arretEcoleDuCycle(enfant.cycle)
  const proches = arretsProches(adresse.coord)
  if (!proches.length) return null

  const marcheDirecte = proches[0].arret.id === arretEcole.id
  const domicileMatin = arretUtile(adresse.coord, enfant, 'depart')
  if (!domicileMatin) return null
  // Faute d'arrêt de dépose identifié, on s'en tient à celui du matin plutôt que de
  // priver l'enfant de tout retour : c'est le comportement d'avant les adresses par
  // jour, et le cas ne se présente sur aucun village de la commune.
  const domicileSoir = arretUtile(adresse.coord, enfant, 'arrivee') ?? domicileMatin

  const arretDuSens = (a: Adresse | null | undefined, sens: SensArret, defaut: ArretProche) =>
    a ? arretUtile(a.coord, enfant, sens) : defaut

  const arretsParJour = Object.fromEntries(
    JOURS.map((jour) => [
      jour,
      {
        matin: arretDuSens(enfant.adresses?.[jour]?.matin, 'depart', domicileMatin),
        // Le midi retombe sur le DOMICILE, pas sur l'adresse du soir : « revient le
        // soir chez la nounou » ne dit rien de l'endroit où l'enfant déjeune.
        midi: arretDuSens(enfant.adresses?.[jour]?.midi, 'arrivee', domicileSoir),
        soir: arretDuSens(enfant.adresses?.[jour]?.soir, 'arrivee', domicileSoir),
      },
    ]),
  ) as Record<Jour, ArretsDuJour>

  return {
    enfant,
    arretDomicile: domicileMatin.arret,
    arretEcole,
    distance: domicileMatin.distance,
    temps: domicileMatin.temps,
    marcheDirecte,
    arretsParJour,
  }
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
  const { enfant, arretEcole } = ctx
  const apresMidi = coursApresMidi(jour)

  // Deux inscriptions distinctes : déjeuner au Dillendapp, et y être avant ou après la
  // classe. Sans elles, toute la mécanique disparaît — c'est le cas de la majorité des
  // familles. Elles sont absentes des configurations antérieures, d'où la déduction.
  const { midi: periscolaireMidi, horsMidi: periscolaireHorsMidi } = deduireInscriptions(enfant)
  const repas = periscolaireMidi ? enfant.repas[jour] : 'maison'

  // Une famille peut n'utiliser le bus qu'à moitié : déposer l'enfant en voiture le
  // matin et le laisser rentrer en bus, ou l'inverse. On ne propose alors que les
  // trajets réellement empruntés — et on ne signale surtout pas comme « non couvert »
  // un retour que le parent assure lui-même.
  const usage = enfant.bus?.[jour] ?? 'aller-retour'
  const prendAller = usage === 'aller-retour' || usage === 'aller'
  const prendRetour = usage === 'aller-retour' || usage === 'retour'

  // Présence à la maison relais AVANT la classe : c'est le parent qui dépose, donc
  // aucun bus depuis le domicile ce matin-là.
  const debutDillendapp = periscolaireHorsMidi ? (enfant.dillendappDepuis?.[jour] ?? null) : null

  // Heure de fin de présence à la maison relais. Elle change la destination du soir :
  // l'enfant retourne bien en classe l'après-midi — l'école est obligatoire — mais le
  // bus du soir le dépose au Dillendapp au lieu de le ramener chez lui.
  //
  // Les jours SANS cours l'après-midi, y rester suppose d'y avoir déjeuné : la classe
  // s'arrête à 11:45 et il n'y a pas d'autre midi possible. Les autres jours, l'enfant
  // peut très bien déjeuner ailleurs puis rejoindre la maison relais après la classe.
  const finDillendapp =
    periscolaireHorsMidi && (apresMidi || repas === 'dillendapp')
      ? (enfant.dillendappJusqua?.[jour] ?? null)
      : null

  // Les trois moments de la journée peuvent être des adresses différentes.
  const arretsJour = ctx.arretsParJour[jour]
  const departDuJour = arretsJour.matin ? [arretsJour.matin.arret.id] : []
  const midiDuJour = arretsJour.midi ? [arretsJour.midi.arret.id] : []
  const arriveeDuJour = arretsJour.soir ? [arretsJour.soir.arret.id] : []
  const derogationMatin = enfant.adresses?.[jour]?.matin ? ('matin' as const) : undefined
  const derogationMidi = enfant.adresses?.[jour]?.midi ? ('midi' as const) : undefined
  const derogationSoir = enfant.adresses?.[jour]?.soir ? ('soir' as const) : undefined

  const ecole = arretsEquivalents(arretEcole.id)
  const dillendapp = arretsEquivalents(maisonRelais.arret)
  // Pour les cycles scolarisés à Beckerich, la maison relais est à 90 m de l'école :
  // le même point d'embarquement. L'enfant y va à pied, il n'y a pas de navette.
  const dillendappAuPiedDeLEcole = dillendapp.includes(arretEcole.id)

  const trajets: Trajet[] = []
  const manquants: TypeTrajet[] = []
  const incertitudes: string[] = []

  if (ctx.marcheDirecte) return { jour, trajets, manquants, incertitudes }

  const base = {
    jour,
    enfant,
    villageDomicile: arretsJour.matin?.arret.village ?? ctx.arretDomicile.village,
    // Une desserte réservée aux inscrits reste ouverte à l'enfant qui n'est au
    // Dillendapp qu'en dehors du midi : c'est la même inscription.
    inscritDillendapp:
      repas === 'dillendapp' || debutDillendapp !== null || finDillendapp !== null,
  }

  const ajouter = (
    type: TypeTrajet,
    o: Omit<
      RechercheOptions,
      'jour' | 'enfant' | 'villageDomicile' | 'inscritDillendapp'
    > & {
      /** Force la visibilité côté parent quand le trajet ne touche pas son arrêt. */
      concerneParent?: boolean
      derogation?: SensAdresse
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
        (departDuJour.includes(principal.depart.arret.id) ||
          arriveeDuJour.includes(principal.arrivee.arret.id)),
      ...(o.derogation ? { adresseDerogatoire: o.derogation } : {}),
      alternatives: reste.map((l) => ({ ligne: l.ligne, heureDepart: l.depart.heure })),
    })
  }

  // 1. Le matin, tout le monde va à l'école — mais pas forcément depuis chez lui.
  if (debutDillendapp) {
    // Le parent dépose l'enfant à la maison relais avant la classe. Il n'y a donc pas
    // de bus depuis le domicile, et ce n'est pas un manque : c'est un choix.
    // Reste à le conduire de la maison relais à sa classe, ce que le plan couvre bien
    // — l'Aller 3 passe au Dillendapp à 07:38 puis à 07:52. Cette desserte-là, on ne
    // l'invente pas : on la cherche, et si elle n'existe pas pour ce cycle, on le dit.
    if (!dillendappAuPiedDeLEcole) {
      ajouter('navette-dillendapp-matin', {
        depuis: dillendapp,
        vers: ecole,
        periodes: ['matin'],
        directions: ['vers-ecole'],
        concerneParent: false,
        // Une course partie avant l'arrivée de l'enfant ne le conduit nulle part :
        // déposé à 07:45, il prend le passage de 07:52, pas celui de 07:38.
        apres: debutDillendapp,
      })
    }
  } else if (prendAller) {
    ajouter('aller-matin', {
      depuis: departDuJour,
      vers: ecole,
      periodes: ['matin'],
      directions: ['vers-ecole'],
      derogation: derogationMatin,
    })
  }

  if (repas === 'maison') {
    // 2. Retour pour déjeuner — chez soi, ou chez qui héberge le repas ce jour-là.
    //    Les jours sans cours l'après-midi, ce retour est celui de la journée : c'est
    //    alors l'adresse du soir qui vaut, et l'adresse de midi n'est pas proposée.
    const versLeRepas = apresMidi ? midiDuJour : arriveeDuJour
    const derogationRepas = apresMidi ? derogationMidi : derogationSoir
    if (prendRetour) {
      ajouter('retour-midi', {
        depuis: ecole,
        vers: versLeRepas,
        periodes: ['midi'],
        directions: ['vers-domicile'],
        derogation: derogationRepas,
      })
    }
    // 3. Retour en classe, uniquement les jours où il y a cours l'après-midi. On
    //    repart d'où l'enfant a déjeuné.
    if (apresMidi && prendAller) {
      ajouter('aller-apres-midi', {
        depuis: versLeRepas,
        vers: ecole,
        periodes: ['apres-midi'],
        directions: ['vers-ecole'],
        derogation: derogationRepas,
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
          vers: arriveeDuJour,
          periodes: ['soir'],
          directions: ['vers-domicile'],
          derogation: derogationSoir,
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

  // Le plan fait arriver les bus de c1 et c2 quelques minutes après l'heure de classe
  // affichée (07:58 à Oberpallen, 08:00 à Noerdange, pour une sonnerie à 07:55). Ce
  // n'est pas un écart à signaler : c'est un transport scolaire, et l'école intègre
  // ces quelques minutes. Le signaler chaque jour à presque toutes les familles de ces
  // deux cycles ferait du bruit, pas de l'information.

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
    // Symétrique de `recuperation` : le parent dépose l'enfant, l'application le
    // rappelle plutôt que de signaler un aller manquant.
    ...(debutDillendapp ? { depose: { lieu: 'dillendapp' as const, heure: debutDillendapp } } : {}),
    // Dès que le parent a indiqué une heure de fin de présence, l'absence de bus
    // n'est plus un manque : c'est lui qui vient chercher l'enfant, et l'application
    // le rappelle au lieu de l'alerter.
    ...(finDillendapp ? { recuperation: { lieu: 'dillendapp' as const, heure: finDillendapp } } : {}),
  }
}

/** Les heures saisissables pour un moment de présence, et celle proposée par défaut. */
export interface BorneHeure {
  min: string
  max: string
  defaut: string
}

/** Ce qu'un parent peut déclarer comme présence au Dillendapp, un jour donné. */
export interface BornesDillendapp {
  /** Arrivée avant la classe. `null` si aucune présence n'est possible ce matin-là. */
  depuis: BorneHeure | null
  /** Départ après la classe. `null` si l'enfant ne peut pas y être ce jour-là. */
  jusqua: BorneHeure | null
}

/**
 * Les bornes d'une présence déclarée au Dillendapp, cycle par cycle et jour par jour.
 *
 * Une heure saisie hors de ces bornes décrit une présence qui n'existe pas : la maison
 * relais est fermée, ou le dernier bus qui conduit l'enfant en classe est déjà parti.
 * Le plafond du matin se lit donc dans le plan de bus du cycle, pas dans une constante :
 * un enfant de Noerdange et un enfant de Beckerich n'ont pas la même dernière minute
 * utile, et le changement de cycle doit tout recalculer.
 */
export function bornesDillendapp(ctx: ContexteEnfant, jour: Jour): BornesDillendapp {
  const { ouverture, fermeture, margeAvantBusMinutes } = maisonRelais.horaires
  const apresMidi = coursApresMidi(jour)

  const ecole = arretsEquivalents(ctx.arretEcole.id)
  const dillendapp = arretsEquivalents(maisonRelais.arret)
  // Maison relais au pied de l'école : aucune navette à attraper, c'est la sonnerie
  // qui fait la limite.
  const auPiedDeLEcole = dillendapp.includes(ctx.arretEcole.id)

  const base = {
    jour,
    enfant: ctx.enfant,
    villageDomicile: ctx.arretDomicile.village,
    inscritDillendapp: true,
  }

  // Matin : la dernière course qui part encore du Dillendapp vers l'école, moins la
  // marge de sécurité. Sans navette, le début des cours joue le même rôle.
  const matinales = auPiedDeLEcole
    ? []
    : liaisons({
        ...base,
        depuis: dillendapp,
        vers: ecole,
        periodes: ['matin'],
        directions: ['vers-ecole'],
      })
  const dernierDepart = matinales.reduce<number | null>((tard, l) => {
    const h = enMinutes(l.depart.heure)
    return h !== null && (tard === null || h > tard) ? h : tard
  }, null)

  const ouvre = enMinutes(ouverture) ?? 0
  const limiteMatin = (dernierDepart ?? enMinutes(plan.horairesEcole.matin.debut) ?? 0) -
    margeAvantBusMinutes
  // Une heure d'arrivée reste une heure d'arrivée : au-delà d'une heure après
  // l'ouverture, ce n'est plus un accueil du matin.
  const maxMatin = Math.min(limiteMatin, ouvre + 60)

  // Soir : l'enfant ne peut pas être récupéré avant d'être arrivé. C'est la course
  // qu'il prend réellement — la première du tri, comme dans `trajetsDuJour`.
  const versLaMaisonRelais = auPiedDeLEcole
    ? []
    : liaisons({
        ...base,
        depuis: ecole,
        vers: dillendapp,
        periodes: [apresMidi ? 'soir' : 'midi'],
        directions: ['vers-domicile', 'vers-dillendapp'],
      })
  const finDesCours = apresMidi ? plan.horairesEcole.apresMidi.fin : plan.horairesEcole.matin.fin
  const arriveeSurPlace =
    enMinutes(versLaMaisonRelais[0]?.arrivee.heure ?? null) ?? enMinutes(finDesCours) ?? 0
  const ferme = enMinutes(fermeture) ?? 24 * 60 - 1

  return {
    depuis:
      maxMatin > ouvre
        ? { min: ouverture, max: enHeure(maxMatin), defaut: ouverture }
        : null,
    jusqua:
      ferme > arriveeSurPlace
        ? {
            min: enHeure(arriveeSurPlace),
            max: fermeture,
            // Le parent qui vient chercher son enfant vient le plus souvent aussitôt
            // possible ; c'est aussi la seule heure dont on sait qu'elle est valable.
            defaut: enHeure(arriveeSurPlace),
          }
        : null,
  }
}

/**
 * Ramène les heures Dillendapp déjà saisies dans les bornes du cycle courant.
 *
 * Appelée au changement de cycle : un enfant qui passe de Noerdange à Beckerich n'a plus
 * la même dernière navette du matin, et une heure devenue impossible doit être corrigée
 * plutôt que laissée à décrire un dépôt que personne n'assurera.
 */
export function ajusterDillendapp(enfant: Enfant, adresse: Adresse): Enfant {
  const ctx = contexteEnfant(enfant, adresse)
  if (!ctx) return enfant

  let modifie = false
  const depuis = { ...enfant.dillendappDepuis } as Record<Jour, string | null>
  const jusqua = { ...enfant.dillendappJusqua } as Record<Jour, string | null>

  const ecreter = (heure: string | null | undefined, borne: BorneHeure | null): string | null => {
    if (!heure) return null
    if (!borne) return null
    const h = enMinutes(heure)
    const min = enMinutes(borne.min)
    const max = enMinutes(borne.max)
    if (h === null || min === null || max === null) return heure
    return enHeure(Math.min(Math.max(h, min), max))
  }

  for (const jour of JOURS) {
    const bornes = bornesDillendapp(ctx, jour)
    const d = ecreter(enfant.dillendappDepuis?.[jour], bornes.depuis)
    const j = ecreter(enfant.dillendappJusqua?.[jour], bornes.jusqua)
    if (d !== (enfant.dillendappDepuis?.[jour] ?? null)) modifie = true
    if (j !== (enfant.dillendappJusqua?.[jour] ?? null)) modifie = true
    depuis[jour] = d
    jusqua[jour] = j
  }

  return modifie ? { ...enfant, dillendappDepuis: depuis, dillendappJusqua: jusqua } : enfant
}

/** La semaine complète d'un enfant. */
export function semaineEnfant(ctx: ContexteEnfant): JourneeEnfant[] {
  return JOURS.map((jour) => trajetsDuJour(ctx, jour))
}
