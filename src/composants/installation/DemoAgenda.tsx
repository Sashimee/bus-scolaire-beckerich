import { useT } from '../../i18n'

/**
 * Démonstration animée de l'import d'un `.ics`, par plateforme.
 *
 * Même parti pris qu'au lot 6 : un SVG écrit à la main, animé par la CSS pour que
 * `prefers-reduced-motion` le fige sur sa dernière image — laquelle montre le
 * calendrier importé, c'est-à-dire le résultat que le parent cherche.
 *
 * Les quatre plateformes partagent le même récit — un fichier, une invite, un
 * calendrier — parce que c'est bien ce qu'elles font ; seul le vocabulaire change, et
 * il vient des dictionnaires.
 */
export function DemoAgenda({ plateforme }: { plateforme: 'ios' | 'android' | 'google' | 'outlook' }) {
  const { t } = useT()
  const bureau = plateforme === 'google' || plateforme === 'outlook'

  return (
    <svg
      className="demo"
      viewBox={bureau ? '0 0 220 150' : '0 0 160 260'}
      role="img"
      aria-label={t(`agenda.${plateforme}`)}
    >
      <rect
        className="demo__appareil"
        x="2"
        y="2"
        width={bureau ? 216 : 156}
        height={bureau ? 146 : 256}
        rx={bureau ? 8 : 18}
      />

      <g className="demo--agenda">
        {/* Le fichier téléchargé, en bas ou dans la barre de téléchargement. */}
        <g className="demo__fichier">
          <rect x={bureau ? 14 : 16} y={bureau ? 116 : 210} width="58" height="22" rx="4" />
          <text className="demo__texte" x={bureau ? 20 : 22} y={bureau ? 130 : 224}>
            bus.ics
          </text>
        </g>

        {/* Le calendrier, une fois l'import accepté. */}
        <g className="demo__panneau demo__panneau--boite">
          <rect
            x={bureau ? 40 : 14}
            y={bureau ? 30 : 40}
            width={bureau ? 140 : 132}
            height={bureau ? 74 : 130}
            rx="6"
          />
          <text
            className="demo__texte demo__texte--titre"
            x={bureau ? 48 : 22}
            y={bureau ? 48 : 60}
          >
            {t('agenda.nomCalendrier')}
          </text>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect
                className="demo__surbrillance"
                x={bureau ? 48 : 22}
                y={(bureau ? 56 : 72) + i * 20}
                width={bureau ? 118 : 112}
                height="14"
                rx="3"
              />
              <text
                className="demo__texte demo__texte--bouton"
                x={bureau ? 52 : 26}
                y={(bureau ? 66 : 82) + i * 20}
              >
                {['07:25', '12:10', '16:10'][i]} {t('agenda.exempleTrajet')}
              </text>
            </g>
          ))}
        </g>

        <circle className="demo__pointeur" r="9" cx="0" cy="0" />
      </g>
    </svg>
  )
}
