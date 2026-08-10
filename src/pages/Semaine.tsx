import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { useInstallation } from '../installation-contexte'
import { JourneeTrajets } from '../composants/Trajets'
import { CarteTrajet } from '../composants/CarteTrajet'
import { FicheImprimable } from '../composants/FicheImprimable'
import { datesDeLaSemaine } from '../lib/calendrier'
import { semaineEnfant } from '../lib/plan'
import { distanceLisible, nomArret } from '../lib/affichage'
import { siteDuCycle, transportALaDemande } from '../lib/donnees'
import { JOURS } from '../lib/types'
import { useUrgences } from '../urgences-contexte'
import { perturbationsDuJour } from '../lib/urgences'

/** Fiche d'un enfant, organisée en semaine : les trajets diffèrent d'un jour à l'autre. */
export function Semaine() {
  const { t } = useT()
  const { id } = useParams()
  const { foyer, contextes } = useFoyer()
  // Posé par `/configurer` quand l'enfant vient d'être calqué sur son aîné.
  const repriseDe = (useLocation().state as { repriseDe?: string } | null)?.repriseDe
  const { urgences } = useUrgences()
  const { noterFicheVue } = useInstallation()

  // Consulter la semaine d'un enfant, c'est se servir de l'application pour de bon :
  // c'est à partir de là qu'une invitation à l'installer a du sens.
  useEffect(() => {
    noterFicheVue()
  }, [noterFicheVue])
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

  // Les jours où le parent dépose ou récupère lui-même l'enfant à la maison relais.
  const presences = semaine
    .map((j) => ({
      jour: j.jour,
      depose: j.depose?.heure ?? null,
      recuperation: j.recuperation?.heure ?? null,
    }))
    .filter((p) => p.depose || p.recuperation)

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

      {/*
          L'agenda, en haut ET en bas. C'est le geste qui dispense de revenir sur cette
          page : celui qui y pense le fait en arrivant, celui qui a d'abord lu sa semaine
          le trouve en repartant. Un lien discret en pied de page ne se voyait ni dans un
          cas ni dans l'autre.
      */}
      {!aPied && (
        <Link to="/agenda" className="bouton bouton--primaire sans-impression">
          {t('agenda.lienDepuisFiche')}
        </Link>
      )}

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

      {/*
          Un enfant calqué sur son aîné n'a pas parcouru l'assistant : il faut lui dire
          d'où viennent ces horaires, et surtout que le CYCLE a pu tout déplacer — école,
          arrêt, heures possibles au Dillendapp.
      */}
      {repriseDe && (
        <div className="encart encart--info sans-impression">
          <div className="encart__titre">{t('enfant.repriseTitre', { prenom: repriseDe })}</div>
          <p>{t('enfant.repriseDetail')}</p>
          <Link to={`/enfant/${enfant.id}/assistant`}>{t('assistant.reprendre')}</Link>
        </div>
      )}

      {/*
          Ce que le parent doit faire lui-même, d'un coup d'œil. Ces heures ne se
          lisaient qu'en parcourant les cinq journées une à une : c'est précisément
          l'information qu'on oublie, et elle demande d'être quelque part en voiture.
      */}
      {!aPied && presences.length > 0 && (
        <section className="carte pile pile--serre">
          <h3 className="titre-carte">{t('dillendapp.titre')}</h3>
          <ul className="liste-nue pile pile--serre">
            {presences.map(({ jour, depose, recuperation }) => (
              <li key={jour} className="rangee rangee--espacee">
                <span className="texte-fort">{t(`jours.${jour}`)}</span>
                <span className="rangee">
                  {depose && (
                    <span className="etiquette">
                      {t('dillendapp.aDeposer')} · {depose}
                    </span>
                  )}
                  {recuperation && (
                    <span className="etiquette">
                      {t('dillendapp.aRecuperer')} · {recuperation}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/*
              Seulement quand le parent doit VENIR CHERCHER l'enfant : c'est là que la
              question « et si je ne peux pas ? » se pose, et elle se pose la veille au
              soir, pas le matin même. On ne dit rien des tarifs, des zones ni du délai
              exact — ce service n'est pas le nôtre et l'afficher faux serait pire que
              de ne rien dire.
          */}
          {presences.some((p) => p.recuperation) && (
            <div className="encart encart--info">
              <div className="encart__titre">{t('dillendapp.transportTitre')}</div>
              <p>{t('dillendapp.transportDetail', { nom: transportALaDemande.nom })}</p>
              <a href={transportALaDemande.url} target="_blank" rel="noopener noreferrer">
                {t('dillendapp.transportLien', { nom: transportALaDemande.nom })}
              </a>
            </div>
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

      {/* Là où le parent lit vraiment les heures. Une ligne discrète, mais elle doit
          y être : l'application affiche des horaires, elle n'en garantit aucun. */}
      {!aPied && (
        <div className="encart encart--attention">
          <div className="encart__titre">{t('plan.avertissementHoraires')}</div>
          <p>{t('plan.avertissementHorairesDetail')}</p>
        </div>
      )}

      {/*
          Ce qu'on emporte de cette page, et rien d'autre : la feuille pour le frigo et
          l'agenda du téléphone. Le réglage des repas et l'assistant vivent sur la page
          des enfants, d'où ils se règlent ; le lien de partage, sur les réglages, avec
          la mention de confidentialité qui doit l'accompagner.
      */}
      <section className="pile pile--serre sans-impression">
        <h3 className="titre-carte">{aPied ? t('impression.titre') : t('calendrier.titre')}</h3>
        {!aPied && (
          <Link to="/agenda" className="bouton bouton--primaire">
            {t('agenda.lienDepuisFiche')}
          </Link>
        )}
        <button type="button" className="bouton" onClick={() => window.print()}>
          {t('impression.bouton')}
        </button>
        <p className="champ__aide">{t('impression.aide')}</p>
      </section>
    </div>
    </>
  )
}
