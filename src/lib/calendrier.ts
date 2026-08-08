/**
 * Calendrier scolaire et export vers les agendas.
 *
 * Deux responsabilités : savoir s'il y a école un jour donné, et produire un fichier
 * `.ics` fidèle — c'est-à-dire qui n'annonce pas un bus pendant les vacances.
 */
import { maisonRelais, plan, vacances, type AnneeVacances } from './donnees'
import { semaineEnfant, type ContexteEnfant } from './plan'
import type { Jour, Trajet } from './types'
import { JOURS } from './types'

/** Date locale au format AAAA-MM-JJ, sans décalage de fuseau. */
export function isoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const jj = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${jj}`
}

/**
 * Lit une date « AAAA-MM-JJ » comme une date LOCALE.
 *
 * `new Date('2026-09-15')` serait interprété en UTC : à l'ouest de Greenwich, la
 * rentrée tomberait la veille et tout le calendrier serait décalé d'un jour.
 */
export function depuisIso(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(a, m - 1, j)
}

/** Le jour de classe correspondant à une date, ou `null` le week-end. */
export function jourDeSemaine(d: Date): Jour | null {
  const i = d.getDay()
  return i >= 1 && i <= 5 ? JOURS[i - 1] : null
}

/**
 * L'année scolaire couvrant cette date, si elle est connue.
 *
 * La couverture va au-delà du dernier jour de cours : le congé d'été déborde sur la
 * rentrée suivante, et c'est précisément en août qu'un parent risque d'ouvrir
 * l'application pour préparer la rentrée.
 */
export function anneePour(d: Date): AnneeVacances | null {
  const iso = isoDate(d)
  return (
    vacances.annees.find((a) => {
      const finCouverture = a.vacances.reduce((max, v) => (v.au > max ? v.au : max), a.fin)
      return iso >= a.debut && iso <= finCouverture
    }) ?? null
  )
}

/**
 * L'année scolaire à exporter vers les agendas : celle en cours si elle est
 * complètement renseignée, sinon la prochaine qui l'est. On n'exporte jamais une
 * année partielle, dont les vacances manquantes produiraient des rappels erronés.
 */
export function anneeAExporter(aujourdhui = new Date()): AnneeVacances | null {
  const iso = isoDate(aujourdhui)
  const completes = vacances.annees.filter((a) => !a.partiel)
  return completes.find((a) => iso <= a.fin) ?? completes.at(-1) ?? null
}

/**
 * Les dates du lundi au vendredi de la semaine en cours.
 *
 * Sert à rattacher une perturbation, qui porte une date, à la fiche hebdomadaire d'un
 * enfant, qui raisonne en jours de semaine. Le week-end, on affiche la semaine à venir :
 * un parent qui consulte le samedi prépare le lundi, pas la veille.
 */
export function datesDeLaSemaine(reference = new Date()): Record<Jour, Date> {
  const base = new Date(reference)
  base.setHours(0, 0, 0, 0)
  const jourSemaine = base.getDay()
  const decalageLundi = jourSemaine === 0 ? 1 : jourSemaine === 6 ? 2 : 1 - jourSemaine
  base.setDate(base.getDate() + decalageLundi)

  return Object.fromEntries(
    JOURS.map((j, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      return [j, d]
    }),
  ) as Record<Jour, Date>
}

export type RaisonSansEcole = 'weekend' | 'vacances' | 'ferie' | 'annee-inconnue'

export interface EtatJour {
  ecole: boolean
  raison?: RaisonSansEcole
  /** Identifiant de la période de vacances ou du jour férié, pour l'affichage. */
  id?: string
}

/**
 * Y a-t-il école ce jour-là ?
 *
 * Si la date sort des années scolaires connues, l'application le dit franchement
 * (`annee-inconnue`) plutôt que d'affirmer une réponse qu'elle n'a pas.
 */
export function etatDuJour(d: Date): EtatJour {
  if (!jourDeSemaine(d)) return { ecole: false, raison: 'weekend' }

  const annee = anneePour(d)
  if (!annee) return { ecole: false, raison: 'annee-inconnue' }

  const iso = isoDate(d)
  const conge = annee.vacances.find((v) => iso >= v.du && iso <= v.au)
  if (conge) return { ecole: false, raison: 'vacances', id: conge.id }

  const ferie = annee.feries.find((f) => f.date === iso)
  if (ferie) return { ecole: false, raison: 'ferie', id: ferie.id }

  // Année partiellement renseignée : hors des périodes connues, on ne conclut pas.
  if (annee.partiel) return { ecole: false, raison: 'annee-inconnue' }

  return { ecole: true }
}

/** Toutes les dates sans école d'une année scolaire, jour de semaine uniquement. */
function datesSansEcole(annee: AnneeVacances): Date[] {
  const out: Date[] = []
  const fin = depuisIso(annee.fin)
  for (const d = depuisIso(annee.debut); d <= fin; d.setDate(d.getDate() + 1)) {
    if (!jourDeSemaine(d)) continue
    const iso = isoDate(d)
    const enConge = annee.vacances.some((v) => iso >= v.du && iso <= v.au)
    const ferie = annee.feries.some((f) => f.date === iso)
    if (enConge || ferie) out.push(new Date(d))
  }
  return out
}

const JOUR_ICS: Record<Jour, string> = {
  lundi: 'MO',
  mardi: 'TU',
  mercredi: 'WE',
  jeudi: 'TH',
  vendredi: 'FR',
}

function horodatage(d: Date, heure: string): string {
  const [h, m] = heure.split(':')
  return `${isoDate(d).replace(/-/g, '')}T${h}${m}00`
}

/** Première date à partir de `depuis` tombant l'un des jours demandés. */
function premiereOccurrence(depuis: string, jours: Jour[]): Date {
  const d = depuisIso(depuis)
  for (let i = 0; i < 14; i++) {
    const j = jourDeSemaine(d)
    if (j && jours.includes(j)) return d
    d.setDate(d.getDate() + 1)
  }
  return d
}

/** Échappe les caractères réservés du format iCalendar. */
function echapper(texte: string): string {
  return (
    texte
      .replace(/([,;\\])/g, '\\$1')
      // `\r` d'abord, seul ou suivi de `\n` : un prénom collé depuis Windows en porte
      // un, et laissé tel quel il coupe la ligne au milieu d'un champ — le fichier
      // devient illisible pour l'agenda, sans message d'erreur.
      .replace(/\r\n?/g, '\\n')
      .replace(/\n/g, '\\n')
  )
}

/** Replie les lignes à 75 octets, comme l'exige la RFC 5545. */
function plier(ligne: string): string {
  if (ligne.length <= 75) return ligne
  const morceaux: string[] = [ligne.slice(0, 75)]
  for (let i = 75; i < ligne.length; i += 74) morceaux.push(' ' + ligne.slice(i, i + 74))
  return morceaux.join('\r\n')
}

export interface OptionsIcs {
  /** Libellé de chaque type de trajet, fourni par la couche i18n. */
  libelleTrajet: (t: Trajet) => string
  /** Nom de l'arrêt, fourni par la couche i18n. */
  nomArret: (idArret: string) => string
  /** Minutes de marche jusqu'à l'arrêt, pour placer un rappel utile. */
  minutesMarche: number
  /** Libellé de la récupération à la maison relais, fourni par la couche i18n. */
  libelleRecuperation: string
  /** Libellé de la dépose à la maison relais, fourni par la couche i18n. */
  libelleDepose: string
}

/**
 * Génère un `.ics` pour un enfant.
 *
 * Les trajets varient d'un jour à l'autre : on n'émet donc pas un événement
 * hebdomadaire unique, mais un événement par trajet distinct, avec un `RRULE ... BYDAY`
 * limité aux jours concernés. Chaque série est bornée à l'année scolaire et exclut,
 * via `EXDATE`, chaque jour de vacances et chaque férié — sans quoi l'agenda
 * annoncerait un bus en plein mois de février.
 */
export function genererIcs(ctx: ContexteEnfant, o: OptionsIcs): string {
  const annee = anneeAExporter()
  if (!annee) return ''
  const semaine = semaineEnfant(ctx)

  // Regroupe les trajets identiques (même ligne, même heure, mêmes arrêts) et note
  // les jours où ils ont lieu.
  const groupes = new Map<string, { trajet: Trajet; jours: Jour[] }>()
  // Passages du parent à la maison relais, regroupés par heure. Deux séries
  // distinctes : le dépôt du matin et la récupération du soir.
  const deposes = new Map<string, Jour[]>()
  const recuperations = new Map<string, Jour[]>()

  for (const journee of semaine) {
    if (journee.depose) {
      const h = journee.depose.heure
      deposes.set(h, [...(deposes.get(h) ?? []), journee.jour])
    }
    if (journee.recuperation) {
      const h = journee.recuperation.heure
      recuperations.set(h, [...(recuperations.get(h) ?? []), journee.jour])
    }

    for (const t of journee.trajets) {
      if (!t.concerneParent || !t.depart.heure) continue
      // Le bus qui dépose l'enfant au Dillendapp ne demande rien au parent à un
      // arrêt : ce qui compte pour lui, c'est l'heure de récupération, ajoutée
      // séparément ci-dessous.
      if (t.type === 'retour-soir-dillendapp') continue
      const cle = [t.type, t.ligne.id, t.depart.heure, t.depart.arret.id, t.arrivee.arret.id].join('|')
      const g = groupes.get(cle)
      if (g) g.jours.push(journee.jour)
      else groupes.set(cle, { trajet: t, jours: [journee.jour] })
    }
  }

  const lignes: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//bus-scolaire-beckerich//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${echapper(`Bus scolaire — ${ctx.enfant.prenom}`)}`,
  ]

  const exclusions = datesSansEcole(annee)
  const finIso = annee.fin.replace(/-/g, '') + 'T235959'

  let n = 0
  for (const { trajet, jours } of groupes.values()) {
    const heure = trajet.depart.heure!
    const debut = premiereOccurrence(annee.debut, jours)
    const uid = `${ctx.enfant.id}-${trajet.type}-${n++}@bus-scolaire-beckerich`

    // Les exclusions ne portent que sur les jours réellement concernés par la série.
    const exdates = exclusions
      .filter((d) => {
        const j = jourDeSemaine(d)
        return j !== null && jours.includes(j)
      })
      .map((d) => horodatage(d, heure))

    lignes.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${horodatage(new Date(), '00:00')}Z`,
      `DTSTART:${horodatage(debut, heure)}`,
      `DURATION:PT${Math.max(5, o.minutesMarche)}M`,
      `RRULE:FREQ=WEEKLY;BYDAY=${jours.map((j) => JOUR_ICS[j]).join(',')};UNTIL=${finIso}`,
      ...(exdates.length ? [plier(`EXDATE:${exdates.join(',')}`)] : []),
      plier(`SUMMARY:${echapper(`${ctx.enfant.prenom} — ${o.libelleTrajet(trajet)}`)}`),
      plier(`LOCATION:${echapper(o.nomArret(trajet.depart.arret.id))}`),
      plier(
        `DESCRIPTION:${echapper(
          `${trajet.ligne.nom}\n${o.nomArret(trajet.depart.arret.id)} ${heure} → ` +
            `${o.nomArret(trajet.arrivee.arret.id)} ${trajet.arrivee.heure ?? ''}\n` +
            `Environ ${o.minutesMarche} min de marche jusqu'à l'arrêt (estimation).\n` +
            `Horaires non officiels — source : ${plan.source.url}`,
        )}`,
      ),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-PT${Math.max(5, o.minutesMarche + 5)}M`,
      plier(`DESCRIPTION:${echapper(`${ctx.enfant.prenom} — départ pour l'arrêt`)}`),
      'END:VALARM',
      'END:VEVENT',
    )
  }

  /**
   * Les passages du parent à la maison relais : c'est son engagement le plus concret,
   * et le seul que rien d'autre ne lui rappellera. Dépose et récupération partagent
   * la même forme, seul le libellé et l'identifiant changent.
   */
  const ajouterPassageMaisonRelais = (
    genre: 'depose' | 'recuperation',
    libelle: string,
    heure: string,
    jours: Jour[],
  ) => {
    const debut = premiereOccurrence(annee.debut, jours)
    const exdates = exclusions
      .filter((d) => {
        const j = jourDeSemaine(d)
        return j !== null && jours.includes(j)
      })
      .map((d) => horodatage(d, heure))

    lignes.push(
      'BEGIN:VEVENT',
      `UID:${ctx.enfant.id}-${genre}-${heure.replace(':', '')}@bus-scolaire-beckerich`,
      `DTSTAMP:${horodatage(new Date(), '00:00')}Z`,
      `DTSTART:${horodatage(debut, heure)}`,
      'DURATION:PT15M',
      `RRULE:FREQ=WEEKLY;BYDAY=${jours.map((j) => JOUR_ICS[j]).join(',')};UNTIL=${finIso}`,
      ...(exdates.length ? [plier(`EXDATE:${exdates.join(',')}`)] : []),
      plier(`SUMMARY:${echapper(`${ctx.enfant.prenom} — ${libelle}`)}`),
      plier(`LOCATION:${echapper(o.nomArret(maisonRelais.arret))}`),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT20M',
      plier(`DESCRIPTION:${echapper(`${ctx.enfant.prenom} — ${libelle}`)}`),
      'END:VALARM',
      'END:VEVENT',
    )
  }

  for (const [heure, jours] of deposes) {
    ajouterPassageMaisonRelais('depose', o.libelleDepose, heure, jours)
  }
  for (const [heure, jours] of recuperations) {
    ajouterPassageMaisonRelais('recuperation', o.libelleRecuperation, heure, jours)
  }

  lignes.push('END:VCALENDAR')
  return lignes.join('\r\n') + '\r\n'
}

/**
 * Lien « Ajouter à Google Agenda » pour un trajet.
 *
 * Google gère mal les exclusions de vacances dans une URL de modèle : le `.ics`
 * reste le format recommandé, ce lien n'est qu'un raccourci.
 */
export function lienGoogleAgenda(
  ctx: ContexteEnfant,
  trajet: Trajet,
  jours: Jour[],
  titre: string,
  lieu: string,
): string {
  const annee = anneeAExporter()
  if (!annee) return ''
  const heure = trajet.depart.heure ?? '08:00'
  const debut = premiereOccurrence(annee.debut, jours)
  const fin = new Date(debut)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${ctx.enfant.prenom} — ${titre}`,
    dates: `${horodatage(debut, heure)}/${horodatage(fin, trajet.arrivee.heure ?? heure)}`,
    location: lieu,
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${jours.map((j) => JOUR_ICS[j]).join(',')};UNTIL=${annee.fin.replace(/-/g, '')}`,
    details: `${trajet.ligne.nom} — horaires non officiels, source : ${plan.source.url}`,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
