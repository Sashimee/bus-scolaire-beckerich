import { Link, Route, Routes } from 'react-router-dom'
import { useT } from './i18n'
import { plan } from './lib/donnees'
import { PileBandeaux } from './composants/Bandeaux'
import { InvitationInstallation } from './composants/InvitationInstallation'
import { NavigationBasse, NavigationHaute } from './composants/Navigation'
import { Accueil } from './pages/Accueil'
import { Configurer } from './pages/Configurer'
import { Semaine } from './pages/Semaine'
import { AssistantEnfant } from './pages/AssistantEnfant'
import { PagePlan } from './pages/Plan'
import { Limites, Independance } from './pages/Infos'
import { Installer } from './pages/Installer'
import { Agenda } from './pages/Agenda'
import { Reglages } from './pages/Reglages'
import { Admin } from './pages/Admin'
import { Commune } from './pages/Commune'
import { CommuneAlertes } from './pages/CommuneAlertes'
import { CommuneHoraires } from './pages/CommuneHoraires'

export default function App() {
  const { t } = useT()

  return (
    <>
      <a className="saut-contenu bouton" href="#contenu">
        {t('nav.menu')}
      </a>

      <header className="entete">
        <div className="entete__interne">
          <h1 className="entete__titre">
            <Link to="/">{t('app.court')}</Link>
          </h1>
          <NavigationHaute />
        </div>
      </header>

      <PileBandeaux />

      <main className="page" id="contenu">
        <Routes>
          <Route path="/" element={<Accueil />} />
          <Route path="/configurer" element={<Configurer />} />
          <Route path="/enfant/:id" element={<Semaine />} />
          <Route path="/enfant/:id/assistant" element={<AssistantEnfant />} />
          <Route path="/plan" element={<PagePlan />} />
          <Route path="/limites" element={<Limites />} />
          <Route path="/independance" element={<Independance />} />
          <Route path="/installer" element={<Installer />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/reglages" element={<Reglages />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/commune" element={<Commune />} />
          <Route path="/commune/alertes" element={<CommuneAlertes />} />
          <Route path="/commune/horaires" element={<CommuneHoraires />} />
          <Route path="*" element={<Accueil />} />
        </Routes>

        <footer className="pied">
          <nav aria-label={t('nav.menu')}>
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

      <NavigationBasse />
      <InvitationInstallation />
    </>
  )
}
