import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Onglets } from '../composants/Onglets'
import { EditeurCredits } from '../composants/EditeurCredits'
import { EditeurArrets } from '../composants/EditeurArrets'
import { EditeurPerturbations } from '../composants/EditeurPerturbations'
import { EditeurHoraires } from '../composants/EditeurHoraires'
import { EditeurTraductions } from '../composants/EditeurTraductions'
import {
  chargerSession,
  comptesConfigures,
  lireCreditsEnLigne,
  publierCredits,
} from '../lib/comptes'
import { publierTraductions } from '../lib/edition'

/**
 * Édition gardée par CAPACITÉ. Un seul espace, un seul compte : crédits, corrections
 * d'arrêts, perturbations, horaires et traductions y vivent en onglets, chacun visible
 * seulement à qui porte la capacité correspondante — et le serveur la revérifie de toute
 * façon à chaque requête. C'est ici que se sont repliés l'ancien `/admin` (jeton GitHub)
 * ET les espaces `/commune` et `/traductions` (code personnel) : plus qu'une porte.
 */
export function Edition() {
  const { t, surcouche } = useT()
  const [session] = useState(chargerSession)

  if (!comptesConfigures()) {
    return (
      <div className="pile">
        <h2>{t('edition.titre')}</h2>
        <div className="encart encart--attention">{t('comptes.nonConfigure')}</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="pile">
        <h2>{t('edition.titre')}</h2>
        <div className="encart encart--attention">
          {t('comptes.erreur.session-expiree', {})}
        </div>
        <Link to="/connexion" className="bouton">
          {t('comptes.allerConnexion')}
        </Link>
      </div>
    )
  }

  const onglets = []
  if (session.capacites.includes('perturbations')) {
    onglets.push({
      cle: 'perturbations',
      libelle: t('comptes.capacite.perturbations'),
      contenu: <EditeurPerturbations session={session} />,
    })
  }
  if (session.capacites.includes('horaires')) {
    onglets.push({
      cle: 'horaires',
      libelle: t('comptes.capacite.horaires'),
      contenu: <EditeurHoraires session={session} />,
    })
  }
  if (session.capacites.includes('traductions')) {
    onglets.push({
      cle: 'traductions',
      libelle: t('comptes.capacite.traductions'),
      contenu: (
        <EditeurTraductions
          surcouche={surcouche}
          publier={(langue, modifications) => publierTraductions(session, langue, modifications)}
        />
      ),
    })
  }
  if (session.capacites.includes('credits')) {
    onglets.push({
      cle: 'credits',
      libelle: t('comptes.capacite.credits'),
      contenu: (
        <EditeurCredits
          charger={lireCreditsEnLigne}
          publier={(credits) => publierCredits(session, credits)}
        />
      ),
    })
  }
  if (session.capacites.includes('arrets')) {
    onglets.push({
      cle: 'arrets',
      libelle: t('comptes.capacite.arrets'),
      contenu: <EditeurArrets session={session} />,
    })
  }

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('edition.titre')}</h2>
        <Link to="/connexion" className="bouton bouton--discret">
          {t('comptes.titre')}
        </Link>
      </header>

      {onglets.length === 0 ? (
        <div className="encart encart--attention">{t('comptes.aucunDroit')}</div>
      ) : (
        <Onglets onglets={onglets} />
      )}
    </div>
  )
}
