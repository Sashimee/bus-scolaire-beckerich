import { Link, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { JourneeTrajets } from '../composants/Trajets'
import { CarteTrajet } from '../composants/CarteTrajet'
import { genererIcs } from '../lib/calendrier'
import { semaineEnfant } from '../lib/plan'
import { distanceLisible, nomArret, nomArretParId } from '../lib/affichage'
import { siteDuCycle } from '../lib/donnees'
import { JOURS } from '../lib/types'

/** Fiche d'un enfant, organisée en semaine : les trajets diffèrent d'un jour à l'autre. */
export function Semaine() {
  const { t } = useT()
  const { id } = useParams()
  const { foyer, contextes } = useFoyer()

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

  const telechargerIcs = () => {
    const ics = genererIcs(ctx, {
      libelleTrajet: (trajet) => t(`trajets.${trajet.type}`),
      nomArret: (idArret) => nomArretParId(idArret, t),
      minutesMarche: ctx.temps,
    })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `bus-${enfant.prenom.toLowerCase().replace(/\W+/g, '-')}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pile pile--large enfant-imprimable">
      <header className="pile pile--serre">
        <div className="rangee" style={{ justifyContent: 'space-between' }}>
          <h2>{enfant.prenom}</h2>
          <span className="etiquette">{t(`cycles.${enfant.cycle}`)}</span>
        </div>
        <p className="champ__aide">
          {t('enfant.scolariseA', { site: siteDuCycle(enfant.cycle).nom })}
        </p>
      </header>

      <section className="carte pile pile--serre">
        <div className="etiquette">{t('enfant.arretLePlusProche')}</div>
        <strong style={{ fontSize: '1.05rem' }}>{nomArret(ctx.arretDomicile, t)}</strong>
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

      {JOURS.map((jour) => {
        const journee = semaine.find((j) => j.jour === jour)!
        return (
          <section className="carte pile pile--serre" key={jour}>
            <div className="rangee" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1rem' }}>{t(`jours.${jour}`)}</h3>
              <span className="etiquette">{t(`repas.${enfant.repas[jour]}Court`)}</span>
            </div>
            <JourneeTrajets journee={journee} />
          </section>
        )
      })}

      <section className="pile pile--serre sans-impression">
        <h3 style={{ fontSize: '1rem' }}>{t('calendrier.titre')}</h3>
        <button type="button" className="bouton bouton--primaire" onClick={telechargerIcs}>
          {t('calendrier.ics')}
        </button>
        <p className="champ__aide">{t('calendrier.icsAide')}</p>
        <button type="button" className="bouton" onClick={() => window.print()}>
          {t('impression.bouton')}
        </button>
        <p className="champ__aide">{t('impression.aide')}</p>
        <Link to="/configurer" className="bouton bouton--discret">
          {t('repas.titre')}
        </Link>
      </section>
    </div>
  )
}
