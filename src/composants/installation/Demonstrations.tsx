import { useT } from '../../i18n'

/**
 * Démonstrations animées de l'installation, une par plateforme.
 *
 * Des SVG écrits à la main plutôt que des captures d'écran : quelques kilo-octets au
 * lieu de quelques centaines, nets sur tout écran, traduisibles, et surtout ils ne se
 * périment pas à chaque version d'iOS. Embarquer l'interface d'un tiers dans le dépôt
 * aurait par ailleurs posé une question de droits qu'on s'épargne ici.
 *
 * L'animation est portée par la CSS (couche `composants`), pas par SMIL : c'est ce qui
 * permet à `prefers-reduced-motion` de la figer. Chaque suite d'images se termine sur
 * l'état informatif — menu ouvert, bonne ligne en surbrillance — de sorte qu'une
 * animation figée sur sa dernière image reste une explication complète.
 */

/** Le cadre commun : un téléphone, ou une fenêtre de navigateur. */
function Cadre({
  children,
  titre,
  bureau = false,
}: {
  children: React.ReactNode
  titre: string
  bureau?: boolean
}) {
  return (
    <svg
      className="demo"
      viewBox={bureau ? '0 0 220 150' : '0 0 160 260'}
      role="img"
      aria-label={titre}
    >
      <rect
        className="demo__appareil"
        x="2"
        y="2"
        width={bureau ? 216 : 156}
        height={bureau ? 146 : 256}
        rx={bureau ? 8 : 18}
      />
      {children}
    </svg>
  )
}

/** Le doigt ou le curseur qui montre où appuyer. */
const Pointeur = () => <circle className="demo__pointeur" r="9" cx="0" cy="0" />

/** Une ligne de menu, avec son libellé. */
function LigneMenu({
  y,
  texte,
  large,
  surbrillance = false,
}: {
  y: number
  texte: string
  large: number
  surbrillance?: boolean
}) {
  return (
    <g>
      {surbrillance && <rect className="demo__surbrillance" x="0" y={y - 9} width={large} height="18" rx="3" />}
      <text className="demo__texte" x="6" y={y + 4}>
        {texte}
      </text>
    </g>
  )
}

/** iOS / Safari : bouton Partager en bas, puis « Sur l'écran d'accueil ». */
export function DemoIOS() {
  const { t } = useT()
  return (
    <Cadre titre={t('installer.ios')}>
      <g className="demo--ios">
        <rect className="demo__contenu" x="10" y="14" width="140" height="196" rx="4" />
        <text className="demo__texte demo__texte--titre" x="20" y="40">
          {t('app.court')}
        </text>

        {/* Barre d'outils de Safari, en bas de l'écran comme sur un iPhone récent. */}
        <rect className="demo__barre" x="10" y="218" width="140" height="30" rx="6" />
        <g className="demo__icone-partage">
          <rect x="44" y="226" width="14" height="14" rx="3" />
          <path d="M51 238 v-10 M47 231 l4 -4 l4 4" />
        </g>

        {/* Feuille de partage, qui monte depuis le bas. */}
        <g className="demo__panneau demo__panneau--bas">
          <rect x="10" y="120" width="140" height="128" rx="8" />
          <g transform="translate(10 150)">
            <LigneMenu y={0} texte={t('installer.demoCopier')} large={140} />
            <LigneMenu y={26} texte={t('installer.demoEcranAccueil')} large={140} surbrillance />
            <LigneMenu y={52} texte={t('installer.demoMarquePage')} large={140} />
          </g>
        </g>

        <Pointeur />
      </g>
    </Cadre>
  )
}

