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
    'notifications',
    'plan',
    'incertitudes',
    'dillendapp',
    'adresses',
    'donnees',
  ] as const

  return (
    <div className="pile pile--large">
      {/*
          Le titre à gauche, ce qu'il annonce à droite : la mise en page d'entrée de
          section de la vitrine. Elle sépare le propos de sa mise en garde, qui se
          lisaient jusqu'ici comme deux paragraphes de même poids.
      */}
      <header className="entete-bande">
        <h2>{t('limites.titre')}</h2>
        <p className="entete-bande__note">{t('limites.intro')}</p>
      </header>

      {/* En tête des limites, parce que c'est la première : un horaire n'est pas une
          promesse, et c'est la commune qui le dit. */}
      <div className="encart encart--attention">
        <div className="encart__titre">{t('plan.avertissementHoraires')}</div>
        <p>{t('plan.avertissementHorairesDetail')}</p>
      </div>

      {/*
          Neuf cartes empilées se lisaient comme neuf annonces successives, et on
          abandonnait à la quatrième. En grille au filet, elles redeviennent ce
          qu'elles sont : une liste de ce que le site ne sait pas faire, qu'on parcourt.
      */}
      <ul className="filets tuiles liste-nue">
        {sections.map((cle) => (
          <li className="filets__case" key={cle}>
            <h3 className="tuile__titre">{t(`limites.${cle}Titre`)}</h3>
            <p className="tuile__texte">{t(`limites.${cle}Corps`)}</p>
          </li>
        ))}
      </ul>

      <section className="bande pile pile--serre">
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
        <span className="etiquette etiquette--mono">{t('app.titre')}</span>
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
