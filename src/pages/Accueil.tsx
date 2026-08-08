import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { etatDuJour, jourDeSemaine } from '../lib/calendrier'
import { enMinutes, trajetsDuJour } from '../lib/plan'
import { distanceLisible, nomArret } from '../lib/affichage'
import { siteDuCycle } from '../lib/donnees'
import type { ContexteEnfant } from '../lib/plan'
import type { Trajet } from '../lib/types'

/** Le prochain trajet utile au parent, après l'heure courante. */
function prochain(trajets: Trajet[], maintenant: Date): Trajet | null {
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes()
  return (
    trajets
      .filter((x) => x.concerneParent)
      .find((x) => {
        const h = enMinutes(x.depart.heure)
        return h !== null && h >= minutes
      }) ?? null
  )
}

function CarteEnfant({ ctx, maintenant }: { ctx: ContexteEnfant; maintenant: Date }) {
  const { t } = useT()
  const jour = jourDeSemaine(maintenant)
  const journee = jour ? trajetsDuJour(ctx, jour) : null
  const suivant = journee ? prochain(journee.trajets, maintenant) : null

  const minutesAvant = suivant
    ? enMinutes(suivant.depart.heure)! -
      (maintenant.getHours() * 60 + maintenant.getMinutes()) -
      ctx.temps
    : null

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

          {suivant ? (
            <p>
              <strong className="trajet__heure trajet__heure--principale">
                {suivant.depart.heure}
              </strong>{' '}
              {t(`trajets.${suivant.type}`)}
              {minutesAvant !== null && minutesAvant > 0 && (
                <span className="champ__aide"> · {t('aujourdhui.dans', { minutes: minutesAvant })}</span>
              )}
              {minutesAvant !== null && minutesAvant <= 0 && (
                <span className="champ__aide"> · {t('aujourdhui.partirMaintenant')}</span>
              )}
            </p>
          ) : (
            jour && <p className="champ__aide">{t('aujourdhui.plusDeBus')}</p>
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

  return (
    <div className="pile pile--large">
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

        {etat.ecole &&
          foyer.enfants.map((e) => {
            const ctx = contextes.get(e.id)
            return ctx ? (
              <CarteEnfant key={e.id} ctx={ctx} maintenant={maintenant} />
            ) : (
              <div className="carte encart--alerte" key={e.id}>
                <strong>{e.prenom}</strong> — {t('enfant.aucunArret')}
              </div>
            )
          })}

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
      </section>
    </div>
  )
}
