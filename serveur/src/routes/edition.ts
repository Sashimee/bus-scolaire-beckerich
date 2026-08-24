/**
 * Édition gardée par CAPACITÉ : ce que l'ancien `/admin` faisait par jeton GitHub
 * personnel, et ce que les espaces `/commune` et `/traductions` faisaient par code
 * personnel, repliés sur un seul système — les comptes à capacités du lot 24. Chaque
 * route exige une capacité nommée et écrit en base, jamais dans le dépôt.
 *
 * Une capacité par nature de donnée : `credits`, `arrets`, `perturbations`, `horaires`,
 * `traductions`. Le rôle figé d'avant (`commune` valait perturbations + horaires,
 * `traductions` valait traductions) est ainsi subsumé — un compte reçoit exactement ce
 * qu'on lui accorde, ni plus ni moins, et le serveur revérifie la capacité DANS LA BASE
 * à chaque requête : retirer une capacité prend effet tout de suite.
 *
 * Comme partout dans ce serveur, la charge est REVALIDÉE ici quoi qu'ait fait le
 * navigateur — un `curl` parle à ces routes comme le ferait notre client — et l'auteur
 * inscrit au journal est celui de la session, jamais celui que le client prétend.
 */
import type { Context, Hono } from 'hono'
// Mêmes règles que le navigateur, importées et non réécrites : une seconde
// implémentation aurait divergé au premier ajustement.
import { relireCredits } from '../../../src/lib/credits.ts'
import { coordValide, dateIsoValide, texteSur } from '../../../src/lib/nettoyage.ts'
import { validerPlan } from '../../../src/lib/validation.ts'
import { appliquerModifications, relireSurcouche } from '../../../src/lib/traductions.ts'
import { corpsJson } from '../http.ts'
import { exigerCapacite, exigerSession } from './comptes.ts'
import {
  ecrireDocument,
  enregistrerCorrection,
  enregistrerPerturbation,
  lireDocument,
  listerPerturbations,
  supprimerCorrection,
  supprimerPerturbation,
} from '../stockage/publications.ts'
import { base, type Sql } from '../stockage/client.ts'
import { envoyerATous } from '../envois.ts'
import { journaliser, lireJournal } from '../stockage/journal.ts'
import { lireMesures } from '../stockage/mesure.ts'
import { LANGUES, perturbationPropre, validerPerturbation } from '../validation-perturbation.ts'

const TAILLE_CORPS_MAX = 64 * 1024
const TAILLE_PLAN_MAX = 512 * 1024

async function publierCredits(c: Context) {
  const r = await exigerCapacite(c, 'credits')
  if ('refus' in r) return r.refus

  const charge = await corpsJson<{ credits?: unknown }>(c, TAILLE_CORPS_MAX).catch(() => null)
  // Revalidé ici, quoi qu'ait fait le navigateur : `relireCredits` écarte les entrées
  // sans nom, tronque les textes trop longs, et ne garde des liens que ce que la page
  // publique rendra cliquable. C'est la même fonction que l'application, importée.
  const propre = relireCredits(charge?.credits)
  await ecrireDocument('credits', propre, new Date().toISOString())
  await journaliser(r.compte, 'credits', `${propre.developpement.length} dév · ${propre.remerciements.length} remerciements`)
  return c.json({ ok: true, credits: propre })
}

/**
 * Correction de position d'un arrêt (capacité `arrets`), refuge de l'ancien `/admin`.
 * Revalidée par les mêmes garde-fous que le navigateur — un arrêt ne peut être déplacé
 * hors du Luxembourg —, et l'auteur est celui de la session, jamais celui que le client
 * prétend.
 */
async function publierCorrection(c: Context) {
  const r = await exigerCapacite(c, 'arrets')
  if ('refus' in r) return r.refus

  const charge = await corpsJson<{ correction?: Record<string, unknown> }>(c, TAILLE_CORPS_MAX).catch(
    () => null,
  )
  const brut = charge?.correction ?? {}
  const arret = texteSur(brut.arret, 64)
  if (!arret || !coordValide(brut.coord)) return c.json({ erreur: 'charge-invalide' }, 400)

  const correction = {
    arret,
    coord: brut.coord,
    publieLe: new Date().toISOString(),
    publiePar: r.compte.nom,
    ...(dateIsoValide(brut.jusqua) ? { jusqua: brut.jusqua } : {}),
    ...(texteSur(brut.note, 200) ? { note: texteSur(brut.note, 200) } : {}),
  }
  await enregistrerCorrection(arret, correction)
  await journaliser(r.compte, 'correction-arret', `${arret} → ${brut.coord.join(', ')}`)
  return c.json({ ok: true })
}

