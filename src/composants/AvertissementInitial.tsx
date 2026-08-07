import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { accepterAvertissement, avertissementAccepte } from '../lib/stockage'

/**
 * Avertissement d'indépendance présenté au premier lancement.
 *
 * Il doit être vu avant toute utilisation : un parent ne doit pas pouvoir croire une
 * seule seconde qu'il consulte un site officiel de la commune.
 */
export function AvertissementInitial() {
  const { t } = useT()
  const [vu, setVu] = useState(avertissementAccepte)

  if (vu) return null

  return (
    <div className="page" role="dialog" aria-modal="false" aria-labelledby="avert-titre">
      <div className="carte carte--accent pile">
        <h2 id="avert-titre" style={{ fontSize: '1.1rem' }}>
          {t('avertissement.titre')}
        </h2>
        <p>
          <strong>{t('avertissement.independance')}</strong>
        </p>
        <p>{t('avertissement.modification')}</p>
        <p>{t('avertissement.effort')}</p>
        <p>{t('avertissement.priorite')}</p>
        <div className="rangee">
          <button
            type="button"
            className="bouton bouton--primaire"
            onClick={() => {
              accepterAvertissement()
              setVu(true)
            }}
          >
            {t('avertissement.accepter')}
          </button>
          <Link to="/limites" className="bouton bouton--discret">
            {t('avertissement.detail')}
          </Link>
        </div>
      </div>
    </div>
  )
}
