/**
 * Envoi des rappels de perturbation majeure.
 *
 * La décision — quel créneau, combien de fois — reste entièrement dans `rappels.js`,
 * repris tel quel. Ce fichier n'est que sa plomberie : lire les perturbations, lire
 * les états, envoyer, réécrire les états.
 *
 * C'est la chaîne visée par la réserve R7 : elle a été corrigée une fois mais jamais
 * exercée un vrai matin d'école. Le lot 25 lui ajoutera un journal de livraison, sans
 * lequel il n'existe aucun moyen de VOIR ce qui est parti à 06:45.
 */
import { rappelsDus } from './rappels.js'
import { etatDuJour } from '../../src/lib/calendrier.ts'
import { plan } from '../../src/lib/donnees.ts'
import { envoyerATous } from './envois.ts'
import { ecrireEphemere, lireEphemere } from './stockage/ephemeres.ts'

const PREFIXE_RAPPEL = 'rappel:'
/** L'état survit à la perturbation le temps qu'elle expire, puis disparaît seul. */
const DUREE_ETAT_RAPPEL_S = 30 * 24 * 3600

const TITRES: Record<string, string> = {
  annulation: 'Bus annulé',
  retard: 'Bus en retard',
  'arret-deplace': 'Arrêt déplacé',
  message: 'Information bus scolaire',
}

/**
 * Relit les perturbations publiées.
 *
 * On lit le fichier tel qu'il est servi aux parents, et non le dépôt : c'est
 * exactement ce qu'ils voient, et cela n'exige aucun jeton.
 *
 * Au lot 24, cette lecture deviendra une requête sur la table `perturbation` — et le
 * détour par le site publié disparaîtra avec elle.
 */
async function lireUrgencesPubliees(): Promise<any[]> {
  const base = (process.env.URL_SITE ?? '').replace(/\/$/, '')
  if (!base) return []
  const rep = await fetch(`${base}/urgences.json`, { cache: 'no-store' })
  if (!rep.ok) throw new Error(`urgences-illisibles-${rep.status}`)
  const donnees = (await rep.json()) as { perturbations?: unknown[] }
  return (donnees?.perturbations ?? []) as any[]
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
export async function envoyerRappels(): Promise<{ rappels: number }> {
  const maintenant = new Date()
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

    envoyes++
    console.log(
      `rappel ${du.numero}/${du.total} pour ${p.id} au créneau ${du.creneau} : ` +
        `${resultat.envoyees} envoyée(s), ${resultat.echecs} échec(s)`,
    )
  }

  return { rappels: envoyes }
}