async function retirerCorrection(c: Context) {
  const r = await exigerCapacite(c, 'arrets')
  if ('refus' in r) return r.refus
  const arret = texteSur(decodeURIComponent(c.req.param('arret') ?? ''), 64)
  if (!arret) return c.json({ erreur: 'arret-invalide' }, 400)
  await supprimerCorrection(arret)
  await journaliser(r.compte, 'correction-retrait', arret)
  return c.json({ ok: true })
}

/**
 * Titres des notifications, par type de perturbation. Repris à l'identique du workflow
 * `notifier.yml` qu'ils remplacent — la publication et l'envoi étaient deux opérations
 * (écriture GitHub, puis Action déclenchée sur push) ; ils n'en font plus qu'une.
 */
const TITRES: Record<string, string> = {
  annulation: 'Bus annulé',
  retard: 'Bus en retard',
  'arret-deplace': 'Arrêt déplacé',
  message: 'Information bus scolaire',
}

/** Publication d'une perturbation (capacité `perturbations`), avec notification à la première pose. */
async function publierPerturbation(c: Context) {
  const r = await exigerCapacite(c, 'perturbations')
  if ('refus' in r) return r.refus

  const charge = await corpsJson<{ perturbation?: Record<string, unknown> }>(c, TAILLE_CORPS_MAX)
  const motifs = validerPerturbation(charge?.perturbation)
  if (motifs.length) return c.json({ erreur: 'charge-invalide', motifs }, 400)

  const p: Record<string, any> = {
    ...perturbationPropre(charge.perturbation as Record<string, unknown>),
    publieLe: new Date().toISOString(),
    // Jamais celui que le client prétend : c'est la session qui fait foi.
    publiePar: r.compte.nom,
  }

  const { nouvelle } = await enregistrerPerturbation(p.id, p)
  await journaliser(r.compte, 'publication', `${p.type} ${p.du}→${p.au} (${p.id})`)

  // Notification : SEULEMENT à la première pose d'un identifiant, et seulement si un
  // message français existe — c'était la règle de `notifier.yml`. Republier une
  // perturbation corrigée ne re-réveille pas les téléphones. L'envoi ne doit pas faire
  // échouer la publication : le bandeau dans l'application reste, quoi qu'il arrive au
  // push. On journalise l'échec, on ne le propage pas.
  let notification: unknown = null
  const notifiee = Boolean(nouvelle && p.message?.fr)
  if (notifiee) {
    notification = await envoyerATous({
      id: p.id,
      titre: TITRES[p.type] ?? 'Bus scolaire Beckerich',
      corps: p.message.fr,
      gravite: p.gravite,
      url: './',
    }).catch((e) => {
      console.log(`notification perturbation ${p.id} : échec — ${e?.stack ?? e}`)
      return { erreur: String(e) }
    })
  }

  const total = (await listerPerturbations()).length
  return c.json({ ok: true, total, notifiee, notification })
}

async function retirerPerturbation(c: Context) {
  const r = await exigerCapacite(c, 'perturbations')
  if ('refus' in r) return r.refus
  const id = decodeURIComponent(c.req.param('id') ?? '')
  if (!texteSur(id, 64)) return c.json({ erreur: 'id-invalide' }, 400)
  // Un retrait ne notifie personne : réveiller tout le monde pour dire qu'une alerte
  // n'a plus lieu d'être serait du bruit.
  await supprimerPerturbation(id)
  await journaliser(r.compte, 'retrait', id)
  const total = (await listerPerturbations()).length
  return c.json({ ok: true, total })
}

/**
 * Remplacement du plan complet (capacité `horaires`).
 *
 * Le serveur revalide le plan avec le MÊME `validerPlan()` que l'application, importé
 * depuis `src/lib/` : une seconde implémentation aurait divergé au premier ajout de
 * règle, et c'est justement ici qu'une divergence coûterait le plus cher.
 */
async function publierHoraires(c: Context) {
  const r = await exigerCapacite(c, 'horaires')
  if ('refus' in r) return r.refus

  const charge = await corpsJson<{ plan?: unknown; resume?: string }>(c, TAILLE_PLAN_MAX)
  const problemes = validerPlan(charge?.plan as never)
  const erreurs = problemes.filter((x) => x.gravite === 'erreur')
  if (erreurs.length) {
    return c.json({ erreur: 'plan-invalide', problemes: erreurs.slice(0, 30) }, 400)
  }

  // Écrit en base, versionné par horodatage : le client compare la version pour décider
  // d'adopter le nouveau plan au prochain démarrage. Plus de reconstruction du site, plus
  // d'écriture dans le dépôt.
  await ecrireDocument('horaires', charge.plan, new Date().toISOString())
  await journaliser(r.compte, 'horaires', charge?.resume ?? '')
  return c.json({
    ok: true,
    avertissements: problemes.filter((x) => x.gravite === 'avertissement'),
  })
}

