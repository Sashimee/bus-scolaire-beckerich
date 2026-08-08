import { useState } from 'react'
import { useT } from '../i18n'
import { estAppareilIOS, useInstallation } from '../installation-contexte'
import { DEMONSTRATIONS } from '../composants/installation/Demonstrations'

type Plateforme = keyof typeof DEMONSTRATIONS

/** Devine la plateforme pour mettre en avant la bonne procédure, sans masquer les autres. */
function detecter(): Plateforme {
  const ua = navigator.userAgent
  if (estAppareilIOS()) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Firefox\//.test(ua)) return 'firefox'
  return 'bureau'
}

const PLATEFORMES: Plateforme[] = ['ios', 'android', 'bureau', 'firefox']

/**
 * Un bloc de procédure : la démonstration animée, puis les étapes en toutes lettres.
 *
 * L'animation ne remplace pas le texte, elle le double. Un parent qui n'a pas
 * l'application sous les yeux au même moment doit pouvoir suivre la liste seule, et
 * un lecteur d'écran n'a que celle-ci.
 */
function Procedure({ cle, principal }: { cle: Plateforme; principal: boolean }) {
  const { t, tListe } = useT()
  const Demonstration = DEMONSTRATIONS[cle]
  const etapes = cle === 'firefox' ? [] : tListe(`installer.${cle}Etapes`)
  const note =
    cle === 'ios' ? t('installer.iosNote') : cle === 'firefox' ? t('installer.firefoxNote') : null

  return (
    <div className={principal ? 'carte carte--accent pile' : 'pile'}>
      <h3 className="titre-carte">{t(`installer.${cle}`)}</h3>
      <Demonstration />
      {etapes.length > 0 && (
        <ol className="pile pile--serre liste-puces">
          {etapes.map((etape) => (
            <li key={etape}>{etape}</li>
          ))}
        </ol>
      )}
      {note && <p className="champ__aide">{note}</p>}
    </div>
  )
}

export function Installer() {
  const { t } = useT()
  const [plateforme] = useState(detecter)
  const { invite, installee, installer } = useInstallation()

  const autres = PLATEFORMES.filter((p) => p !== plateforme)

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('installer.titre')}</h2>
        <p>{t('installer.intro')}</p>
      </header>

      {/* Ce que l'installation apporte concrètement, avant la manière de s'y prendre :
          c'est la seule question que le parent se pose vraiment. */}
      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('installer.pourquoiTitre')}</h3>
        <ul className="liste-puces pile pile--serre">
          <li>{t('installer.atoutHorsLigne')}</li>
          <li>{t('installer.atoutNotifications')}</li>
          <li>{t('installer.atoutPleinEcran')}</li>
        </ul>
        <p className="champ__aide">{t('installer.atoutPoids')}</p>
      </section>

      {installee && <div className="encart encart--info">{t('installer.dejaInstallee')}</div>}

      {invite && !installee && (
        <button type="button" className="bouton bouton--primaire" onClick={() => void installer()}>
          {t('installer.boutonInstaller')}
        </button>
      )}

      <section className="pile pile--serre">
        <span className="etiquette">{t('installer.detecte')}</span>
        <Procedure cle={plateforme} principal />
      </section>

      <details className="repli carte">
        <summary>{t('installer.autres')}</summary>
        <div className="pile pile--large">
          {autres.map((p) => (
            <Procedure key={p} cle={p} principal={false} />
          ))}
        </div>
      </details>
    </div>
  )
}
