/**
 * Producteur iCalendar.
 *
 * Ne connaît que `EvenementRecurrent` : il ne sait rien des bus, des cycles ni du
 * calendrier scolaire. C'est ce qui permet d'exporter aussi bien un enfant qu'un foyer
 * entier sans dupliquer une ligne de calcul.
 */
import type { Jour } from '../types'
import type { EvenementRecurrent } from './evenements'

const JOUR_ICS: Record<Jour, string> = {
  lundi: 'MO',
  mardi: 'TU',
  mercredi: 'WE',
  jeudi: 'TH',
  vendredi: 'FR',
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

const horodatage = (iso: string, heure: string) =>
  `${iso.replace(/-/g, '')}T${heure.replace(':', '')}00`

/** Un événement récurrent, en `VEVENT`. */
function versVevent(e: EvenementRecurrent, estampille: string): string[] {
  const exdates = e.exclusions.map((iso) => horodatage(iso, e.heure))

  return [
    'BEGIN:VEVENT',
    `UID:${e.id}@bus-scolaire-beckerich`,
    `DTSTAMP:${estampille}`,
    `DTSTART:${horodatage(e.debut, e.heure)}`,
    `DURATION:PT${e.duree}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${e.jours.map((j) => JOUR_ICS[j]).join(',')};UNTIL=${e.fin.replace(/-/g, '')}T235959`,
    ...(exdates.length ? [plier(`EXDATE:${exdates.join(',')}`)] : []),
    plier(`SUMMARY:${echapper(e.titre)}`),
    plier(`LOCATION:${echapper(e.lieu)}`),
    plier(`DESCRIPTION:${echapper(e.description)}`),
    ...(e.rappel !== null
      ? [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `TRIGGER:-PT${e.rappel}M`,
          plier(`DESCRIPTION:${echapper(e.titre)}`),
          'END:VALARM',
        ]
      : []),
    'END:VEVENT',
  ]
}

/**
 * Assemble un calendrier complet.
 *
 * `nom` devient le titre proposé à l'import : « Bus scolaire — Léa » pour un enfant,
 * « Bus scolaire — la famille » pour un foyer. Les agendas s'en servent pour nommer le
 * calendrier créé, ce qui permet au parent de le retrouver et de le supprimer d'un geste.
 */
export function versIcs(evenements: EvenementRecurrent[], nom: string): string {
  if (!evenements.length) return ''

  const estampille = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`

  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//bus-scolaire-beckerich//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      plier(`X-WR-CALNAME:${echapper(nom)}`),
      ...evenements.flatMap((e) => versVevent(e, estampille)),
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n'
  )
}
