import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useT } from './i18n'
import { plan } from './lib/donnees'
import { PileBandeaux } from './composants/Bandeaux'
import { BarriereErreur } from './composants/BarriereErreur'
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
import { Credits } from './pages/Credits'
import { comptesConfigures } from './lib/comptes'

/*
 * Les écrans de publication ne sont pas chargés avec l'application.
 *
 * Ils pèsent quelques milliers de lignes — six éditeurs, les comptes, la connexion —
 * et s'adressent à une poignée de personnes. Tout parent les téléchargeait pourtant
 * avec le reste, sur le réseau du village, pour n'y aller jamais. Ils arrivent
 * désormais quand on les demande ; le service worker les précharge en arrière-plan,
 * si bien qu'ils restent disponibles hors ligne.
 */
const Edition = lazy(() => import('./pages/Edition').then((m) => ({ default: m.Edition })))
const Connexion = lazy(() => import('./pages/Connexion').then((m) => ({ default: m.Connexion })))
const Comptes = lazy(() => import('./pages/Comptes').then((m) => ({ default: m.Comptes })))
const Reinitialiser = lazy(() =>
  import('./pages/Reinitialiser').then((m) => ({ default: m.Reinitialiser })),
)

export default function App() {
  const { t } = useT()
  const { pathname } = useLocation()

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
        {/*
            Une seconde barrière, autour du contenu seul : l'écran d'un enfant peut
            tomber sans emporter l'en-tête ni la navigation, et le parent s'en va vers
            un autre enfant plutôt que de rester bloqué. La clé la remet à zéro à chaque
            changement d'adresse, sans quoi le message de panne survivrait au départ.
        */}
        <BarriereErreur key={pathname}>
          <Suspense fallback={<p className="champ__aide">{t('commun.chargement')}</p>}>
            <Routes>
              <Route path="/" element={<Accueil />} />
              <Route path="/configurer" element={<Configurer />} />
              <Route path="/enfant/:id" element={<Semaine />} />
              <Route path="/enfant/:id/assistant" element={<AssistantEnfant />} />
              <Route path="/plan" element={<PagePlan />} />
              <Route path="/limites" element={<Limites />} />
              <Route path="/independance" element={<Independance />} />
              <Route path="/credits" element={<Credits />} />
              <Route path="/installer" element={<Installer />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/reglages" element={<Reglages />} />
              <Route path="/edition" element={<Edition />} />
              <Route path="/connexion" element={<Connexion />} />
              <Route path="/comptes" element={<Comptes />} />
              <Route path="/reinitialiser" element={<Reinitialiser />} />
              {/* Les espaces à code personnel ont été repliés sur les comptes à capacités :
                  leurs anciennes adresses mènent désormais à l'édition unique, pour ne pas
                  casser un lien noté ou mis en favori. */}
              <Route path="/commune" element={<Navigate to="/edition" replace />} />
              <Route path="/commune/alertes" element={<Navigate to="/edition" replace />} />
              <Route path="/commune/horaires" element={<Navigate to="/edition" replace />} />
              <Route path="/traductions" element={<Navigate to="/edition" replace />} />
              <Route path="*" element={<Accueil />} />
            </Routes>
          </Suspense>
        </BarriereErreur>

        <footer className="pied">
          <nav aria-label={t('nav.menu')}>
            <Link to="/limites">{t('nav.limites')}</Link>
            <Link to="/independance">{t('nav.independance')}</Link>
            <Link to="/credits">{t('nav.credits')}</Link>
            <Link to="/installer">{t('nav.installer')}</Link>
            {/* L'entrée de l'espace agents/commune. Discrète, en pied, et seulement quand
                un serveur est configuré — sinon elle ne mènerait qu'à un « non configuré ».
                Ce n'est pas pour les parents, d'où le libellé explicite et la place en pied. */}
            {comptesConfigures() && <Link to="/connexion">{t('comptes.titre')}</Link>}
          </nav>
          <p>{t('avertissement.independance')}</p>
          <p>
            {/* La borne réelle, et non les années couvertes : le plan s'arrête au
                2026-12-18 pour cause de nouveau campus, alors que 2026/2027 court
                jusqu'en juillet. Afficher les années annonçait 209 jours de trop, et
                `valideAu` n'apparaissait qu'une fois dépassée. R67. */}
            {t('validite.jusquau', { date: plan.valideAu })} —{' '}
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
