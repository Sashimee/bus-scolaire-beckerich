import { Link } from 'react-router-dom'
import { useT } from '../i18n'

/**
 * Avertissement d'indépendance présenté au premier lancement.
 *
 * Il doit être vu avant toute utilisation : un parent ne doit pas pouvoir croire une
 * seule seconde qu'il consulte un site officiel de la commune. C'est pour cette raison
 * qu'il passe avant tout autre bandeau dans `PileBandeaux`, qui décide seul de son
 * affichage — ce composant ne fait que le rendre.
 */
export function AvertissementInitial({ onAccepter }: { onAccepter: () => void }) {
  const { t } = useT()

  return (
    <div className="carte carte--accent carte--surelevee pile" role="group" aria-labelledby="avert-titre">
      <h2 id="avert-titre" className="titre-carte">
        {t('avertissement.titre')}
      </h2>
      <p>
        <strong>{t('avertissement.independance')}</strong>
      </p>
      <p>{t('avertissement.modification')}</p>
      <p>{t('avertissement.effort')}</p>
      <p>{t('avertissement.priorite')}</p>
      <div className="rangee">
        <button type="button" className="bouton bouton--primaire" onClick={onAccepter}>
          {t('avertissement.accepter')}
        </button>
        <Link to="/limites" className="bouton bouton--discret">
          {t('avertissement.detail')}
        </Link>
      </div>
    </div>
  )
}
