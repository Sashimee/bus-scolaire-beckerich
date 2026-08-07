import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { useT } from './i18n'
import { useFoyer } from './etat'
import { plan } from './lib/donnees'
import { planPerime } from './lib/affichage'
import { BandeauVersion } from './composants/BandeauVersion'
import { AvertissementInitial } from './composants/AvertissementInitial'
import { ReceptionPartage } from './composants/ReceptionPartage'
import { Accueil } from './pages/Accueil'
import { Configurer } from './pages/Configurer'
import { Semaine } from './pages/Semaine'
import { PagePlan } from './pages/Plan'
import { Limites, Independance } from './pages/Infos'
import { Installer } from './pages/Installer'
import { Reglages } from './pages/Reglages'
import { Admin } from './pages/Admin'
import { BandeauUrgences } from './composants/BandeauUrgences'

export default function App() {
  const { t } = useT()
  const { configure } = useFoyer()

  return (
    <>
      <a className="saut-contenu bouton" href="#contenu">
        {t('nav.menu')}
      </a>

      <BandeauVersion />
      {planPerime() && (
        <div className="bandeau" role="status">
          <div className="bandeau__interne">
            <strong>⚠</strong>
            <span>{t('validite.perime', { fin: plan.valideAu })}</span>
          </div>
        </div>
      )}

      <header className="entete">
        <div className="entete__interne">
          <h1 className="entete__titre">
            <Link to="/">{t('app.court')}</Link>
          </h1>
          <nav className="rangee" aria-label={t('nav.menu')}>
            {configure && (
              <NavLink to="/" className="bouton bouton--discret" end>
                {t('nav.accueil')}
              </NavLink>
            )}
            <NavLink to="/reglages" className="bouton bouton--discret">
              {t('nav.reglages')}
            </NavLink>
          </nav>
        </div>
      </header>

      <AvertissementInitial />
      <BandeauUrgences />
      <ReceptionPartage />

      <main className="page" id="contenu">
        <Routes>
          <Route path="/" element={<Accueil />} />
          <Route path="/configurer" element={<Configurer />} />
          <Route path="/enfant/:id" element={<Semaine />} />
          <Route path="/plan" element={<PagePlan />} />
          <Route path="/limites" element={<Limites />} />
          <Route path="/independance" element={<Independance />} />
          <Route path="/installer" element={<Installer />} />
          <Route path="/reglages" element={<Reglages />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Accueil />} />
        </Routes>

        <footer className="pied">
          <nav aria-label={t('nav.menu')}>
            <Link to="/plan">{t('nav.plan')}</Link>
            <Link to="/limites">{t('nav.limites')}</Link>
            <Link to="/independance">{t('nav.independance')}</Link>
            <Link to="/installer">{t('nav.installer')}</Link>
          </nav>
          <p>{t('avertissement.independance')}</p>
          <p>
            {t('validite.couverte', { annees: plan.anneesCouvertes.join(' · ') })} —{' '}
            {t('validite.releve', { date: plan.source.dateReleve })} —{' '}
            {t('maj.version', { version: __VERSION__ })}
          </p>
        </footer>
      </main>
    </>
  )
}
