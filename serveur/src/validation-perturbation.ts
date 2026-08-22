/**
 * Revalidation autoritaire des perturbations.
 *
 * Repris du Worker sans en assouplir une seule règle. Le principe qui la justifie ne
 * change pas avec l'hébergement : **le client, même le nôtre, n'est pas digne de
 * confiance**. Il suffit d'un `curl` pour parler à cette route, et la validation faite
 * dans le navigateur ne protège que les distraits.
 */

// Les quatre types que l'application sait afficher (`TypePerturbation` dans
// `src/lib/types.ts` côté navigateur). En accepter un cinquième ici publierait une
// perturbation que personne ne verrait jamais.
export const TYPES = ['annulation', 'retard', 'arret-deplace', 'message']
export const GRAVITES = ['info', 'attention', 'alerte']
export const LANGUES = ['fr', 'de', 'lb', 'pt', 'en']
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/

export const texteSur = (valeur: unknown, max: number): valeur is string =>
  typeof valeur === 'string' && valeur.trim().length > 0 && valeur.length <= max

/**
 * Vérifie une perturbation de bout en bout.
 *
 * Renvoie la liste des motifs de refus, vide si tout va bien. On refuse la charge
 * entière plutôt que d'en publier une version amputée : une annulation de bus à
 * moitié écrite vaut moins que pas d'annulation du tout.
 */
export function validerPerturbation(p: unknown): string[] {
  const motifs: string[] = []
  if (typeof p !== 'object' || p === null) return ['perturbation-absente']
  const x = p as Record<string, unknown>

  if (!texteSur(x.id, 64)) motifs.push('id')
  if (!TYPES.includes(x.type as string)) motifs.push('type')
  if (!GRAVITES.includes(x.gravite as string)) motifs.push('gravite')
  if (!DATE_ISO.test((x.du as string) ?? '')) motifs.push('du')
  if (!DATE_ISO.test((x.au as string) ?? '')) motifs.push('au')
  if (
    DATE_ISO.test((x.du as string) ?? '') &&
    DATE_ISO.test((x.au as string) ?? '') &&
    (x.au as string) < (x.du as string)
  ) {
    motifs.push('ordre-dates')
  }

  const message = x.message as Record<string, unknown> | null
  if (typeof message !== 'object' || message === null || !texteSur(message.fr, 200)) {
    motifs.push('message')
  } else {
    for (const [langue, texte] of Object.entries(message)) {
      if (!LANGUES.includes(langue)) motifs.push(`langue-${langue}`)
      else if (texte !== undefined && !texteSur(texte, 200)) motifs.push(`message-${langue}`)
    }
  }

  // Un retard de 300 minutes n'est plus un retard : c'est une annulation mal saisie.
  if (x.minutes !== undefined) {
    if (!Number.isInteger(x.minutes) || (x.minutes as number) < 1 || (x.minutes as number) > 120) {
      motifs.push('minutes')
    }
  }
  if (x.type === 'retard' && x.minutes === undefined) motifs.push('minutes-obligatoires')

  for (const champ of ['ligne', 'service', 'arret', 'arretRemplacement']) {
    if (x[champ] !== undefined && !texteSur(x[champ], 64)) motifs.push(champ)
  }
  if (x.type === 'arret-deplace' && !texteSur(x.arret, 64)) motifs.push('arret-obligatoire')

  // Le nombre de rappels commande autant d'envois répétés à toutes les familles
  // abonnées. Non borné, il ferait du serveur un outil de harcèlement involontaire.
  if (x.rappels !== undefined) {
    if (!Number.isInteger(x.rappels) || (x.rappels as number) < 0 || (x.rappels as number) > 3) {
      motifs.push('rappels')
    }
  }

  return motifs
}

/**
 * Les seuls champs qu'une perturbation publiée a le droit de porter.
 *
 * Le contenu était autrefois recopié par `...charge.perturbation` : tout champ inconnu
 * envoyé par un client — le nôtre ou un `curl` — partait tel quel dans un fichier
 * public. L'application l'aurait ignoré à la lecture, mais il aurait bel et bien été
 * publié.
 */
const CHAMPS_PERTURBATION = [
  'id',
  'type',
  'gravite',
  'du',
  'au',
  'message',
  'minutes',
  'ligne',
  'service',
  'arret',
  'arretRemplacement',
  'rappels',
]

/** Ne garde que les champs connus, une fois la validation passée. */
export function perturbationPropre(brute: Record<string, unknown>): Record<string, unknown> {
  const propre: Record<string, unknown> = {}
  for (const champ of CHAMPS_PERTURBATION) {
    if (brute[champ] !== undefined) propre[champ] = brute[champ]
  }
  return propre
}
