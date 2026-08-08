import { useState } from 'react'
import { useT } from '../i18n'
import { EditeurTraductions } from '../composants/EditeurTraductions'
import {
  ErreurCommune,
  chargerSession,
  cleErreur,
  communeConfiguree,
  oublierSession,
  publierTraductions,
  seConnecter,
  type MotifCommune,
} from '../lib/commune'

/**
 * Espace traduction, calqué sur `/commune`.
 *
 * Même mécanique — un code personnel, jamais de compte GitHub — mais un code qui n'est
 * valable QUE pour les textes : côté Worker, il vit sous un autre préfixe et le jeton
 * porte son rôle. Confier la relecture des cinq langues à quelqu'un ne revient donc
 * jamais à lui donner le droit d'annuler un bus.
 */
export function Traductions() {
  const { t, surcouche } = useT()
  const [session, setSession] = useState(() => chargerSession('traductions'))
  const [code, setCode] = useState('')
  const [motif, setMotif] = useState<MotifCommune | null>(null)
  const [minutes, setMinutes] = useState(0)
  const [occupe, setOccupe] = useState(false)

  if (!communeConfiguree()) {
    return (
      <div className="pile">
        <h2>{t('traductions.connexion')}</h2>
        <div className="encart encart--attention">{t('commune.nonConfiguree')}</div>
      </div>
    )
  }

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setOccupe(true)
    setMotif(null)
    try {
      setSession(await seConnecter(code, 'traductions'))
    } catch (erreur) {
      if (erreur instanceof ErreurCommune) {
        setMotif(erreur.motif)
        if (erreur.motif === 'trop-de-tentatives') setMinutes(Number(erreur.detail ?? 15))
      } else {
        setMotif('inconnu')
      }
    } finally {
      setOccupe(false)
    }
  }

  if (session) {
    return (
      <div className="pile pile--large">
        <header className="rangee rangee--espacee">
          <h2>{t('traductions.titre')}</h2>
          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => {
              oublierSession('traductions')
              setSession(null)
            }}
          >
            {t('commune.deconnexion')}
          </button>
        </header>

        <EditeurTraductions
          surcouche={surcouche}
          publier={(suite) => publierTraductions(session, suite)}
        />
      </div>
    )
  }

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('traductions.connexion')}</h2>
        <p>{t('traductions.connexionAide')}</p>
      </header>

      <form className="carte pile" onSubmit={soumettre}>
        <div className="champ">
          <label htmlFor="code-traductions">{t('commune.code')}</label>
          <input
            id="code-traductions"
            className="champ-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="xxxx-xxxx"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // `text` et non `password`, comme pour la commune : ce code se dicte au
            // téléphone et se retape.
            inputMode="text"
          />
          <p className="champ__aide">{t('commune.codeAide')}</p>
        </div>

        {motif && (
          <div className="encart encart--alerte" role="alert">
            {t(`commune.erreur.${cleErreur(motif)}`, { minutes })}
          </div>
        )}

        <button type="submit" className="bouton bouton--primaire" disabled={occupe || !code.trim()}>
          {occupe ? t('commun.chargement') : t('commune.connexion')}
        </button>
      </form>

      <p className="champ__aide">{t('commune.oubliAide')}</p>
    </div>
  )
}
