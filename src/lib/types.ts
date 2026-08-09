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

/**
 * Dans quelle mesure l'enfant utilise le bus un jour donné.
 *
 * Beaucoup de familles ne prennent le bus qu'à moitié : déposé en voiture le matin
 * et repris par le bus, ou l'inverse, ou pas du tout certains jours. Sans ce réglage,
 * l'application afficherait des trajets qui n'ont pas lieu et, pire, signalerait
 * comme « non couvert » un retour que le parent assure lui-même.
 */
export type UsageBus = 'aller-retour' | 'aller' | 'retour' | 'aucun'

export const USAGES_BUS: readonly UsageBus[] = ['aller-retour', 'aller', 'retour', 'aucun']

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

/**
 * Amplitude d'accueil de la maison relais.
 *
 * Elle borne ce qu'un parent peut saisir : hors de ces heures, la présence déclarée
 * décrirait un accueil qui n'existe pas. `margeAvantBusMinutes` est la sécurité
 * retranchée à l'heure du dernier bus utilisable — on ne demande à personne de déposer
 * son enfant à la minute où le bus part.
 */
export interface HorairesMaisonRelais {
  ouverture: string
  fermeture: string
  margeAvantBusMinutes: number
}

/**
 * Un service de transport à la demande, pour le parent qui ne peut pas venir chercher
 * son enfant. Le projet n'en connaît que le nom et l'adresse : ni tarifs, ni délais.
 */
export interface TransportALaDemande {
  nom: string
  url: string
}

export interface MaisonRelais extends SiteScolaire {
  arret: string
  horaires: HorairesMaisonRelais
}

export interface Adresse {
  libelle: string
  localite: string
  coord: Coord
}

/**
 * Une adresse qui remplace le domicile un jour donné, dans un sens donné.
 *
 * Le besoin est banal et le modèle à domicile unique ne le couvrait pas : l'enfant
 * part de chez ses grands-parents le mardi matin, ou rentre chez la nounou le jeudi
 * soir. Les deux sens sont indépendants — le plus souvent, un seul des deux change.
 * Absent ou `null` = domicile du foyer.
 */
export interface AdresseJour {
  /** D'où l'enfant part ce matin-là. */
  matin?: Adresse | null
  /**
   * Où il déjeune ce jour-là, quand ce n'est ni chez lui ni au Dillendapp — chez une
   * tante, chez ses grands-parents. Le bus l'y dépose à midi et l'y reprend pour
   * l'après-midi.
   *
   * Ne vaut que les jours où il y a cours l'après-midi : les autres, le retour de midi
   * est le retour de la journée, et c'est `soir` qui décrit la destination.
   */
  midi?: Adresse | null
  /** Où il est ramené ce soir-là. */
  soir?: Adresse | null
}

/** Les trois moments de la journée auxquels une adresse peut déroger au domicile. */
export type SensAdresse = 'matin' | 'midi' | 'soir'

/** Dans l'ordre chronologique, pour l'affichage comme pour l'encodage des liens. */
export const SENS_ADRESSE: readonly SensAdresse[] = ['matin', 'midi', 'soir'] as const

/** Un enfant tel que le parent le décrit. */
export interface Enfant {
  id: string
  prenom: string
  cycle: Cycle
  /** Le repas de midi, jour par jour. */
  repas: Record<Jour, RepasMidi>
  /** L'usage du bus, jour par jour. Absent sur les données enregistrées avant
   *  l'introduction du réglage : traiter alors comme « aller-retour ». */
  bus?: Record<Jour, UsageBus>
  /**
   * Adresses dérogatoires, par jour et par sens. Absent = domicile du foyer.
   */
  adresses?: Partial<Record<Jour, AdresseJour>>
  /**
   * L'enfant déjeune au Dillendapp, au moins un jour. Commande la grille des repas.
   *
   * Absent sur les données antérieures au réglage : voir `deduireInscriptions`.
   */
  periscolaireMidi?: boolean
  /**
   * L'enfant est au Dillendapp avant la classe ou après l'école. Commande les grilles
   * d'horaires.
   *
   * Distinct du midi, parce que les deux se décident séparément : un enfant peut
   * rentrer déjeuner chez lui et rejoindre la maison relais après la classe.
   */
  periscolaireHorsMidi?: boolean
  /**
   * @deprecated Une seule case commandait le repas ET la présence. Remplacée par
   * `periscolaireMidi` et `periscolaireHorsMidi` ; encore lue à la migration des
   * configurations enregistrées et des liens de partage antérieurs.
   */
  periscolaire?: boolean
  /**
   * Heure à partir de laquelle l'enfant est à la maison relais AVANT la classe, par
   * jour. `null` = pas de présence le matin.
   *
   * Une heure signifie que le parent le dépose lui-même : il n'y a donc pas de bus
   * depuis le domicile ce matin-là. Le trajet maison relais → école, lui, reste
   * calculé sur le plan officiel, qui le publie bien (voir `navette-dillendapp-matin`).
   */
  dillendappDepuis?: Record<Jour, string | null>
  /**
   * Heure à laquelle le parent vient chercher l'enfant au Dillendapp, par jour.
   *
   * `null` signifie que l'enfant repart avec le bus comme les autres. Une heure
   * signifie qu'il RESTE à la maison relais au-delà de la classe : le bus du soir ne
   * le ramène alors pas chez lui, il le dépose au Dillendapp où le parent le récupère.
   * Ne vaut que les jours où le repas de midi est pris au Dillendapp.
   */
  dillendappJusqua?: Record<Jour, string | null>
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
  /** Le bus du soir dépose l'enfant au Dillendapp au lieu de le ramener chez lui. */
  | 'retour-soir-dillendapp'
  /**
   * Maison relais → école, le matin, pour l'enfant déposé au Dillendapp avant la
   * classe. Le plan le publie : l'Aller 3 passe au Dillendapp à 07:38 et à 07:52.
   */
  | 'navette-dillendapp-matin'
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
  /**
   * Le bout de trajet côté famille n'est pas le domicile mais une adresse
   * dérogatoire de ce jour-là. Sans cette mention, un arrêt inhabituel se lit comme
   * une erreur de l'application plutôt que comme le réglage du parent.
   */
  adresseDerogatoire?: SensAdresse
  /** Autres lignes qui assurent le même déplacement ce jour-là. */
  alternatives: { ligne: Ligne; heureDepart: string | null }[]
}

/** Ce que l'application sait d'une journée pour un enfant donné. */
export interface JourneeEnfant {
  jour: Jour
  trajets: Trajet[]
  /** Déplacements attendus qu'aucune ligne du plan ne couvre. */
  manquants: TypeTrajet[]
  /**
   * Incertitudes du plan qui pèsent sur CE jour précisément.
   *
   * On ne les signale que là où elles changent la réponse : avertir un parent le
   * lundi d'une ambiguïté qui ne concerne que le mardi ne fait qu'inquiéter à tort.
   */
  incertitudes: string[]
  /**
   * L'enfant est déposé par ses parents, et non amené par un bus.
   * Renseigné dès que le parent a indiqué une heure de début de présence au Dillendapp.
   */
  depose?: { lieu: 'dillendapp'; heure: string }
  /**
   * L'enfant est à récupérer par ses parents, et non ramené par un bus.
   * Renseigné dès que le parent a indiqué une heure de fin de présence au Dillendapp.
   */
  recuperation?: { lieu: 'dillendapp'; heure: string }
}
