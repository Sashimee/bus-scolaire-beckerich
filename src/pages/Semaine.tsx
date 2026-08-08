import { Link, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { JourneeTrajets } from '../composants/Trajets'
import { CarteTrajet } from '../composants/CarteTrajet'
import { FicheImprimable } from '../composants/FicheImprimable'
import { ActionsEnfant } from '../composants/ActionsEnfant'
import { datesDeLaSemaine } from '../lib/calendrier'
import { semaineEnfant } from '../lib/plan'
import { distanceLisible, nomArret } from '../lib/affichage'
import { siteDuCycle } from '../lib/donnees'
import { JOURS } from '../lib/types'
import { useUrgences } from '../urgences-contexte'
import { perturbationsDuJour } from '../lib/urgences'

/** Fiche d'un enfant, organisée en semaine : les trajets diffèrent d'un jour à l'autre. */
export function Semaine() {
  const { t } = useT()
  const { id } = useParams()
  const { foyer, contextes } = useFoyer()
  const { urgences } = useUrgences()
  // Les perturbations portent une date ; la fiche raisonne en jours de semaine.
  // On rattache donc chaque jour à sa date réelle dans la semaine en cours.
  const dates = datesDeLaSemaine()

  const enfant = foyer.enfants.find((e) => e.id === id)
  const ctx = id ? contextes.get(id) : null

  if (!enfant) return <p>{t('enfant.aucun')}</p>
  if (!ctx) {
    return (
      <div className="encart encart--alerte">
        <strong>{enfant.prenom}</strong> — {t('enfant.aucunArret')}
      </div>
    )
  }

  const semaine = semaineEnfant(ctx)

  // Un enfant dont l'école est déjà l'arrêt le plus proche ne prend aucun bus. Sans ce
  // cas explicite, la fiche affichait cinq journées vides — « aucun trajet ce jour-là »,
  // répété cinq fois, ce qui se lit comme une panne plutôt que comme une bonne nouvelle.
  const aPied = ctx.marcheDirecte

  return (
    <>
      {/* Mise en page distincte, visible uniquement à l'impression. */}
      <FicheImprimable ctx={ctx} />

      <div className="pile pile--large ecran-seulement">
      <header className="pile pile--serre">
        <div className="rangee rangee--espacee">
          <h2>{enfant.prenom}</h2>
          <span className="etiquette">{t(`cycles.${enfant.cycle}`)}</span>
        </div>
        <p className="champ__aide">
          {t('enfant.scolariseA', { site: siteDuCycle(enfant.cycle).nom })}
        </p>
      </header>

      {aPied ? (
        <section className="carte pile pile--serre">
          <div className="encart encart--info">
            <div className="encart__titre">{t('enfant.aPied')}</div>
            {t('enfant.aPiedDetail', {
              minutes: ctx.temps,
              site: siteDuCycle(enfant.cycle).nom,
              prenom: enfant.prenom,
            })}
          </div>
          {foyer.adresse && <CarteTrajet depuis={foyer.adresse.coord} vers={ctx.arretEcole} />}
        </section>
      ) : (
        <section className="carte pile pile--serre">
          <div className="etiquette">{t('enfant.arretLePlusProche')}</div>
          <strong className="titre-carte">{nomArret(ctx.arretDomicile, t)}</strong>
          <p className="champ__aide">
            {t('enfant.tempsMarcheEstimation', { minutes: ctx.temps })} ·{' '}
            {distanceLisible(ctx.distance)}
          </p>
          {ctx.arretDomicile.precision === 'approximative' && (
            <div className="encart encart--attention">
              <div className="encart__titre">{t('arrets.precisionApproximative')}</div>
              {t('arrets.precisionApproximativeAide')}
            </div>
          )}
          {foyer.adresse && (
            <CarteTrajet depuis={foyer.adresse.coord} vers={ctx.arretDomicile} />
          )}
        </section>
      )}

      {!aPied && JOURS.map((jour) => {
        const journee = semaine.find((j) => j.jour === jour)!
        return (
          <section className="carte pile pile--serre" key={jour}>
            <div className="rangee rangee--espacee">
              <h3 className="titre-carte">{t(`jours.${jour}`)}</h3>
              <span className="rangee">
                <span className="etiquette">{t(`repas.${enfant.repas[jour]}Court`)}</span>
                {(enfant.bus?.[jour] ?? 'aller-retour') !== 'aller-retour' && (
                  <span className="etiquette">
                    {t(`bus.${enfant.bus?.[jour] ?? 'aller-retour'}Court`)}
                  </span>
                )}
              </span>
            </div>
            {(enfant.bus?.[jour] ?? 'aller-retour') === 'aucun' ? (
              <p className="champ__aide">{t('bus.sansBus')}</p>
            ) : (
              <JourneeTrajets
                journee={journee}
                perturbations={perturbationsDuJour(urgences, dates[jour])}
              />
            )}
          </section>
        )
      })}

      <section className="pile pile--serre sans-impression">
        <h3 className="titre-carte">{aPied ? t('impression.titre') : t('calendrier.titre')}</h3>
        <ActionsEnfant ctx={ctx} />
        <Link to={`/enfant/${enfant.id}/assistant`} className="bouton">
          {t('assistant.reprendre')}
        </Link>
        <Link to="/configurer" className="bouton bouton--discret">
          {t('repas.titre')}
        </Link>
      </section>
    </div>
    </>
  )
}
