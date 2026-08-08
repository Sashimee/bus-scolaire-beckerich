import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { useInstallation } from '../installation-contexte'

/**
 * Invitation à installer l'application, une fois que le parent s'en sert vraiment.
 *
 * Un `<dialog>` natif plutôt qu'un bandeau : la question mérite une réponse, et une
 * réponse la fait disparaître pour un mois. Le natif apporte gratuitement le piège à
 * focus, la fermeture par Échap et le fond inerte — trois choses qu'une `<div>` avec
 * `role="dialog"` n'aurait qu'au prix d'une centaine de lignes fragiles.
 *
 * Sur iOS, `beforeinstallprompt` n'existe pas : la boîte explique le geste au lieu de
 * proposer un bouton qui ne ferait rien.
 */
export function InvitationInstallation() {
  const { t } = useT()
  const { configure } = useFoyer()
  const { invite, estIOS, proposable, installer, reporter } = useInstallation()
  const boite = useRef<HTMLDialogElement>(null)
  /** Le parent a répondu : la boîte disparaît, sans que ce soit un refus. */
  const [traitee, setTraitee] = useState(false)

  // Sans configuration, l'application n'a encore rien montré : l'installer n'a pas
  // de sens. Sans invitation ni geste iOS à expliquer, il n'y aurait rien à dire.
  const aProposer = configure && proposable && (invite || estIOS) && !traitee

  /**
   * Ouverture, et mémorisation du refus par Échap.
   *
   * L'ouverture et la fermeture passent par `aProposer`, jamais par un `close()`
   * appelé depuis un gestionnaire : une fermeture impérative dépend de l'état de la
   * référence au moment du clic, et c'est précisément ce qui faisait perdre le refus
   * en silence. Ici, répondre change l'état, et le rendu suit.
   *
   * Reste Échap, que le navigateur traite seul : il émet `close`, qu'on écoute pour
   * en faire un refus. Sans quoi la question reviendrait à chaque ouverture de
   * l'application — exactement le harcèlement qu'on cherche à éviter.
   *
   * L'écouteur est posé dans CET effet-ci, dont les dépendances changent quand la
   * boîte apparaît : un effet à part, aux dépendances stables, ne se rejouerait jamais
   * pour la trouver, la boîte n'existant pas au premier rendu.
   */
  useEffect(() => {
    const d = boite.current
    if (!d) return
    d.addEventListener('close', reporter)
    if (aProposer && !d.open) d.showModal()
    return () => d.removeEventListener('close', reporter)
  }, [aProposer, reporter])

  if (!aProposer) return null

  return (
    <dialog ref={boite} className="dialogue" aria-labelledby="installation-titre">
      <div className="pile">
        <h2 id="installation-titre" className="titre-carte">
          {t('installer.inviteTitre')}
        </h2>
        <p>{t('installer.inviteCorps')}</p>

        <ul className="liste-puces pile pile--serre">
          <li>{t('installer.atoutHorsLigne')}</li>
          <li>{t('installer.atoutNotifications')}</li>
          <li>{t('installer.atoutPleinEcran')}</li>
        </ul>

        {estIOS && !invite && <p className="champ__aide">{t('installer.iosNote')}</p>}

        <div className="rangee">
          {invite ? (
            <button
              type="button"
              className="bouton bouton--primaire"
              onClick={() => {
                setTraitee(true)
                void installer()
              }}
            >
              {t('installer.boutonInstaller')}
            </button>
          ) : (
            <Link
              to="/installer"
              className="bouton bouton--primaire"
              onClick={() => setTraitee(true)}
            >
              {t('installer.voirProcedure')}
            </Link>
          )}
          {/* « Plus tard » est un refus : il se mémorise pour un mois. */}
          <button type="button" className="bouton bouton--discret" onClick={reporter}>
            {t('installer.plusTard')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
