import { useT } from '../i18n'
import { plan, vacances } from '../lib/donnees'
import { sourceAdresses } from '../lib/adresses'

/** Ce que le site sait faire, et surtout ce qu'il ne sait pas faire. */
export function Limites() {
  const { t } = useT()

  const sections = [
    'marche',
    'arrets',
    'tempsReel',
    'plan',
    'incertitudes',
    'donnees',
  ] as const

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('limites.titre')}</h2>
        <p>{t('limites.intro')}</p>
      </header>

      {sections.map((cle) => (
        <section className="carte pile pile--serre" key={cle}>
          <h3 className="titre-carte">{t(`limites.${cle}Titre`)}</h3>
          <p>{t(`limites.${cle}Corps`)}</p>
        </section>
      ))}

      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('reglages.donnees')}</h3>
        <ul className="liste-puces">
          <li>
            {plan.source.document} — <a href={plan.source.url}>{plan.source.url}</a>
          </li>
          <li>
            {sourceAdresses.jeu} ({sourceAdresses.licence}) —{' '}
            <a href={sourceAdresses.url}>data.public.lu</a>
          </li>
          <li>
            {vacances.source.intitule} — <a href={vacances.source.url}>men.public.lu</a>
          </li>
          <li>OpenStreetMap (ODbL)</li>
        </ul>
      </section>
    </div>
  )
}

/** Mentions d'indépendance. Rendues à partir des données, jamais écrites en dur. */
export function Independance() {
  const { t } = useT()

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('independance.titre')}</h2>
      </header>

      <section className="carte carte--accent pile pile--serre">
        <p>
          <strong>{t('independance.corps1')}</strong>
        </p>
        <p>{t('independance.corps2')}</p>
        <p>{t('independance.corps3')}</p>
        <p>{t('independance.corps4')}</p>
        <p>
          <strong>{t('independance.corps5')}</strong>
        </p>
      </section>

      <section className="rangee">
        <a
          className="bouton bouton--primaire"
          href={plan.source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('independance.lienOfficiel')}
        </a>
        <a
          className="bouton"
          href={`${import.meta.env.BASE_URL}plan-bus-2025-2026.pdf`}
          download
        >
          {t('independance.lienPdf')}
        </a>
        <a
          className="bouton bouton--discret"
          href="https://github.com/Sashimee/bus-scolaire-beckerich/issues/new"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('independance.contact')}
        </a>
      </section>
    </div>
  )
}
