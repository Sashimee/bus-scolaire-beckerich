import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LANGUES, NOMS_LANGUES, useT, type Langue } from '../i18n'
import { useFoyer, type Theme } from '../etat'
import { lienPartage } from '../lib/partage'
import { toutEffacer } from '../lib/stockage'
import { sourceAdresses } from '../lib/adresses'
import { Notifications } from '../composants/Notifications'
import { FicheFoyer } from '../composants/FicheFoyer'
import { useInstallation } from '../installation-contexte'

const THEMES: Theme[] = ['auto', 'clair', 'sombre']

export function Reglages() {
  const { t, langue, changerLangue } = useT()
  const { foyer, contextes, configure, theme, definirTheme } = useFoyer()
  const { installee } = useInstallation()
  const [copie, setCopie] = useState(false)
  const [montrerQr, setMontrerQr] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  const lien = configure ? lienPartage(foyer) : ''

  useEffect(() => {
    if (!montrerQr || !lien) return
    let annule = false
    // Le QR est produit localement : le lien contient l'adresse du domicile et ne
    // doit surtout pas transiter par un service de génération en ligne.
    import('qrcode').then(async ({ default: QRCode }) => {
      const url = await QRCode.toDataURL(lien, { width: 320, margin: 1 })
      if (!annule) setQr(url)
    })
    return () => {
      annule = true
    }
  }, [montrerQr, lien])

  const calcules = foyer.enfants
    .map((e) => contextes.get(e.id))
    .filter((c) => c !== null && c !== undefined)

  return (
    <>
      <FicheFoyer contextes={calcules} />

      <div className="pile pile--large ecran-seulement">
      <h2>{t('reglages.titre')}</h2>

      <section className="carte pile pile--serre">
        <div className="champ">
          <label htmlFor="langue">{t('reglages.langue')}</label>
          <select
            id="langue"
            value={langue}
            onChange={(e) => changerLangue(e.target.value as Langue)}
          >
            {LANGUES.map((l) => (
              <option key={l} value={l}>
                {NOMS_LANGUES[l]}
              </option>
            ))}
          </select>
        </div>

        <div className="champ">
          <label htmlFor="theme">{t('reglages.theme')}</label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => definirTheme(e.target.value as Theme)}
          >
            {THEMES.map((x) => (
              <option key={x} value={x}>
                {t(`reglages.theme${x[0].toUpperCase()}${x.slice(1)}`)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/*
          L'adresse, et le chemin vers les enfants — pas les enfants eux-mêmes.
          Cette page les listait une deuxième fois, avec un lien vers leur semaine :
          deux endroits pour la même chose, dont un seul sait les modifier. Ils vivent
          désormais sur la seule page qui les règle.
      */}
      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('onboarding.etapeAdresse')}</h3>
        <p className="champ__aide">{foyer.adresse?.libelle ?? '—'}</p>

        <Link to="/configurer" className="bouton">
          {t('reglages.mesEnfants')}
        </Link>

        {calcules.length > 0 && (
          <>
            <button type="button" className="bouton" onClick={() => window.print()}>
              {t('impression.famille')}
            </button>
            <p className="champ__aide">{t('impression.familleAide')}</p>
          </>
        )}
      </section>

      {configure && (
        <section className="carte pile pile--serre">
          <h3 className="titre-carte">{t('partage.titre')}</h3>
          <p className="champ__aide">{t('partage.aide')}</p>
          <div className="rangee">
            <button
              type="button"
              className="bouton"
              onClick={async () => {
                await navigator.clipboard.writeText(lien)
                setCopie(true)
                setTimeout(() => setCopie(false), 2500)
              }}
            >
              {copie ? t('partage.copie') : t('partage.copier')}
            </button>
            <button
              type="button"
              className="bouton"
              aria-expanded={montrerQr}
              onClick={() => setMontrerQr((v) => !v)}
            >
              {t('partage.qr')}
            </button>
          </div>
          {montrerQr && qr && <img src={qr} alt={t('partage.qr')} width={256} height={256} />}
          <p className="champ__aide">{t('partage.confidentialite')}</p>
        </section>
      )}

      {/* Entrée permanente tant que l'application n'est pas installée : c'est le
          réglage qui débloque les notifications sur iPhone. */}
      {!installee && (
        <section className="carte pile pile--serre">
          <h3 className="titre-carte">{t('installer.titre')}</h3>
          <p className="champ__aide">{t('installer.atoutNotifications')}</p>
          <Link to="/installer" className="bouton bouton--primaire">
            {t('nav.installer')}
          </Link>
        </section>
      )}

      <Notifications />

      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('reglages.donnees')}</h3>
        <p className="champ__aide">
          {sourceAdresses.jeu} — {sourceAdresses.licence}
        </p>
        <button
          type="button"
          className="bouton bouton--danger"
          onClick={() => {
            if (confirm(t('reglages.effacerConfirmation'))) {
              toutEffacer()
              window.location.href = import.meta.env.BASE_URL
            }
          }}
        >
          {t('reglages.effacer')}
        </button>
      </section>
      </div>
    </>
  )
}
