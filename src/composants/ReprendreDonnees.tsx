import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { lienPartage } from '../lib/partage'

/**
 * Emporter sa configuration dans l'application installée.
 *
 * Sur iPhone, une application ajoutée à l'écran d'accueil ne partage PAS le stockage de
 * Safari : elle démarre vierge, et le parent qui vient de tout régler retrouve un écran
 * de bienvenue. Ce n'est pas un défaut de l'application, c'est ainsi qu'iOS cloisonne —
 * mais du point de vue du parent, ses données ont disparu.
 *
 * Le mécanisme de reprise existe déjà : le lien de partage porte toute la configuration
 * dans son fragment. Il ne manquait qu'à le proposer au moment où il sert.
 *
 * Rien ne part sur le réseau : le fragment d'une URL n'est jamais transmis au serveur.
 */
export function ReprendreDonnees() {
  const { t } = useT()
  const { foyer, configure } = useFoyer()
  const [copie, setCopie] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [montrerQr, setMontrerQr] = useState(false)

  const lien = configure ? lienPartage(foyer) : ''

  useEffect(() => {
    if (!montrerQr || !lien) return
    let annule = false
    // Chargé à la demande : la bibliothèque pèse plus que la page qui l'utilise.
    import('qrcode').then(async ({ default: QRCode }) => {
      const image = await QRCode.toDataURL(lien, { width: 320, margin: 1 })
      if (!annule) setQr(image)
    })
    return () => {
      annule = true
    }
  }, [montrerQr, lien])

  if (!configure) return null

  return (
    <section className="carte pile pile--serre">
      <h3 className="titre-carte">{t('installer.reprendreTitre')}</h3>
      <p>{t('installer.reprendreIntro')}</p>
      <p className="champ__aide">{t('installer.reprendreComment')}</p>

      <div className="rangee">
        <button
          type="button"
          className="bouton bouton--primaire"
          onClick={() => {
            void navigator.clipboard.writeText(lien).then(() => {
              setCopie(true)
              setTimeout(() => setCopie(false), 2500)
            })
          }}
        >
          {copie ? t('partage.copie') : t('partage.copier')}
        </button>
        <button type="button" className="bouton" onClick={() => setMontrerQr((v) => !v)}>
          {t('partage.qr')}
        </button>
      </div>

      {montrerQr && qr && <img src={qr} alt={t('partage.qr')} width={256} height={256} />}

      <p className="champ__aide">{t('partage.confidentialite')}</p>
    </section>
  )
}
