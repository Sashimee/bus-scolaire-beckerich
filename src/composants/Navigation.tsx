import { NavLink } from 'react-router-dom'
import { useT } from '../i18n'
import { useInstallation } from '../installation-contexte'

/**
 * Navigation principale.
 *
 * Sur téléphone elle vit en bas de l'écran, à portée de pouce ; à partir de 48rem
 * elle remonte dans l'en-tête. Les deux variantes lisent la même liste, pour qu'une
 * entrée ajoutée un jour ne puisse pas exister d'un côté seulement. C'est la CSS qui
 * n'en montre qu'une à la fois.
 */

type Entree = {
  vers: string
  cle: string
  /** Tracé de l'icône, en viewBox 24×24. Le contour suit `currentColor`. */
  trace: string
  /** `end` évite que « Aujourd'hui » reste actif sur toutes les routes. */
  exact?: boolean
}

const ENTREES: Entree[] = [
  {
    vers: '/',
    cle: 'accueil',
    exact: true,
    trace: 'M5 5h14v15H5zM9 3v4M15 3v4M5 10h14M12 14h.01',
  },
  {
    vers: '/configurer',
    cle: 'enfants',
    trace: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3.5 20a5.5 5.5 0 0111 0M16 12a2.5 2.5 0 100-5M17 20h3.5a4.5 4.5 0 00-3-4.2',
  },
  {
    vers: '/plan',
    cle: 'planCourt',
    trace: 'M5 5h14v10H5zM5 15v3h3v-3M16 15v3h3v-3M5 10h14M9 5v5M15 5v5',
  },
  {
    vers: '/reglages',
    cle: 'reglages',
    trace: 'M4 7h16M4 12h16M4 17h16M9 5v4M16 10v4M7 15v4',
  },
]

/**
 * L'installation, ajoutée en dernière entrée tant qu'elle n'est pas faite.
 *
 * Elle disparaît une fois l'application installée : garder une entrée permanente vers
 * une action déjà accomplie occuperait un cinquième de la barre pour rien.
 */
const ENTREE_INSTALLER: Entree = {
  vers: '/installer',
  // Libellé court : « Installer l'application » déborderait d'une case de barre basse.
  cle: 'installerCourt',
  trace: 'M12 4v10M8 11l4 4 4-4M5 17v2a1 1 0 001 1h12a1 1 0 001-1v-2',
}

function Icone({ trace }: { trace: string }) {
  return (
    <svg className="nav-basse__icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={trace} />
    </svg>
  )
}

/** Variante haute, dans l'en-tête, à partir des écrans larges. */
export function NavigationHaute() {
  const { t } = useT()

  return (
    <nav className="nav-haute" aria-label={t('nav.principale')}>
      {ENTREES.map((e) => (
        <NavLink key={e.vers} to={e.vers} end={e.exact} className="bouton bouton--discret">
          {t(`nav.${e.cle}`)}
        </NavLink>
      ))}
    </nav>
  )
}

/** Variante basse, fixée au bord de l'écran, sur téléphone. */
export function NavigationBasse() {
  const { t } = useT()
  const { installee } = useInstallation()
  const entrees = installee ? ENTREES : [...ENTREES, ENTREE_INSTALLER]

  return (
    <nav className="nav-basse" aria-label={t('nav.principale')}>
      {entrees.map((e) => (
        <NavLink key={e.vers} to={e.vers} end={e.exact} className="nav-basse__lien">
          <Icone trace={e.trace} />
          <span>{t(`nav.${e.cle}`)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
