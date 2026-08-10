import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { FicheFoyer } from '../composants/FicheFoyer'
import { useFoyer } from '../etat'
import { useUrgences } from '../urgences-contexte'
import { etatDuJour, jourDeSemaine } from '../lib/calendrier'
import { enMinutes, trajetsDuJour } from '../lib/plan'
import { distanceLisible, nomArret, sensTrajet } from '../lib/affichage'
import { siteDuCycle } from '../lib/donnees'
import {
  dateSimulee,
  definirValeurSimulee,
  maintenantSimule,
  simulationActive,
  valeurSimulee,
} from '../lib/simulation'
import {
  heureArriveeEffective,
  heureEffective,
  perturbationsDuJour,
  perturbationsDuTrajet,
  type Perturbation,
} from '../lib/urgences'
import type { EtatJour } from '../lib/calendrier'
import type { ContexteEnfant } from '../lib/plan'
import type { Trajet } from '../lib/types'
import type { Traduction } from '../i18n'

/**
 * L'heure que le parent doit retenir d'un trajet.
 *
 * À l'aller, c'est le départ : c'est là qu'il faut être à l'arrêt. Au retour, c'est
 * l'arrivée — savoir quand le bus quitte l'école ne dit rien à qui attend au bout de la
 * rue. La page « semaine » applique déjà cette règle ; l'écran d'accueil s'en écartait,
 * ce qui n'avait guère de conséquence tant que l'heure y était petite.
 */
function heureUtile(trajet: Trajet): string | null {
  return sensTrajet(trajet.type) === 'retour' ? trajet.arrivee.heure : trajet.depart.heure
}

/** La même heure, une fois les perturbations du jour appliquées. */
function heureUtileEffective(trajet: Trajet, perturbations: Perturbation[]): string | null {
  return sensTrajet(trajet.type) === 'retour'
    ? heureArriveeEffective(trajet, perturbations)
    : heureEffective(trajet, perturbations)
}

interface Etape {
  trajet: Trajet
  /** L'heure telle qu'elle est publiée au plan. */
  heure: string
  /** La même, décalée par un retard éventuel. Identique à `heure` en temps normal. */
  effective: string
}

/**
 * Les trajets du jour qui concernent le parent, dans l'ordre.
 *
 * Un trajet annulé disparaît de la liste : afficher l'heure d'un bus qui ne passera pas
 * est pire que ne rien afficher, et le bandeau de perturbation en tête de page dit déjà
 * ce qui se passe.
 */
function etapesDuJour(trajets: Trajet[], perturbations: Perturbation[]): Etape[] {
  return trajets
    .filter((x) => x.concerneParent)
    .flatMap((trajet) => {
      const concernees = perturbationsDuTrajet(perturbations, trajet)
      if (concernees.some((p) => p.type === 'annulation')) return []

      const heure = heureUtile(trajet)
      const effective = heureUtileEffective(trajet, concernees) ?? heure
      if (heure === null || effective === null) return []
      return [{ trajet, heure, effective }]
    })
}

/** Ce qui reste à venir : tout ce dont l'heure n'est pas encore passée. */
function restantes(etapes: Etape[], maintenant: Date): Etape[] {
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes()
  return etapes.filter((e) => (enMinutes(e.effective) ?? 0) >= minutes)
}

/** Pourquoi il n'y a pas école, en une phrase. */
function raisonSansEcole(etat: EtatJour, t: Traduction['t']): string {
  if (etat.raison === 'vacances') {
    return t('aujourdhui.raisonVacances', { periode: t(`vacances.${etat.id}`) })
  }
  if (etat.raison === 'ferie') return t('aujourdhui.raisonFerie', { jour: t(`feries.${etat.id}`) })
  if (etat.raison === 'annee-inconnue') return t('aujourdhui.raisonInconnue')
  return t('aujourdhui.raisonWeekend')
}

/**
 * Le prochain départ, en grand.
 *
 * C'est la question que le parent vient poser, et la seule chose que cet écran doive
 * répondre sans être lu. Le délai qui l'accompagne tient compte du temps de marche :
 * « dans 24 min » signifie « il reste 24 minutes avant de devoir sortir », pas « le bus
 * passe dans 24 minutes ».
 */
function ProchainDepart({ etape, minutesAvant }: { etape: Etape; minutesAvant: number }) {
  const { t } = useT()
  const decale = etape.effective !== etape.heure

  return (
    <div className="prochain">
      {decale && <s className="trajet__heure trajet__heure--secondaire">{etape.heure}</s>}
      <strong className="prochain__heure">{etape.effective}</strong>
      {minutesAvant > 0 ? (
        <span className="prochain__delai">{t('aujourdhui.dans', { minutes: minutesAvant })}</span>
      ) : (
        <span className="prochain__maintenant">
          <span className="prochain__signal" aria-hidden="true" />
          {t('aujourdhui.partirMaintenant')}
        </span>
      )}
    </div>
  )
}