/** Android / Chrome : menu ⋮ en haut à droite, puis « Installer l'application ». */
export function DemoAndroid() {
  const { t } = useT()
  return (
    <Cadre titre={t('installer.android')}>
      <g className="demo--android">
        <rect className="demo__barre" x="10" y="12" width="140" height="26" rx="6" />
        <text className="demo__texte demo__texte--url" x="18" y="29">
          bus…beckerich
        </text>
        <g className="demo__points">
          <circle cx="140" cy="20" r="1.8" />
          <circle cx="140" cy="25" r="1.8" />
          <circle cx="140" cy="30" r="1.8" />
        </g>

        <rect className="demo__contenu" x="10" y="44" width="140" height="204" rx="4" />
        <text className="demo__texte demo__texte--titre" x="20" y="70">
          {t('app.court')}
        </text>

        {/* Menu déroulant, qui descend du coin supérieur droit. */}
        <g className="demo__panneau demo__panneau--haut">
          <rect x="34" y="38" width="116" height="86" rx="6" />
          <g transform="translate(34 58)">
            <LigneMenu y={0} texte={t('installer.demoNouvelOnglet')} large={116} />
            <LigneMenu y={26} texte={t('installer.demoInstaller')} large={116} surbrillance />
            <LigneMenu y={52} texte={t('installer.demoParametres')} large={116} />
          </g>
        </g>

        <Pointeur />
      </g>
    </Cadre>
  )
}

/** Bureau : l'icône d'installation apparaît dans la barre d'adresse. */
export function DemoBureau() {
  const { t } = useT()
  return (
    <Cadre titre={t('installer.bureau')} bureau>
      <g className="demo--bureau">
        <rect className="demo__barre" x="12" y="14" width="196" height="22" rx="5" />
        <text className="demo__texte demo__texte--url" x="20" y="29">
          bus-scolaire-beckerich
        </text>

        {/* L'icône d'installation, à droite de la barre d'adresse. */}
        <g className="demo__icone-installer">
          <rect x="186" y="19" width="14" height="12" rx="2" />
          <path d="M193 22 v6 M190 25 l3 3 l3 -3" />
        </g>

        <rect className="demo__contenu" x="12" y="42" width="196" height="94" rx="4" />
        <text className="demo__texte demo__texte--titre" x="24" y="70">
          {t('app.court')}
        </text>

        {/* Boîte de confirmation du navigateur. */}
        <g className="demo__panneau demo__panneau--boite">
          <rect x="86" y="38" width="122" height="56" rx="6" />
          <text className="demo__texte" x="94" y="58">
            {t('installer.demoInstaller')}
          </text>
          <rect className="demo__surbrillance" x="94" y="66" width="52" height="18" rx="4" />
          <text className="demo__texte demo__texte--bouton" x="100" y="79">
            {t('installer.demoValider')}
          </text>
        </g>

        <Pointeur />
      </g>
    </Cadre>
  )
}

/** Firefox : pas d'installation programmatique, mais l'ajout manuel existe sur Android. */
export function DemoFirefox() {
  const { t } = useT()
  return (
    <Cadre titre={t('installer.firefox')}>
      <g className="demo--firefox">
        <rect className="demo__barre" x="10" y="12" width="140" height="26" rx="6" />
        <text className="demo__texte demo__texte--url" x="18" y="29">
          bus…beckerich
        </text>
        <g className="demo__points">
          <circle cx="140" cy="20" r="1.8" />
          <circle cx="140" cy="25" r="1.8" />
          <circle cx="140" cy="30" r="1.8" />
        </g>

        <rect className="demo__contenu" x="10" y="44" width="140" height="204" rx="4" />
        <text className="demo__texte demo__texte--titre" x="20" y="70">
          {t('app.court')}
        </text>

        <g className="demo__panneau demo__panneau--haut">
          <rect x="40" y="38" width="110" height="86" rx="6" />
          <g transform="translate(40 58)">
            <LigneMenu y={0} texte={t('installer.demoParametres')} large={110} />
            <LigneMenu y={26} texte={t('installer.demoEcranAccueil')} large={110} surbrillance />
            <LigneMenu y={52} texte={t('installer.demoMarquePage')} large={110} />
          </g>
        </g>

        <Pointeur />
      </g>
    </Cadre>
  )
}

export const DEMONSTRATIONS = {
  ios: DemoIOS,
  android: DemoAndroid,
  bureau: DemoBureau,
  firefox: DemoFirefox,
} as const
