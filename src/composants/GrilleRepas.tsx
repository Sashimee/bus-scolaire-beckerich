import { useT } from '../i18n'
import { coursApresMidi } from '../lib/plan'
import type { Enfant, Jour, RepasMidi } from '../lib/types'
import { JOURS } from '../lib/types'

interface Props {
  enfant: Enfant
  onChanger: (jour: Jour, repas: RepasMidi) => void
  onToutChanger: (repas: RepasMidi) => void
}

/**
 * Réglage du repas de midi, jour par jour.
 *
 * C'est le réglage le plus structurant de l'application : selon le jour et ce choix,
 * l'enfant fait deux ou quatre trajets. Le raccourci « toute la semaine » couvre le
 * cas courant sans empêcher un réglage différent chaque jour.
 */
export function GrilleRepas({ enfant, onChanger, onToutChanger }: Props) {
  const { t } = useT()

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, fontSize: '0.9rem', padding: 0 }}>
        {t('repas.titre')}
      </legend>
      <p className="champ__aide" style={{ marginBlockEnd: '0.6rem' }}>
        {t('repas.aide')}
      </p>

      <div className="grille-repas">
        {JOURS.map((jour) => (
          <div className="grille-repas__jour" key={jour}>
            <span className="grille-repas__nom" id={`${enfant.id}-${jour}`}>
              {t(`jours.${jour}`)}
              {!coursApresMidi(jour) && <small>{t('repas.sansCoursApresMidi')}</small>}
            </span>
            <div className="bascule" role="group" aria-labelledby={`${enfant.id}-${jour}`}>
              {(['maison', 'dillendapp'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={enfant.repas[jour] === option}
                  onClick={() => onChanger(jour, option)}
                >
                  {t(`repas.${option}Court`)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rangee" style={{ marginBlockStart: '0.6rem' }}>
        <span className="champ__aide">{t('repas.touteLaSemaine')} :</span>
        {(['maison', 'dillendapp'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className="bouton bouton--discret"
            onClick={() => onToutChanger(option)}
          >
            {t(`repas.${option}Court`)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
