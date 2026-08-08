/**
 * Représentation intermédiaire des rendez-vous d'un enfant.
 *
 * Séparée du format de sortie. `calendrier.ts` mélangeait le calendrier scolaire et la
 * fabrication du texte iCalendar : ajouter un second format — Google Agenda, au lot 13 —
 * aurait voulu dire réécrire le calcul, avec la certitude que les deux versions
 * divergeraient au premier changement de règle.
 *
 * Ici, on calcule une fois ce qui doit figurer dans un agenda, et chaque producteur
 * (`versIcs`, plus tard l'API Google) se contente de le mettre en forme.
 */
import { anneeAExporter, jourDeSemaine, datesSansEcole, isoDate } from '../calendrier'
import { maisonRelais, plan } from '../donnees'
import { semaineEnfant, type ContexteEnfant } from '../plan'
import type { Jour, Trajet } from '../types'

/**
 * Un rendez-vous qui revient chaque semaine, jusqu'à la fin de l'année scolaire.
 *
 * Volontairement sans notion de fuseau ni de format : une heure « 07:25 » et des jours
 * de semaine. C'est au producteur de savoir ce qu'il en fait.
 */
export interface EvenementRecurrent {
  /** Identifiant stable, dérivé de l'enfant et du trajet. Permet de resynchroniser. */
  id: string
  titre: string
  /** Nom de l'arrêt ou de la maison relais, tel qu'il s'affiche. */
  lieu: string
  /** « HH:MM », heure locale. */
  heure: string
  /** Durée en minutes. */
  duree: number
  jours: Jour[]
  /** Dates sans école à exclure de la série, au format AAAA-MM-JJ. */
  exclusions: string[]
  /** Minutes avant l'événement pour le rappel. `null` = pas de rappel. */
  rappel: number | null
  description: string
  /** Première date de la série, au format AAAA-MM-JJ. */
  debut: string
  /** Dernière date couverte, au format AAAA-MM-JJ. */
  fin: string
}

export interface OptionsAgenda {
  /** Libellé de chaque type de trajet, fourni par la couche i18n. */
  libelleTrajet: (t: Trajet) => string
  /** Nom d'un arrêt, fourni par la couche i18n. */
  nomArret: (idArret: string) => string
  libelleRecuperation: string
  libelleDepose: string
}

/** Première date à partir de `depuis` tombant l'un des jours demandés. */
function premiereOccurrence(depuis: string, jours: Jour[]): string {
  const [a, m, j] = depuis.split('-').map(Number)
  const d = new Date(a, m - 1, j)
  for (let i = 0; i < 14; i++) {
    const jour = jourDeSemaine(d)
    if (jour && jours.includes(jour)) return isoDate(d)
    d.setDate(d.getDate() + 1)
  }
  return isoDate(d)
}

/**
 * Tous les rendez-vous d'un enfant pour l'année scolaire à exporter.
 *
 * Les trajets varient d'un jour à l'autre : on n'émet donc pas un événement
 * hebdomadaire unique mais un événement par trajet distinct, limité aux jours
 * concernés. Deux trajets ne sont regroupés que s'ils partagent ligne, heure et arrêts
 * — l'arrêt compte, car une adresse dérogatoire change le lieu du rendez-vous ce
 * jour-là, et un agenda qui annoncerait le mauvais arrêt serait pire qu'aucun agenda.
 */
export function evenementsEnfant(
  ctx: ContexteEnfant,
  o: OptionsAgenda,
): EvenementRecurrent[] {
  const annee = anneeAExporter()
  if (!annee) return []

  const semaine = semaineEnfant(ctx)
  const sansEcole = datesSansEcole(annee).map(isoDate)
  const marche = Math.max(5, ctx.temps)

  const groupes = new Map<string, { trajet: Trajet; jours: Jour[] }>()
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
      // arrêt : ce qui l'engage, c'est l'heure de récupération, ajoutée séparément.
      if (t.type === 'retour-soir-dillendapp') continue
      const cle = [t.type, t.ligne.id, t.depart.heure, t.depart.arret.id, t.arrivee.arret.id].join('|')
      const g = groupes.get(cle)
      if (g) g.jours.push(journee.jour)
      else groupes.set(cle, { trajet: t, jours: [journee.jour] })
    }
  }

  const exclusionsPour = (jours: Jour[]) =>
    sansEcole.filter((iso) => {
      const [a, m, j] = iso.split('-').map(Number)
      const jour = jourDeSemaine(new Date(a, m - 1, j))
      return jour !== null && jours.includes(jour)
    })

  const evenements: EvenementRecurrent[] = []
  let n = 0

  for (const { trajet, jours } of groupes.values()) {
    const heure = trajet.depart.heure!
    const lieu = o.nomArret(trajet.depart.arret.id)
    evenements.push({
      id: `${ctx.enfant.id}-${trajet.type}-${n++}`,
      titre: `${ctx.enfant.prenom} — ${o.libelleTrajet(trajet)}`,
      lieu,
      heure,
      duree: marche,
      jours,
      exclusions: exclusionsPour(jours),
      rappel: marche + 5,
      description:
        `${trajet.ligne.nom}\n${lieu} ${heure} → ` +
        `${o.nomArret(trajet.arrivee.arret.id)} ${trajet.arrivee.heure ?? ''}\n` +
        `Environ ${ctx.temps} min de marche jusqu'à l'arrêt (estimation).\n` +
        `Horaires non officiels — source : ${plan.source.url}`,
      debut: premiereOccurrence(annee.debut, jours),
      fin: annee.fin,
    })
  }

  // Les passages du parent à la maison relais : son engagement le plus concret, et le
  // seul que rien d'autre ne lui rappellera.
  const passage = (genre: 'depose' | 'recuperation', libelle: string) =>
    (heure: string, jours: Jour[]) => {
      evenements.push({
        id: `${ctx.enfant.id}-${genre}-${heure.replace(':', '')}`,
        titre: `${ctx.enfant.prenom} — ${libelle}`,
        lieu: o.nomArret(maisonRelais.arret),
        heure,
        duree: 15,
        jours,
        exclusions: exclusionsPour(jours),
        rappel: 20,
        description: libelle,
        debut: premiereOccurrence(annee.debut, jours),
        fin: annee.fin,
      })
    }

  for (const [heure, jours] of deposes) passage('depose', o.libelleDepose)(heure, jours)
  for (const [heure, jours] of recuperations) {
    passage('recuperation', o.libelleRecuperation)(heure, jours)
  }

  return evenements
}
