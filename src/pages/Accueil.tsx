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
  heureArriveeEffective,
  heureEffective,
  perturbationsDuJour,
  perturbationsDuTrajet,
  type Perturbation,
} from '../lib/urgences'
import type { ContexteEnfant } from '../lib/plan'
import type { Trajet } from '../lib/types'

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
 * Les trajets qui restent à venir aujourd'hui, dans l'ordre.
 *
 * Un trajet annulé disparaît de la liste : afficher l'heure d'un bus qui ne passera pas
 * est pire que ne rien afficher, et le bandeau de perturbation en tête de page dit déjà
 * ce qui se passe.
 */
function etapesRestantes(trajets: Trajet[], perturbations: Perturbation[], maintenant: Date): Etape[] {
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes()

  return trajets
    .filter((x) => x.concerneParent)
    .flatMap((trajet) => {
      const concernees = perturbationsDuTrajet(perturbations, trajet)
      if (concernees.some((p) => p.type === 'annulation')) return []

      const heure = heureUtile(trajet)
      const effective = heureUtileEffective(trajet, concernees) ?? heure
      if (heure === null || effective === null) return []

      const h = enMinutes(effective)
      if (h === null || h < minutes) return []
      return [{ trajet, heure, effective }]
    })
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

function CarteEnfant({ ctx, maintenant }: { ctx: ContexteEnfant; maintenant: Date }) {
  const { t } = useT()
  const { urgences } = useUrgences()
  const jour = jourDeSemaine(maintenant)
  const journee = jour ? trajetsDuJour(ctx, jour) : null

  const perturbations = perturbationsDuJour(urgences, maintenant)
  const restantes = journee ? etapesRestantes(journee.trajets, perturbations, maintenant) : []
  const [suivante, ...suivantes] = restantes

  const minutesAvant = suivante
    ? enMinutes(suivante.effective)! - (maintenant.getHours() * 60 + maintenant.getMinutes()) - ctx.temps
    : 0

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
          {suivante ? (
            <>
              <ProchainDepart etape={suivante} minutesAvant={minutesAvant} />
              <p>{t(`trajets.${suivante.trajet.type}`)}</p>
            </>
          ) : (
            jour && (
              <div className="rangee">
                <span className="etiquette etiquette--succes">{t('aujourdhui.plusDeBus')}</span>
              </div>
            )
          )}

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

          {/* Le reste de la journée : présent, mais sans jamais concurrencer l'heure. */}
          {suivantes.length > 0 && (
            <ul className="puces-trajets liste-nue">
              {suivantes.map((e, i) => (
                <li className="etiquette etiquette--heure" key={`${e.trajet.type}-${i}`}>
                  {e.effective} {t(`trajets.${e.trajet.type}`)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Link to={`/enfant/${ctx.enfant.id}`} className="bouton">
        {t('enfant.voirSemaine')}
      </Link>
    </article>
  )
}

export function Accueil() {
  const { t } = useT()
  const { foyer, contextes, configure } = useFoyer()
  const maintenant = new Date()
  const etat = etatDuJour(maintenant)

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

        {!etat.ecole && (
          <div className="encart encart--info">
            <div className="encart__titre">{t('aujourdhui.pasEcole')}</div>
            {etat.raison === 'weekend' && t('aujourdhui.raisonWeekend')}
            {etat.raison === 'vacances' &&
              t('aujourdhui.raisonVacances', { periode: t(`vacances.${etat.id}`) })}
            {etat.raison === 'ferie' &&
              t('aujourdhui.raisonFerie', { jour: t(`feries.${etat.id}`) })}
            {etat.raison === 'annee-inconnue' && t('aujourdhui.raisonInconnue')}
          </div>
        )}

        {etat.ecole && (
          <div className="grille-enfants">
            {foyer.enfants.map((e) => {
              const ctx = contextes.get(e.id)
              return ctx ? (
                <CarteEnfant key={e.id} ctx={ctx} maintenant={maintenant} />
              ) : (
                <div className="carte encart--alerte" key={e.id}>
                  <strong>{e.prenom}</strong> — {t('enfant.aucunArret')}
                </div>
              )
            })}
          </div>
        )}

        {!etat.ecole &&
          foyer.enfants.map((e) => {
            const ctx = contextes.get(e.id)
            return ctx ? (
              <article className="carte rangee rangee--espacee" key={e.id}>
                <span>
                  <strong>{e.prenom}</strong>{' '}
                  <span className="champ__aide">{t(`cycles.${e.cycle}`)}</span>
                </span>
                <Link to={`/enfant/${e.id}`} className="bouton bouton--discret">
                  {t('enfant.voirSemaine')}
                </Link>
              </article>
            ) : null
          })}

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
