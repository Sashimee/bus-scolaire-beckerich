/**
 * La journée d'un enfant en trois moments, tels qu'un parent la raconte.
 *
 * Le stockage décrit un enfant par champs indépendants : `bus`, `repas`,
 * `dillendappDepuis`, `dillendappJusqua`, `adresses`. Un parent, lui, ne raconte pas
 * des champs, il raconte une journée — le matin il part comment, le midi il mange où,
 * le soir qui le récupère. Les deux ne se recouvrent pas : « je le dépose à la maison
 * relais » touche à la fois l'usage du bus, une heure de présence et l'adresse de
 * départ, trois réglages que l'écran demandait autrefois séparément sans jamais dire
 * qu'ils décrivaient la même chose.
 *
 * Ce module fait la traduction dans les deux sens, et c'est le seul endroit où elle se
 * fait. Les écrans posent une question et écrivent une réponse ; ils ne composent plus
 * eux-mêmes trois réglages pour exprimer une situation.
 */
import {
  bornesDillendapp,
  coursApresMidi,
  deduireInscriptions,
  type BorneHeure,
  type ContexteEnfant,
} from './plan'
import { maisonRelais } from './donnees'
import type { Enfant, Jour, RepasMidi, SensAdresse, UsageBus } from './types'
import { JOURS } from './types'

/** Comment l'enfant arrive à l'école. */
export type ChoixMatin = 'bus' | 'voiture' | 'relais'
/** Où il déjeune, les jours où il y a cours l'après-midi. */
export type ChoixMidi = 'maison' | 'relais'
/** Ce qu'il advient de lui une fois la classe finie. */
export type ChoixSoir = 'bus' | 'voiture' | 'relais'

export const CHOIX_MATIN: readonly ChoixMatin[] = ['bus', 'voiture', 'relais']
export const CHOIX_MIDI: readonly ChoixMidi[] = ['maison', 'relais']
export const CHOIX_SOIR: readonly ChoixSoir[] = ['bus', 'voiture', 'relais']

/** Les trois moments, dans l'ordre où ils se vivent. */
export type Moment = 'matin' | 'midi' | 'soir'
export const MOMENTS: readonly Moment[] = ['matin', 'midi', 'soir']

/**
 * Les jours où la question du déjeuner se pose.
 *
 * Les autres, la classe s'arrête à 11:45 : le repas de midi n'est plus une étape de la
 * journée d'école mais sa fin, et c'est la question du soir qui le règle. Poser les
 * deux ferait répondre deux fois à la même chose, avec le risque de se contredire.
 */
export const JOURS_MIDI: readonly Jour[] = JOURS.filter(coursApresMidi)

/* ------------------------------------------------------------------ lecture */

function usageDuJour(enfant: Enfant, jour: Jour): UsageBus {
  return enfant.bus?.[jour] ?? 'aller-retour'
}

function prendLeBus(usage: UsageBus): { aller: boolean; retour: boolean } {
  return {
    aller: usage === 'aller-retour' || usage === 'aller',
    retour: usage === 'aller-retour' || usage === 'retour',
  }
}

function usageDepuis(aller: boolean, retour: boolean): UsageBus {
  if (aller && retour) return 'aller-retour'
  if (aller) return 'aller'
  if (retour) return 'retour'
  return 'aucun'
}

/** L'heure de dépose à la maison relais, ou `null` si le parent ne dépose pas ce jour-là. */
export function heureMatin(enfant: Enfant, jour: Jour): string | null {
  if (!deduireInscriptions(enfant).horsMidi) return null
  return enfant.dillendappDepuis?.[jour] ?? null
}

/**
 * L'heure à laquelle le parent vient chercher l'enfant, ou `null`.
 *
 * Même garde que `trajetsDuJour` : un jour sans cours l'après-midi, rester à la maison
 * relais suppose d'y avoir déjeuné. Sans cette condition, l'écran afficherait une
 * présence dont le moteur ne tiendrait aucun compte.
 */
export function heureSoir(enfant: Enfant, jour: Jour): string | null {
  const { midi, horsMidi } = deduireInscriptions(enfant)
  if (!horsMidi) return null
  const repas = midi ? enfant.repas[jour] : 'maison'
  if (!coursApresMidi(jour) && repas !== 'dillendapp') return null
  return enfant.dillendappJusqua?.[jour] ?? null
}

