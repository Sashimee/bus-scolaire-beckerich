/**
 * Planificateur des rappels de perturbation.
 *
 * Une annulation publiée à 6 h 40 est manquée par tous ceux qui dorment encore. La
 * première notification ne suffit donc pas : il faut la répéter, mais seulement quand
 * elle sert encore à quelque chose — avant le départ à l'arrêt, et jamais après.
 *
 * Toute la logique de décision est ici, sans réseau ni KV, pour qu'elle soit testable
 * telle quelle. Le Worker se contente de lui fournir l'heure et l'état, puis d'exécuter
 * ce qu'elle décide.
 *
 * **Tout est raisonné en heure locale du Luxembourg**, jamais en UTC. Cloudflare
 * déclenche ses crons en UTC, et le pays passe de UTC+1 à UTC+2 : un créneau écrit en
 * UTC se décalerait d'une heure deux fois par an, ce qui, pour un rappel censé tomber
 * avant le bus de 7 h 25, revient à ne pas l'envoyer.
 */

const FUSEAU = 'Europe/Luxembourg'

/**
 * Créneaux de rappel, en heure locale.
 *
 * Un rappel n'a de valeur qu'avant le départ à l'arrêt : après, il ne fait qu'inquiéter
 * quelqu'un qui n'y peut plus rien.
 */
export const CRENEAUX = {
  matin: ['06:45', '07:15', '07:40'],
  'apres-midi': ['11:15', '15:00'],
}

/** Jamais plus de trois rappels, quoi que demande la perturbation. */
export const RAPPELS_MAX = 3

/** Jamais avant 6 h ni après 21 h, même si un créneau tombait en dehors. */
export const HEURE_MIN = 6
export const HEURE_MAX = 21

const enMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * L'instant, tel qu'il est vécu à Beckerich.
 *
 * `Intl` fait la conversion, y compris le changement d'heure : c'est la seule façon
 * fiable de l'obtenir sans embarquer une base de fuseaux.
 */
export function momentLocal(date) {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {})

  // `hour12: false` peut rendre « 24 » pour minuit selon la plate-forme.
  const heure = Number(parties.hour) % 24
  return {
    iso: `${parties.year}-${parties.month}-${parties.day}`,
    heure,
    minutes: heure * 60 + Number(parties.minute),
  }
}

/**
 * À quel moment de la journée une perturbation s'applique.
 *
 * Quand la course est connue, sa période tranche. Sinon on ne devine pas : une annonce
 * qui ne précise ni ligne ni course concerne potentiellement tous les départs, et se
 * rappelle donc avant chacun.
 */
export function creneauxApplicables(perturbation, plan) {
  const service = perturbation.service
    ? plan.lignes.flatMap((l) => l.services).find((s) => s.id === perturbation.service)
    : null

  if (service) {
    return service.periode === 'matin' ? CRENEAUX.matin : CRENEAUX['apres-midi']
  }
  return [...CRENEAUX.matin, ...CRENEAUX['apres-midi']].sort()
}

/**
 * Les rappels à envoyer maintenant.
 *
 * `etats` associe l'identifiant d'une perturbation à `{ compte, creneaux }` :
 * combien de rappels ont déjà été envoyés, et lesquels — sous la forme
 * `AAAA-MM-JJ HH:MM`, pour qu'un créneau ne serve qu'une fois par jour.
 *
 * Quand plusieurs créneaux sont échus d'un coup — le cron a pu être manqué, ou le
 * Worker déployé en cours de matinée — on n'en envoie qu'UN, le dernier. Les autres
 * sont marqués comme consommés : mieux vaut un rappel à l'heure la plus proche que
 * trois notifications d'affilée sur le même téléphone.
 */
export function rappelsDus({ perturbations, maintenant, etats = {}, plan, jourEcole }) {
  const now = momentLocal(maintenant)

  // Un jour sans école n'a pas de bus à rappeler, et la nuit personne ne veut être
  // réveillé pour un bus du lendemain.
  if (!jourEcole) return []
  if (now.heure < HEURE_MIN || now.heure >= HEURE_MAX) return []

  const dus = []

  for (const p of perturbations ?? []) {
    // Seules les alertes justifient qu'on insiste. Une information se lit dans
    // l'application, elle n'a pas à faire sonner un téléphone trois fois.
    if (p.gravite !== 'alerte') continue
    if (!(p.du <= now.iso && now.iso <= p.au)) continue

    const souhaites = Math.min(p.rappels ?? RAPPELS_MAX, RAPPELS_MAX)
    if (souhaites < 1) continue

    const etat = etats[p.id] ?? { compte: 0, creneaux: [] }
    if (etat.compte >= souhaites) continue

    const echus = creneauxApplicables(p, plan)
      .filter((c) => enMinutes(c) <= now.minutes)
      .filter((c) => !etat.creneaux.includes(`${now.iso} ${c}`))

    if (!echus.length) continue

    const retenu = echus[echus.length - 1]
    dus.push({
      perturbation: p,
      creneau: retenu,
      /** Rang du rappel, pour l'afficher au parent : « rappel 2 sur 3 ». */
      numero: etat.compte + 1,
      total: souhaites,
      /** Créneaux à marquer comme consommés, envoi compris. */
      consommes: echus.map((c) => `${now.iso} ${c}`),
    })
  }

  return dus
}
