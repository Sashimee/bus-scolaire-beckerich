import { useT } from '../i18n'

/**
 * La marque : un bus stylisé, lisible jusqu'à 24 px.
 *
 * Le même dessin existe deux fois de plus, et les trois doivent bouger ensemble :
 * `public/favicon.svg` et le `svg()` de `scripts/build-icones.mjs`, tous deux en
 * couleurs figées parce qu'un favicon et un PNG ne lisent pas de variable CSS. Ici,
 * elles passent par les jetons — c'est la seule des trois qui suive le thème.
 *
 * Le sens du dessin est celui de la charte de la vitrine : la pastille porte l'accent,
 * la carrosserie le fond. Il était inversé avant la refonte.
 */
export function LogoBus() {
  const { t } = useT()

  return (
    <svg
      className="marque__logo"
      viewBox="0 0 512 512"
      role="img"
      aria-label={t('app.titre')}
    >
      <rect width="512" height="512" rx="112" className="marque__pastille" />
      <g className="marque__caisse">
        <rect x="116" y="112" width="280" height="248" rx="44" />
        <rect x="150" y="360" width="52" height="46" rx="16" />
        <rect x="310" y="360" width="52" height="46" rx="16" />
      </g>
      <g className="marque__creux">
        <rect x="152" y="152" width="208" height="104" rx="20" />
        <circle cx="180" cy="306" r="24" />
        <circle cx="332" cy="306" r="24" />
      </g>
    </svg>
  )
}