export function matinDuJour(enfant: Enfant, jour: Jour): ChoixMatin {
  if (heureMatin(enfant, jour)) return 'relais'
  return prendLeBus(usageDuJour(enfant, jour)).aller ? 'bus' : 'voiture'
}

export function midiDuJour(enfant: Enfant, jour: Jour): ChoixMidi {
  const { midi } = deduireInscriptions(enfant)
  return midi && enfant.repas[jour] === 'dillendapp' ? 'relais' : 'maison'
}

export function soirDuJour(enfant: Enfant, jour: Jour): ChoixSoir {
  if (heureSoir(enfant, jour)) return 'relais'
  return prendLeBus(usageDuJour(enfant, jour)).retour ? 'bus' : 'voiture'
}

/** Les trois réponses d'un jour, telles qu'un récapitulatif les montre. */
export interface JourneeReglee {
  jour: Jour
  matin: ChoixMatin
  /** `null` les jours sans cours l'après-midi : la question ne s'y pose pas. */
  midi: ChoixMidi | null
  soir: ChoixSoir
  heureMatin: string | null
  heureSoir: string | null
  /** Adresses dérogatoires déclarées ce jour-là, par moment. */
  adresses: Partial<Record<SensAdresse, string>>
}

/** Toute la semaine, lue comme le parent l'a décrite. */
export function semaineReglee(enfant: Enfant): JourneeReglee[] {
  return JOURS.map((jour) => {
    const duJour = enfant.adresses?.[jour]
    const adresses: Partial<Record<SensAdresse, string>> = {}
    if (duJour?.matin) adresses.matin = duJour.matin.libelle
    if (duJour?.midi) adresses.midi = duJour.midi.libelle
    if (duJour?.soir) adresses.soir = duJour.soir.libelle
    return {
      jour,
      matin: matinDuJour(enfant, jour),
      midi: coursApresMidi(jour) ? midiDuJour(enfant, jour) : null,
      soir: soirDuJour(enfant, jour),
      heureMatin: heureMatin(enfant, jour),
      heureSoir: heureSoir(enfant, jour),
      adresses,
    }
  })
}

/**
 * La réponse commune à tous les jours, ou `null` si elle change d'un jour à l'autre.
 *
 * C'est ce qui décide de la forme de la question à l'écran : une réponse unique tant
 * que la semaine est régulière — le cas de la quasi-totalité des familles — et la
 * grille des cinq jours seulement quand elle ne l'est pas.
 */
export function reponseUniforme<T>(valeurs: readonly T[]): T | null {
  if (!valeurs.length) return null
  return valeurs.every((v) => v === valeurs[0]) ? valeurs[0] : null
}

/* ------------------------------------------------------------------ bornes */

/**
 * Bornes de repli quand aucun contexte n'est disponible — l'adresse du foyer n'est pas
 * encore saisie. On s'en tient alors à l'amplitude de la maison relais, sans rien
 * affirmer sur le plan de bus du cycle.
 */
function repli(): { depuis: BorneHeure; jusqua: BorneHeure } {
  const { ouverture, fermeture } = maisonRelais.horaires
  return {
    depuis: { min: ouverture, max: fermeture, defaut: ouverture },
    jusqua: { min: ouverture, max: fermeture, defaut: fermeture },
  }
}

/** Heures de dépose possibles ce matin-là. `null` : aucune présence n'y est possible. */
export function borneMatin(ctx: ContexteEnfant | null, jour: Jour): BorneHeure | null {
  return ctx ? bornesDillendapp(ctx, jour).depuis : repli().depuis
}

/** Heures de récupération possibles ce jour-là. `null` : la maison relais est hors jeu. */
export function borneSoir(ctx: ContexteEnfant | null, jour: Jour): BorneHeure | null {
  return ctx ? bornesDillendapp(ctx, jour).jusqua : repli().jusqua
}

/**
 * Les réponses proposables un jour donné.
 *
 * La maison relais disparaît des choix quand le plan du cycle ne permet plus d'y être :
 * plus aucune navette ne conduit en classe après la dépose, ou la fermeture tombe avant
 * l'arrivée du bus. Proposer l'option quand même reviendrait à faire décrire au parent
 * une journée qui n'existe pas.
 */
export function optionsMatin(ctx: ContexteEnfant | null, jour: Jour): ChoixMatin[] {
  return borneMatin(ctx, jour) ? [...CHOIX_MATIN] : ['bus', 'voiture']
}

