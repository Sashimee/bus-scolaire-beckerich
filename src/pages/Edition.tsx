import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Onglets } from '../composants/Onglets'
import { EditeurCredits } from '../composants/EditeurCredits'
import { EditeurArrets } from '../composants/EditeurArrets'
import {
  chargerSession,
  comptesConfigures,
  lireCreditsEnLigne,
  publierCredits,
} from '../lib/comptes'

/**
 * Édition gardée par CAPACITÉ (lot 25, 7b) : crédits et corrections d'arrêts, ce que
 * l'ancien `/admin` faisait par jeton GitHub personnel. Chaque onglet n'apparaît qu'à
 * qui porte la capacité correspondante — et le serveur le revérifie de toute façon à
 * chaque requête. Les perturbations, horaires et traductions restent dans `/commune` et
 * `/traductions`.
 */
export function Edition() {
  const { t } = useT()
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
