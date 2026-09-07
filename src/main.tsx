import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { BarriereErreur } from './composants/BarriereErreur'
import { initialiserHoraires } from './lib/horaires'
import { mesurer } from './lib/mesure'
import { FournisseurTraduction, langueInitiale } from './i18n'
import { chargerDictionnaire } from './i18n/dictionnaires'
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

// Deux choses sont attendues AVANT le premier rendu, et deux seulement.
//
// Le plan publié en base, s'il existe : le moteur lit alors la bonne version sans
// qu'aucune signature ne change. Hors ligne ou sans serveur, le repli (cache, puis
// fichier embarqué) est déjà en place, et le fetch échoue vite.
//
// Le dictionnaire de la langue devinée, qui n'est plus dans le paquet principal :
// rendre sans lui afficherait la page en français avant de la retraduire sous les yeux
// du parent. Il vient d'un morceau local, préchargé par le service worker.
Promise.all([initialiserHoraires(), chargerDictionnaire(langueInitiale())]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* Au-dehors de tout : un fournisseur qui échoue au montage — foyer illisible,
          dictionnaire absent — laisserait sinon un écran blanc sans issue. */}
      <BarriereErreur page>
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
      </BarriereErreur>
    </StrictMode>,
  )
  // Un relevé de visite, une seule fois, après le rendu : auto-hébergé, il ne part que
  // si un serveur est configuré et n'emporte que le chemin d'arrivée.
  mesurer()
})