export function optionsSoir(ctx: ContexteEnfant | null, jour: Jour): ChoixSoir[] {
  return borneSoir(ctx, jour) ? [...CHOIX_SOIR] : ['bus', 'voiture']
}

/* ------------------------------------------------------------------ écriture */

/**
 * Retire une adresse dérogatoire devenue contradictoire.
 *
 * Deux réglages ne doivent jamais se contredire dans le stockage : un enfant déposé à
 * la maison relais le lundi matin ne part de nulle part ailleurs ce matin-là.
 * L'interface le cache déjà ; encore faut-il que la donnée disparaisse, sinon elle
 * ressort au prochain changement de réponse — ou pire, dans un lien de partage.
 */
export function sansAdresseJour(e: Enfant, jour: Jour, sens: SensAdresse): Enfant {
  const duJour = e.adresses?.[jour]
  if (!duJour?.[sens]) return e
  const restant = { ...duJour, [sens]: null }
  const adresses = { ...e.adresses }
  if (restant.matin || restant.midi || restant.soir) adresses[jour] = restant
  else delete adresses[jour]
  return { ...e, adresses }
}

/**
 * Réaligne les deux drapeaux d'inscription sur ce que le parent a réellement décrit.
 *
 * Ils étaient autrefois deux cases à cocher, posées avant les questions qu'elles
 * commandaient — un parent pouvait donc être « inscrit au Dillendapp » sans y déjeuner
 * un seul jour. Ils ne sont plus saisis : ils se déduisent, et restent enregistrés
 * parce que `deduireInscriptions` et les liens de partage les lisent.
 */
function avecInscriptions(e: Enfant): Enfant {
  return {
    ...e,
    periscolaireMidi: JOURS.some((j) => e.repas[j] === 'dillendapp'),
    periscolaireHorsMidi: JOURS.some(
      (j) => Boolean(e.dillendappDepuis?.[j]) || Boolean(e.dillendappJusqua?.[j]),
    ),
  }
}

function avecSensBus(e: Enfant, jour: Jour, sens: 'aller' | 'retour', prend: boolean): Enfant {
  const actuel = prendLeBus(usageDuJour(e, jour))
  const usage = usageDepuis(
    sens === 'aller' ? prend : actuel.aller,
    sens === 'retour' ? prend : actuel.retour,
  )
  const bus = Object.fromEntries(JOURS.map((j) => [j, usageDuJour(e, j)])) as Record<Jour, UsageBus>
  return { ...e, bus: { ...bus, [jour]: usage } }
}

function avecHeure(
  e: Enfant,
  champ: 'dillendappDepuis' | 'dillendappJusqua',
  jour: Jour,
  heure: string | null,
): Enfant {
  const table = Object.fromEntries(JOURS.map((j) => [j, e[champ]?.[j] ?? null])) as Record<
    Jour,
    string | null
  >
  return { ...e, [champ]: { ...table, [jour]: heure } }
}

/**
 * Écrit la réponse du matin sur les jours demandés.
 *
 * `relais` conserve l'heure déjà saisie s'il y en a une : changer d'avis sur un autre
 * jour ne doit pas effacer celle-ci. À défaut, on prend l'heure la plus tôt possible —
 * l'ouverture de la maison relais — plutôt que de laisser une présence sans heure, que
 * le moteur ignorerait en silence.
 */
export function avecMatin(
  enfant: Enfant,
  jours: readonly Jour[],
  choix: ChoixMatin,
  ctx: ContexteEnfant | null,
): Enfant {
  let e = enfant
  for (const jour of jours) {
    if (choix === 'relais') {
      const heure =
        e.dillendappDepuis?.[jour] ??
        borneMatin(ctx, jour)?.defaut ??
        maisonRelais.horaires.ouverture
      e = avecHeure(e, 'dillendappDepuis', jour, heure)
      // Le parent dépose lui-même : aucun bus ne part de chez lui ce matin-là, et il
      // n'y a plus d'adresse de départ à déclarer.
      e = avecSensBus(e, jour, 'aller', false)
      e = sansAdresseJour(e, jour, 'matin')
    } else {
      e = avecHeure(e, 'dillendappDepuis', jour, null)
      e = avecSensBus(e, jour, 'aller', choix === 'bus')
    }
  }
  return avecInscriptions(e)
}