/**
 * L'horaire du jour, sous la carte de l'enfant.
 *
 * Il y est TOUJOURS, et c'est le point : le prochain départ répond à « quand faut-il
 * partir ? », mais pas à « et ensuite ? ». Ces heures-là se lisaient auparavant en
 * ouvrant la fiche de la semaine, ou pas du tout les jours sans école — où l'écran ne
 * montrait plus rien.
 *
 * Sans école, la tuile ne disparaît donc pas : elle s'éteint, et la raison vient
 * s'incruster par-dessus. Le parent voit du même coup ce qui aurait eu lieu et pourquoi
 * cela n'a pas lieu, là où le message logeait auparavant en tête de page, loin de
 * l'enfant qu'il concernait.
 */
function HoraireDuJour({
  etapes,
  maintenant,
  ecole,
  raison,
}: {
  etapes: Etape[]
  maintenant: Date
  ecole: boolean
  raison: string
}) {
  const { t } = useT()
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes()

  return (
    <div className={`sous-tuile${ecole ? '' : ' sous-tuile--eteinte'}`}>
      {/*
          L'incrustation vient AVANT les horaires dans le document, alors qu'elle se
          pose par-dessus à l'écran : à la lecture vocale, « pas d'école aujourd'hui »
          doit précéder les heures qu'elle annule, et non les suivre.
      */}
      {!ecole && (
        <div className="sous-tuile__incrustation">
          <strong className="sous-tuile__mention">{t('aujourdhui.pasEcole')}</strong>
          <span className="sous-tuile__raison">{raison}</span>
        </div>
      )}

      <div className="sous-tuile__contenu">
        <span className="sous-tuile__titre">{t('aujourdhui.horaireDuJour')}</span>
        {etapes.length === 0 ? (
          <p className="champ__aide">{t('aujourdhui.aucunTrajet')}</p>
        ) : (
          <ul className="liste-nue sous-tuile__liste">
            {etapes.map((e, i) => (
              <li
                className={`sous-tuile__ligne${
                  ecole && (enMinutes(e.effective) ?? 0) < minutes ? ' sous-tuile__ligne--passee' : ''
                }`}
                key={`${e.trajet.type}-${i}`}
              >
                <span className="sous-tuile__heure">{e.effective}</span>
                <span>{t(`trajets.${e.trajet.type}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CarteEnfant({
  ctx,
  maintenant,
  ecole,
  raison,
}: {
  ctx: ContexteEnfant
  maintenant: Date
  ecole: boolean
  raison: string
}) {
  const { t } = useT()
  const { urgences } = useUrgences()
  const jour = jourDeSemaine(maintenant)
  const journee = jour ? trajetsDuJour(ctx, jour) : null

  const perturbations = perturbationsDuJour(urgences, maintenant)
  const etapes = journee ? etapesDuJour(journee.trajets, perturbations) : []
  const [suivante] = ecole ? restantes(etapes, maintenant) : []

  const minutesAvant = suivante
    ? enMinutes(suivante.effective)! - (maintenant.getHours() * 60 + maintenant.getMinutes()) - ctx.temps
    : 0

  // Un enfant qui va à pied n'a pas d'horaire : sa tuile n'aurait rien à éteindre les
  // jours d'école. Elle reparaît sans école, pour porter la raison comme les autres.
  const montrerHoraire = !ctx.marcheDirecte || !ecole

  return (
    <article className="carte pile pile--serre">
      <div className="rangee rangee--espacee">
        <h3 className="titre-carte">{ctx.enfant.prenom}</h3>
        <span className="etiquette">{t(`cycles.${ctx.enfant.cycle}`)}</span>
      </div>

      <p className="champ__aide">
        {t('enfant.scolariseA', { site: siteDuCycle(ctx.enfant.cycle).nom })}
      </p>

      {ctx.marcheDirecte ? (
        <p>
          <strong>{t('enfant.aPied')}</strong>{' '}
          <span className="champ__aide">
            · {t('enfant.tempsMarcheEstimation', { minutes: ctx.temps })}
          </span>
        </p>
      ) : (
        <>
          {ecole &&
            (suivante ? (
              <>
                <ProchainDepart etape={suivante} minutesAvant={minutesAvant} />
                <p>{t(`trajets.${suivante.trajet.type}`)}</p>
              </>
            ) : (
              <div className="rangee">
                <span className="etiquette etiquette--succes">{t('aujourdhui.plusDeBus')}</span>
              </div>
            ))}

          <p>
            <strong>{nomArret(ctx.arretDomicile, t)}</strong>{' '}
            <span className="champ__aide">
              · {t('enfant.tempsMarcheEstimation', { minutes: ctx.temps })} ·{' '}
              {distanceLisible(ctx.distance)}
            </span>
          </p>

          {ctx.arretDomicile.precision === 'approximative' && (
            <p className="champ__aide">⚠ {t('arrets.precisionApproximative')}</p>
          )}
        </>
      )}

      {montrerHoraire && (
        <HoraireDuJour etapes={etapes} maintenant={maintenant} ecole={ecole} raison={raison} />
      )}

      <Link to={`/enfant/${ctx.enfant.id}`} className="bouton">
        {t('enfant.voirSemaine')}
      </Link>
    </article>
  )
}

/**
 * Le sélecteur de date de mise au point, activé depuis `/admin`.
 *
 * Il ne se montre à personne d'autre : sans la case cochée sur cet appareil, ce bloc
 * n'existe pas. Le rappel « date simulée » l'accompagne toujours — un écran qui ment sur
 * l'heure sans le dire est le meilleur moyen de croire à une panne.
 */
function SelecteurDate({ valeur, onChanger }: { valeur: string; onChanger: (v: string) => void }) {
  const { t } = useT()
  return (
    <section className="carte carte--accent pile pile--serre sans-impression">
      <h3 className="titre-carte">{t('simulation.titre')}</h3>
      <div className="champ">
        <label htmlFor="date-simulee">{t('simulation.date')}</label>
        <input
          id="date-simulee"
          type="datetime-local"
          value={valeur}
          onChange={(e) => onChanger(e.target.value)}
        />
      </div>
      <p className="champ__aide">{t('simulation.aide')}</p>
      {valeur && (
        <button type="button" className="bouton bouton--discret" onClick={() => onChanger('')}>
          {t('simulation.reinitialiser')}
        </button>
      )}
    </section>
  )
}

export function Accueil() {
  const { t } = useT()
  const { foyer, contextes, configure } = useFoyer()
  // Le champ de simulation est la source de l'heure quand il est rempli : l'écran
  // entier doit se recalculer à chaque frappe, d'où l'état plutôt qu'une simple lecture.
  const [simulation, setSimulation] = useState(valeurSimulee)
  const simulable = simulationActive()

  const changerSimulation = (v: string) => {
    definirValeurSimulee(v)
    setSimulation(v)
  }

  const maintenant = simulable ? maintenantSimule() : new Date()
  const etat = etatDuJour(maintenant)
  const raison = raisonSansEcole(etat, t)

  if (!configure) {
    return (
      <div className="pile">
        <h2>{t('onboarding.bienvenue')}</h2>
        <p>{t('onboarding.intro')}</p>
        <Link to="/configurer" className="bouton bouton--primaire">
          {t('onboarding.commencer')}
        </Link>
      </div>
    )
  }

  // Les enfants dont l'arrêt n'a pas pu être calculé n'ont rien à imprimer.
  const calcules = foyer.enfants.map((e) => contextes.get(e.id)).filter((c) => c !== null && c !== undefined)

  return (
    <>
      {/* Mise en page papier, visible uniquement à l'impression. */}
      <FicheFoyer contextes={calcules} />

      <div className="pile pile--large ecran-seulement">
      <section className="pile">
        <h2>{t('aujourdhui.titre')}</h2>

        {simulable && <SelecteurDate valeur={simulation} onChanger={changerSimulation} />}
        {simulable && dateSimulee() && (
          <div className="encart encart--attention">{t('simulation.avertissement')}</div>
        )}

        <div className="grille-enfants">
          {foyer.enfants.map((e) => {
            const ctx = contextes.get(e.id)
            return ctx ? (
              <CarteEnfant
                key={e.id}
                ctx={ctx}
                maintenant={maintenant}
                ecole={etat.ecole}
                raison={raison}
              />
            ) : (
              <div className="carte encart--alerte" key={e.id}>
                <strong>{e.prenom}</strong> — {t('enfant.aucunArret')}
              </div>
            )
          })}
        </div>

        {calcules.length > 1 && (
          <section className="pile pile--serre sans-impression">
            <button type="button" className="bouton" onClick={() => window.print()}>
              {t('impression.famille')}
            </button>
            <p className="champ__aide">{t('impression.familleAide')}</p>
          </section>
        )}
      </section>
      </div>
    </>
  )
}
