import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { FournisseurTraduction } from './i18n'
import { FournisseurFoyer } from './etat'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Le préfixe vient de la configuration de build : le site doit pouvoir être
        servi sous n'importe quel chemin sans modification du code. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <FournisseurTraduction>
        <FournisseurFoyer>
          <App />
        </FournisseurFoyer>
      </FournisseurTraduction>
    </BrowserRouter>
  </StrictMode>,
)