/**
 * Écrit la réponse du midi. N'agit que sur les jours où il y a cours l'après-midi :
 * les autres, c'est la réponse du soir qui décide du repas, et deux écritures
 * concurrentes finiraient par se contredire.
 */
export function avecMidi(enfant: Enfant, jours: readonly Jour[], choix: ChoixMidi): Enfant {
  let e = enfant
  for (const jour of jours) {
    if (!coursApresMidi(jour)) continue
    const repas: RepasMidi = choix === 'relais' ? 'dillendapp' : 'maison'
    e = { ...e, repas: { ...e.repas, [jour]: repas } }
    // Déjeuner au Dillendapp, c'est déjeuner au Dillendapp : l'adresse de midi n'a
    // plus de destinataire.
    if (choix === 'relais') e = sansAdresseJour(e, jour, 'midi')
  }
  return avecInscriptions(e)
}

/**
 * Écrit la réponse du soir.
 *
 * Les jours sans cours l'après-midi, la classe s'arrête à 11:45 : rester à la maison
 * relais suppose d'y déjeuner, et repartir suppose de ne pas y déjeuner. C'est donc
 * cette réponse-là qui règle aussi le repas ces jours-là — le parent n'a pas à faire
 * le rapprochement lui-même, et ne peut pas décrire une journée impossible.
 */
export function avecSoir(
  enfant: Enfant,
  jours: readonly Jour[],
  choix: ChoixSoir,
  ctx: ContexteEnfant | null,
): Enfant {
  let e = enfant
  for (const jour of jours) {
    const apresMidi = coursApresMidi(jour)
    if (choix === 'relais') {
      if (!apresMidi) {
        e = { ...e, repas: { ...e.repas, [jour]: 'dillendapp' } }
        e = sansAdresseJour(e, jour, 'midi')
      }
      const heure =
        e.dillendappJusqua?.[jour] ??
        borneSoir(ctx, jour)?.defaut ??
        maisonRelais.horaires.fermeture
      e = avecHeure(e, 'dillendappJusqua', jour, heure)
      // Le bus du soir conduit l'enfant de l'école à la maison relais : c'est bien un
      // retour en bus, même s'il ne le ramène pas chez lui.
      e = avecSensBus(e, jour, 'retour', true)
      e = sansAdresseJour(e, jour, 'soir')
    } else {
      if (!apresMidi) e = { ...e, repas: { ...e.repas, [jour]: 'maison' } }
      e = avecHeure(e, 'dillendappJusqua', jour, null)
      e = avecSensBus(e, jour, 'retour', choix === 'bus')
    }
  }
  return avecInscriptions(e)
}

/** Déplace l'heure de dépose, sans toucher au reste de la réponse du matin. */
export function avecHeureMatin(
  enfant: Enfant,
  jours: readonly Jour[],
  heure: string,
): Enfant {
  let e = enfant
  for (const jour of jours) {
    if (!e.dillendappDepuis?.[jour]) continue
    e = avecHeure(e, 'dillendappDepuis', jour, heure)
  }
  return e
}

/** Déplace l'heure de récupération, sans toucher au reste de la réponse du soir. */
export function avecHeureSoir(enfant: Enfant, jours: readonly Jour[], heure: string): Enfant {
  let e = enfant
  for (const jour of jours) {
    if (!e.dillendappJusqua?.[jour]) continue
    e = avecHeure(e, 'dillendappJusqua', jour, heure)
  }
  return e
}

/**
 * Un moment peut-il recevoir une adresse dérogatoire ce jour-là ?
 *
 * Un moment que la maison relais occupe déjà ne se règle pas : l'enfant y est, il ne
 * part ni n'arrive de nulle part ailleurs. Laisser le champ ouvert reviendrait à
 * proposer deux réponses inconciliables à la même question.
 */
export function adresseProposable(enfant: Enfant, jour: Jour, sens: SensAdresse): boolean {
  if (sens === 'matin') return matinDuJour(enfant, jour) === 'bus'
  if (sens === 'soir') return soirDuJour(enfant, jour) === 'bus'
  // Le déjeuner ailleurs ne se pose que les jours avec cours l'après-midi — sinon le
  // retour de midi est le retour de la journée, réglé par le soir — et à condition que
  // l'enfant ne mange pas au Dillendapp.
  return coursApresMidi(jour) && midiDuJour(enfant, jour) === 'maison'
}
