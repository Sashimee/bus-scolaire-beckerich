import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { ErreurCompte, reinitialiser, type MotifCompte } from '../lib/comptes'

const LONGUEUR_MDP_MIN = 10

/**
 * Poser un mot de passe depuis un lien reçu par courriel.
 *
 * Sert AUSSI bien à l'activation d'un compte neuf qu'à la réinitialisation d'un mot de
 * passe oublié : dans les deux cas, ouvrir le lien prouve le contrôle de la boîte, et le
 * serveur vérifie l'adresse du même geste. Le jeton est dans le fragment de requête,
 * jamais affiché.
 */
export function Reinitialiser() {
  const { t } = useT()
  const [params] = useSearchParams()
  const jeton = params.get('jeton') ?? ''

  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [fait, setFait] = useState(false)
  const [occupe, setOccupe] = useState(false)

  const messageErreur = (motif: MotifCompte) => t(`comptes.erreur.${motif}`, {})

  if (!jeton) {
    return (
      <div className="pile">
        <h2>{t('comptes.reinitTitre')}</h2>
        <div className="encart encart--attention">{t('comptes.reinitJetonManquant')}</div>
        <Link to="/connexion" className="bouton">
          {t('comptes.allerConnexion')}
        </Link>
      </div>
    )
  }

  if (fait) {
    return (
      <div className="pile">
        <h2>{t('comptes.reinitTitre')}</h2>
        <div className="encart">{t('comptes.reinitFait')}</div>
        <Link to="/connexion" className="bouton bouton--primaire">
          {t('comptes.allerConnexion')}
        </Link>
      </div>
    )
  }

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault()
    setErreur(null)
    if (motDePasse.length < LONGUEUR_MDP_MIN) {
      setErreur(t('comptes.longueurMin', { min: LONGUEUR_MDP_MIN }))
      return
    }
    setOccupe(true)
    try {
      await reinitialiser(jeton, motDePasse)
      setFait(true)
    } catch (err) {
      setErreur(messageErreur(err instanceof ErreurCompte ? err.motif : 'inconnu'))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('comptes.reinitTitre')}</h2>
        <p>{t('comptes.reinitIntro')}</p>
      </header>

      <form className="carte pile" onSubmit={soumettre}>
        <div className="champ">
          <label htmlFor="nouveau-mdp">{t('comptes.nouveauMotDePasse')}</label>
          <input
            id="nouveau-mdp"
            type="password"
            autoComplete="new-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <p className="champ__aide">{t('comptes.longueurMin', { min: LONGUEUR_MDP_MIN })}</p>
        </div>
        {erreur && <div className="encart encart--attention">{erreur}</div>}
        <button type="submit" className="bouton bouton--primaire" disabled={occupe || !motDePasse}>
          {t('comptes.definir')}
        </button>
      </form>
    </div>
  )
}
