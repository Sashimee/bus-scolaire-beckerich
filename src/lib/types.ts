/**
 * Modèle de domaine du bus scolaire de Beckerich.
 *
 * Le vocabulaire est volontairement celui du plan officiel (cycles, aller/retour,
 * Dillendapp) pour qu'un parent qui compare l'application au PDF s'y retrouve.
 */

/** Cycles de l'enseignement fondamental, tels que nommés par la commune. */
export type Cycle = 'precoce' | 'c1' | 'c2' | 'c3' | 'c4'

/** Jours de classe. L'école fondamentale ne fonctionne pas le week-end. */
export type Jour = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi'

export const JOURS: readonly Jour[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']

/**
 * Où l'enfant déjeune un jour donné. Réglable jour par jour, et non une fois pour
 * toutes : c'est ce choix qui détermine s'il fait deux ou quatre trajets.
 */
export type RepasMidi = 'maison' | 'dillendapp'

/** Moment de la journée auquel un service circule. */
export type Periode = 'matin' | 'midi' | 'apres-midi' | 'soir'

/** Fonction réelle d'une ligne, indépendamment de son nom officiel. */
export type Direction = 'vers-ecole' | 'vers-domicile' | 'vers-dillendapp'

/** Fiabilité d'une coordonnée, affichée telle quelle dans l'application. */
export type Precision = 'verifiee' | 'approximative'

/** Latitude, longitude en WGS84. */
export type Coord = readonly [number, number]

export interface Arret {
  id: string
  village: string
  /** Nom générique traduisible (« ecole », « gare », « pont », « village »). */
  lieuCle?: string
  /** Nom propre, jamais traduit (« Kneppchen », « Fräiheetsbam »). */
  lieuNom?: string
  aliases?: string[]
  coord: Coord
  precision: Precision
  source: string
}

export interface ArretDesservi {
  arret: string
  /** `null` quand le plan officiel ne publie pas d'heure pour cet arrêt. */
  heure: string | null
  notes?: string[]
  /**
   * `false` quand la ligne figure l'arrêt sans le desservir — le plan y renvoie
   * simplement vers une autre ligne. C'est le cas de Huttange sur l'Aller 2.
   */
  desservi?: boolean
  /**
   * Restriction propre à cet arrêt, plus étroite que celle de la ligne. Le départ de
   * 07:25 à Huttange sur l'Aller 1 n'est ouvert qu'aux cycles 3, par exemple.
   */
  reserve?: Reserve
}

export interface Service {
  id: string
  periode: Periode
  jours: Jour[]
  arrets: ArretDesservi[]
  /** `false` quand le plan ne détaille pas tous les horaires de la course. */
  horaireComplet?: boolean
  /** Identifiant d'une incertitude déclarée dans le plan. */
  incertitude?: string
}

export interface Reserve {
  cycles?: Cycle[]
  /** La ligne n'est ouverte qu'aux enfants inscrits au Dillendapp. */
  conditionDillendapp?: boolean
  /** Villages dont les enfants sont admis quel que soit leur cycle. */
  villagesAussiAdmis?: string[]
}

export interface Ligne {
  id: string
  nom: string
  direction: Direction
  dessert?: string[]
  reserve?: Reserve
  services: Service[]
}

export interface Incertitude {
  id: string
  portee: string
  question: string
  hypothese: string
  aVerifierAupres: string
}

export interface DemiJournee {
  debut: string
  fin: string
  jours: Jour[]
}

export interface Plan {
  anneeScolaire: string
  anneesCouvertes: string[]
  valideDu: string
  valideAu: string
  source: {
    document: string
    url: string
    pdf: string
    dateReleve: string
    confirmePar?: string
    confirmeLe?: string
    confirmationOrale?: boolean
    noteConfirmation?: string
  }
  horairesEcole: { matin: DemiJournee; apresMidi: DemiJournee }
  incertitudes: Incertitude[]
  lignes: Ligne[]
}

export interface SiteScolaire {
  id: string
  nom: string
  adresse: string
  codePostal: string
  localite: string
  coord: Coord
  precision: Precision
}

export interface CycleScolaire {
  id: Cycle
  ordre: number
  site: string
  arretEcole: string
}

/** Un enfant tel que le parent le décrit. */
export interface Enfant {
  id: string
  prenom: string
  cycle: Cycle
  /** Le repas de midi, jour par jour. */
  repas: Record<Jour, RepasMidi>
}

export interface Adresse {
  libelle: string
  localite: string
  coord: Coord
}

/** L'ensemble de la configuration d'une famille. Reste sur l'appareil. */
export interface Foyer {
  adresse: Adresse | null
  enfants: Enfant[]
}

/** Les quatre trajets possibles d'une journée, plus les navettes Dillendapp. */
export type TypeTrajet =
  | 'aller-matin'
  | 'retour-midi'
  | 'aller-apres-midi'
  | 'retour-soir'
  | 'navette-dillendapp-midi'
  | 'navette-dillendapp-retour'

export interface Etape {
  arret: Arret
  heure: string | null
}

/** Un déplacement concret, prêt à être affiché ou exporté vers un calendrier. */
export interface Trajet {
  type: TypeTrajet
  ligne: Ligne
  serviceId: string
  depart: Etape
  arrivee: Etape
  /** Identifiants de notes du plan (traduites via i18n). */
  notes: string[]
  /** Identifiant d'incertitude, si ce trajet repose sur une hypothèse. */
  incertitude?: string
  /**
   * Vrai quand le trajet part ou arrive à l'arrêt du domicile — donc quand le parent
   * doit accompagner ou attendre l'enfant. Les navettes école ↔ Dillendapp sont
   * internes à la journée d'école et ne le concernent pas directement.
   */
  concerneParent: boolean
  /** Autres lignes qui assurent le même déplacement ce jour-là. */
  alternatives: { ligne: Ligne; heureDepart: string | null }[]
}

/** Ce que l'application sait d'une journée pour un enfant donné. */
export interface JourneeEnfant {
  jour: Jour
  trajets: Trajet[]
  /** Déplacements attendus qu'aucune ligne du plan ne couvre. */
  manquants: TypeTrajet[]
}
