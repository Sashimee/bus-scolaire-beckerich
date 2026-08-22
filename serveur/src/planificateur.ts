/**
 * Le réveil périodique, qui remplace le cron Cloudflare.
 *
 * Le Worker déclarait un cron « toutes les quinze minutes, de 4 h à 15 h UTC, du
 * lundi au vendredi ». La fenêtre était si large parce que les créneaux de
 * rappel sont écrits en HEURE LOCALE (06:45, 07:15, 07:40, 11:15, 15:00) et que le
 * Luxembourg passe de UTC+1 à UTC+2 : une fenêtre calée sur l'UTC aurait raté le
 * rappel de 6 h 45 la moitié de l'année. Quarante-quatre réveils par jour pour au
 * plus cinq créneaux utiles, et un pas de quinze minutes sur des créneaux qui n'en
 * font pas le tour.
 *
 * Ici, un réveil par minute, dans le processus, et c'est `rappels.js` — inchangé —
 * qui décide s'il y a lieu d'envoyer. Plus de fenêtre à raisonner, plus de décalage
 * horaire à compenser : `momentLocal()` lit déjà l'heure d'Europe/Luxembourg par
 * `Intl`, ce qu'il faisait de toute façon.
 */
import { envoyerRappels } from './rappels-envoi.ts'
import { balayerEphemeres } from './stockage/ephemeres.ts'
import { balayerDebits } from './stockage/debit.ts'
import { purgerJournal } from './stockage/journal.ts'

const MINUTE_MS = 60_000
const HEURE_MS = 3_600_000

/**
 * Le balayage ne garantit RIEN sur l'expiration : les lectures filtrent déjà sur
 * `expire_le`. Il ne fait que récupérer la place. C'est pour cela qu'il tourne une
 * fois par heure et non une fois par minute, et qu'une panne de sa part ne se voit
 * nulle part — c'est voulu.
 */
async function balayer(): Promise<void> {
  const [ephemeres, debits, journal] = await Promise.all([
    balayerEphemeres(),
    balayerDebits(),
    purgerJournal(),
  ])
  if (ephemeres || debits || journal) {
    console.log(
      `balayage : ${ephemeres} éphémère(s), ${debits} compteur(s), ${journal} entrée(s) de journal`,
    )
  }
}

/**
 * Un tour de garde ne doit jamais faire tomber le processus.
 *
 * Une exception non capturée dans un `setInterval` termine Node. Le conteneur
 * redémarrerait, ce qui ressemblerait à une panne d'hébergement alors que ce serait
 * une perturbation malformée.
 */
function garder(nom: string, tache: () => Promise<unknown>): () => void {
  let enCours = false
  return () => {
    // Un tour qui dure plus longtemps que l'intervalle ne doit pas se chevaucher :
    // deux envois de rappels concurrents enverraient deux fois la même notification.
    if (enCours) return
    enCours = true
    tache()
      .catch((e) => console.log(`${nom} : échec — ${e?.stack ?? e}`))
      .finally(() => {
        enCours = false
      })
  }
}

export function demarrerPlanificateur(): () => void {
  const rappels = setInterval(garder('rappels', envoyerRappels), MINUTE_MS)
  const menage = setInterval(garder('balayage', balayer), HEURE_MS)
  // `unref` : ces minuteries ne doivent pas empêcher le processus de s'arrêter quand
  // le serveur HTTP se ferme.
  rappels.unref()
  menage.unref()
  return () => {
    clearInterval(rappels)
    clearInterval(menage)
  }
}
