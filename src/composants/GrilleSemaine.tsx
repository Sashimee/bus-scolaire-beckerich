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
  onDillendapp: (jour: Jour, heure: string | null) => void
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
export function GrilleSemaine({
  enfant,
  onRepas,
  onRepasSemaine,
  onBus,
  onBusSemaine,
  onDillendapp,
}: Props) {
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

            {/* La présence prolongée ne se pose que les jours de Dillendapp : on
                n'affiche le champ que là, pour ne pas alourdir la grille. */}
            {enfant.repas[jour] === 'dillendapp' && (
              <div className="grille-semaine__dillendapp">
                <label htmlFor={`${enfant.id}-fin-${jour}`}>{t('dillendapp.jusqua')}</label>
                <input
                  id={`${enfant.id}-fin-${jour}`}
                  type="time"
                  step={300}
                  value={enfant.dillendappJusqua?.[jour] ?? ''}
                  onChange={(e) => onDillendapp(jour, e.target.value || null)}
                />
                {enfant.dillendappJusqua?.[jour] && (
                  <button
                    type="button"
                    className="bouton bouton--discret"
                    onClick={() => onDillendapp(jour, null)}
                  >
                    {t('dillendapp.repartEnBus')}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="champ__aide">{t('bus.aide')}</p>

      {/* Raccourcis : le libellé occupe sa propre ligne, sinon il pousse les boutons
          hors de l'écran sur un téléphone. Ce sont des actions et non un état — pas
          d'`aria-pressed`, la grille au-dessus reste la source de vérité. */}
      <fieldset className="fieldset-nu">
        <legend className="legende" id={`${enfant.id}-repas-semaine`}>
          {t('repas.touteLaSemaine')}
        </legend>
        <div className="segments" role="group" aria-labelledby={`${enfant.id}-repas-semaine`}>
          {(['maison', 'dillendapp'] as const).map((option) => (
            <button key={option} type="button" onClick={() => onRepasSemaine(option)}>
              {t(`repas.${option}Court`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="fieldset-nu">
        <legend className="legende" id={`${enfant.id}-bus-semaine`}>
          {t('bus.touteLaSemaine')}
        </legend>
        <div className="segments" role="group" aria-labelledby={`${enfant.id}-bus-semaine`}>
          {USAGES_BUS.map((u) => (
            <button key={u} type="button" onClick={() => onBusSemaine(u)}>
              {t(`bus.${u}Court`)}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
