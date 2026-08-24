import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initialiserHoraires } from './lib/horaires'
import { mesurer } from './lib/mesure'
import { FournisseurTraduction } from './i18n'
import { FournisseurFoyer } from './etat'
import { FournisseurUrgences } from './urgences-contexte'
import { FournisseurRechargement } from './rechargement-contexte'
import { FournisseurInstallation } from './installation-contexte'
// Avant la feuille principale : les `@font-face` doivent être connues quand la couche
// `base` désigne les familles.
import './polices.css'
import './index.css'

// GitHub Pages sert `404.html` pour toute route inconnue. Celui-ci mémorise le chemin
// demandé puis revient à la racine : on le restaure ici pour que l'ouverture directe
// d'un lien profond, ou son rechargement, aboutisse à la bonne page.
const redirection = sessionStorage.getItem('redirection')
if (redirection) {
  sessionStorage.removeItem('redirection')
  const interne = redirection.slice(import.meta.env.BASE_URL.length - 1)
  if (interne && interne !== window.location.pathname) {
    history.replaceState(null, '', import.meta.env.BASE_URL.replace(/\/$/, '') + interne)
  }
}

// Le plan publié en base, s'il existe, est adopté AVANT le premier rendu : le moteur lit
// alors la bonne version sans qu'aucune signature ne change. Hors ligne ou sans serveur,
// le repli (cache, puis fichier embarqué) est déjà en place, et le fetch échoue vite.
initialiserHoraires().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* Le préfixe vient de la configuration de build : le site doit pouvoir être
          servi sous n'importe quel chemin sans modification du code. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <FournisseurTraduction>
          <FournisseurRechargement>
            <FournisseurUrgences>
              <FournisseurFoyer>
                <FournisseurInstallation>
                  <App />
                </FournisseurInstallation>
              </FournisseurFoyer>
            </FournisseurUrgences>
          </FournisseurRechargement>
        </FournisseurTraduction>
      </BrowserRouter>
    </StrictMode>,
  )
  // Un relevé de visite, une seule fois, après le rendu : auto-hébergé, il ne part que
  // si un serveur est configuré et n'emporte que le chemin d'arrivée.
  mesurer()
})
