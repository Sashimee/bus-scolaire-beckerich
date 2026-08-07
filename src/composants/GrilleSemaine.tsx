import { useT } from '../i18n'
import { coursApresMidi } from '../lib/plan'
import type { Enfant, Jour, RepasMidi, UsageBus } from '../lib/types'
import { JOURS, USAGES_BUS } from '../lib/types'

interface Props {
  enfant: Enfant
  onRepas: (jour: Jour, repas: RepasMidi) => void
  onRepasSemaine: (repas: RepasMidi) => void
  onBus: (jour: Jour, usage: UsageBus) => void
  onBusSemaine: (usage: UsageBus) => void
}

/**
 * Réglages hebdomadaires d'un enfant : où il déjeune, et dans quelle mesure il prend
 * le bus, jour par jour.
 *
 * Ce sont les deux réglages qui déterminent réellement ses trajets. Ils varient d'un
 * jour à l'autre dans beaucoup de familles — inscription au Dillendapp certains jours,
 * dépose en voiture le matin — d'où une grille et non deux cases à cocher. Les
 * raccourcis « toute la semaine » couvrent le cas simple sans imposer dix réglages.
 */
export function GrilleSemaine({ enfant, onRepas, onRepasSemaine, onBus, onBusSemaine }: Props) {
  const { t } = useT()
  const bus = (jour: Jour): UsageBus => enfant.bus?.[jour] ?? 'aller-retour'

  return (
    <div className="pile pile--serre">
      <fieldset className="fieldset-nu">
        <legend className="legende">{t('repas.titre')}</legend>
        <p className="champ__aide">{t('repas.aide')}</p>
      </fieldset>

      <div className="grille-semaine">
        <div className="grille-semaine__entete" aria-hidden="true">
          <span />
          <span>{t('repas.titre')}</span>
          <span>{t('bus.titre')}</span>
        </div>

        {JOURS.map((jour) => (
          <div className="grille-semaine__jour" key={jour}>
            <span className="grille-semaine__nom" id={`${enfant.id}-${jour}`}>
              {t(`jours.${jour}`)}
              {!coursApresMidi(jour) && <small>{t('repas.sansCoursApresMidi')}</small>}
            </span>

            <div
              className="bascule"
              role="group"
              aria-labelledby={`${enfant.id}-${jour} ${enfant.id}-titre-repas`}
            >
              {(['maison', 'dillendapp'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={enfant.repas[jour] === option}
                  onClick={() => onRepas(jour, option)}
                >
                  {t(`repas.${option}Court`)}
                </button>
              ))}
            </div>

            <div className="champ">
              <label className="visuellement-cache" htmlFor={`${enfant.id}-bus-${jour}`}>
                {t('bus.pourJour', { jour: t(`jours.${jour}`) })}
              </label>
              <select
                id={`${enfant.id}-bus-${jour}`}
                value={bus(jour)}
                onChange={(e) => onBus(jour, e.target.value as UsageBus)}
              >
                {USAGES_BUS.map((u) => (
                  <option key={u} value={u}>
                    {t(`bus.${u}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <p className="champ__aide">{t('bus.aide')}</p>

      <div className="rangee">
        <span className="champ__aide">{t('repas.touteLaSemaine')} :</span>
        {(['maison', 'dillendapp'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className="bouton bouton--discret"
            onClick={() => onRepasSemaine(option)}
          >
            {t(`repas.${option}Court`)}
          </button>
        ))}
      </div>

      <div className="rangee">
        <label className="champ__aide" htmlFor={`${enfant.id}-bus-semaine`}>
          {t('bus.touteLaSemaine')}
        </label>
        <select
          id={`${enfant.id}-bus-semaine`}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onBusSemaine(e.target.value as UsageBus)
            e.target.value = ''
          }}
        >
          <option value="">…</option>
          {USAGES_BUS.map((u) => (
            <option key={u} value={u}>
              {t(`bus.${u}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