/**
 * Publication des corrections de traduction (capacité `traductions`).
 *
 * On relit l'état courant SOUS VERROU avant de fusionner : deux traducteurs connectés
 * en même temps ne doivent pas se recouvrir, ce que GitHub assurait autrefois par sa
 * concurrence optimiste (`sha`, 409). On revalide entrée par entrée avec la MÊME règle
 * que le navigateur, importée de `src/lib/traductions.ts`. Une entrée refusée est
 * écartée, les autres passent — le fichier publié ne contient jamais que du recevable.
 */
async function publierTraductions(c: Context) {
  const r = await exigerCapacite(c, 'traductions')
  if ('refus' in r) return r.refus

  const charge = await corpsJson<{ langue?: string; modifications?: Record<string, unknown> }>(
    c,
    TAILLE_CORPS_MAX,
  )
  if (!LANGUES.includes(charge?.langue as string)) {
    return c.json({ erreur: 'charge-invalide', motifs: ['langue'] }, 400)
  }

  // Transaction avec verrou consultatif : la surcouche est relue SOUS verrou, fusionnée,
  // réécrite — ce qui sérialise les publications concurrentes. Le verrou se libère à la
  // fin de la transaction, quoi qu'il arrive.
  const propre = await base().begin(async (tx) => {
    // `tx` (transaction) et `Sql` (pool) partagent l'interface de requête mais pas toute
    // la surface du type : le cast dit ce que le code fait déjà, appeler la même
    // fonction de stockage sous transaction.
    const sousTx = tx as unknown as Sql
    await tx`select pg_advisory_xact_lock(hashtext('document:traductions'))`
    const doc = await lireDocument('traductions', sousTx)
    const fusionnee = appliquerModifications(
      relireSurcouche(doc?.contenu ?? { langues: {} }),
      charge.langue as never,
      (charge.modifications ?? {}) as never,
    )
    await ecrireDocument('traductions', { langues: fusionnee }, new Date().toISOString(), sousTx)
    return fusionnee
  })

  const langues = Object.keys(propre)
  await journaliser(
    r.compte,
    'traductions',
    `${charge.langue} · ${Object.keys(charge.modifications ?? {}).length} clé(s)`,
  )

  // On renvoie l'état fusionné : le client s'en sert comme nouvelle base, plutôt que de
  // rester sur celui qu'il avait chargé à l'ouverture.
  const retenues = langues.reduce(
    (n, l) => n + Object.keys((propre as Record<string, object>)[l]).length,
    0,
  )
  return c.json({ ok: true, retenues, surcouche: propre })
}

/**
 * Journal des publications et des retraits. Lisible par TOUT compte connecté, sans
 * exiger de capacité particulière : voir qui a publié quoi n'est pas un droit d'édition,
 * et le cacher à un éditeur qui n'aurait pas la capacité `comptes` n'ajouterait aucune
 * sûreté — le journal ne contient que ce que ces mêmes éditeurs ont publié.
 */
async function journal(c: Context) {
  const r = await exigerSession(c)
  if ('refus' in r) return r.refus
  return c.json({ entrees: await lireJournal() })
}

/**
 * La fréquentation agrégée (lots 27-28). Lisible par toute session connectée, comme le
 * journal : ce sont des chiffres d'usage, pas un droit d'édition, et rien de personnel
 * n'y figure — la normalisation est faite à l'écriture.
 */
async function mesures(c: Context) {
  const r = await exigerSession(c)
  if ('refus' in r) return r.refus
  const jours = Number(c.req.query('jours') ?? 30)
  return c.json(await lireMesures(Number.isFinite(jours) ? jours : 30))
}

export function monterEdition(app: Hono): void {
  app.post('/edition/credits', publierCredits)
  app.post('/edition/corrections', publierCorrection)
  app.delete('/edition/corrections/:arret', retirerCorrection)
  app.post('/edition/perturbations', publierPerturbation)
  app.delete('/edition/perturbations/:id', retirerPerturbation)
  app.post('/edition/horaires', publierHoraires)
  app.post('/edition/traductions', publierTraductions)
  app.get('/edition/journal', journal)
  app.get('/edition/mesure', mesures)
}
