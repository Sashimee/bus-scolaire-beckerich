/**
 * Envoi des rappels de perturbation majeure.
 *
 * La décision — quel créneau, combien de fois — reste entièrement dans `rappels.js`,
 * repris tel quel. Ce fichier n'est que sa plomberie : lire les perturbations, lire
 * les états, envoyer, réécrire les états.
 *
 * C'est la chaîne visée par la réserve R7 : elle a été corrigée une fois mais jamais
 * exercée un vrai matin d'école. Le lot 26 lui a ajouté un **journal de livraison**
 * (chaque envoi inscrit dans la table `journal`, sous l'auteur « système »), sans lequel
 * il n'existait aucun moyen de VOIR ce qui était parti à 06:45. Il se lit avec le reste
 * du journal, à l'onglet « Journal » de `/edition`.
 */
import { rappelsDus } from './rappels.js'
import { etatDuJour } from '../../src/lib/calendrier.ts'
import { plan } from '../../src/lib/donnees.ts'
import { envoyerATous } from './envois.ts'
import { ecrireEphemere, lireEphemere } from './stockage/ephemeres.ts'
import { listerPerturbations } from './stockage/publications.ts'
import { journaliser } from './stockage/journal.ts'
import { baseConfiguree } from './stockage/client.ts'

const PREFIXE_RAPPEL = 'rappel:'
/** L'état survit à la perturbation le temps qu'elle expire, puis disparaît seul. */
const DUREE_ETAT_RAPPEL_S = 30 * 24 * 3600

/**
 * L'auteur inscrit au journal pour un rappel. Ce n'est personne : le rappel part tout
 * seul, décidé par l'horloge et l'état, sans qu'un agent l'ait demandé. Le nommer
 * « système » le distingue d'un envoi provoqué par une publication.
 */
const AUTEUR_RAPPELS = { nom: 'système', service: 'rappels' }

const TITRES: Record<string, string> = {
  annulation: 'Bus annulé',
  retard: 'Bus en retard',
  'arret-deplace': 'Arrêt déplacé',
  message: 'Information bus scolaire',
}

/**
 * Relit les perturbations publiées, directement dans la table `perturbation` (lot 25).
 *
 * Avant, on relisait le fichier servi aux parents par un aller-retour HTTP vers le site
 * publié — un détour qui n'avait de sens que quand les perturbations vivaient dans un
 * fichier du dépôt. La source est désormais la base, la même que celle où la publication
 * les écrit : plus de détour, et plus de dépendance à ce que le site soit joignable.
 */
async function lireUrgencesPubliees(): Promise<any[]> {
  if (!baseConfiguree()) return []
  return listerPerturbations()
}

interface EtatRappel {
  compte: number
  creneaux: string[]
  dernier?: string
}

/**
 * Le corps diffère du premier envoi — « Rappel : … » — sans quoi les téléphones
 * regroupent les deux notifications et la seconde passe inaperçue, ce qui vide le
 * rappel de son seul intérêt.
 */
export async function envoyerRappels(maintenant = new Date()): Promise<{ rappels: number }> {
  const perturbations = await lireUrgencesPubliees()
  if (!perturbations.length) return { rappels: 0 }

  // Les états sont relus un par un : il y a au plus une poignée d'alertes actives.
  const etats: Record<string, EtatRappel> = {}
  for (const p of perturbations) {
    const etat = await lireEphemere<EtatRappel>(PREFIXE_RAPPEL + p.id)
    if (etat) etats[p.id] = etat
  }

  const dus = rappelsDus({
    perturbations,
    maintenant,
    etats,
    plan,
    // `etatDuJour` connaît vacances et fériés : un rappel un jour de congé n'aurait
    // aucun sens, et c'est la même table que celle affichée aux parents.
    jourEcole: etatDuJour(maintenant).ecole,
  })

  let envoyes = 0
  for (const du of dus) {
    const p = du.perturbation
    const resultat = await envoyerATous({
      id: `${p.id}-rappel-${du.numero}`,
      titre: `Rappel : ${TITRES[p.type] ?? 'Bus scolaire Beckerich'}`,
      corps: `Toujours d'actualité — ${p.message?.fr ?? ''}`.trim(),
      gravite: p.gravite,
      rappel: true,
      url: './',
    })

    // L'état est écrit APRÈS l'envoi : si le serveur tombe entre les deux, le rappel
    // repartira au prochain réveil plutôt que d'être perdu en silence.
    const etat = etats[p.id] ?? { compte: 0, creneaux: [] }
    await ecrireEphemere(
      PREFIXE_RAPPEL + p.id,
      {
        compte: etat.compte + 1,
        creneaux: [...new Set([...etat.creneaux, ...du.consommes])],
        dernier: maintenant.toISOString(),
      },
      DUREE_ETAT_RAPPEL_S,
    )

    // Le journal de livraison (lot 26). Écrit APRÈS l'état : ce qui compte est de savoir
    // ce qui est réellement parti. Il porte le compte des envois et des échecs — un
    // rappel « 0 envoyée, 0 échec » dit qu'aucun téléphone n'était abonné à ce créneau,
    // ce qui est une information, pas une panne.
    await journaliser(
      AUTEUR_RAPPELS,
      'rappel',
      `${p.id} · rappel ${du.numero}/${du.total} · ${du.creneau} · ` +
        `${resultat.envoyees} envoyée(s), ${resultat.echecs} échec(s)`,
    )

    envoyes++
    console.log(
      `rappel ${du.numero}/${du.total} pour ${p.id} au créneau ${du.creneau} : ` +
        `${resultat.envoyees} envoyée(s), ${resultat.echecs} échec(s)`,
    )
  }

  return { rappels: envoyes }
}
