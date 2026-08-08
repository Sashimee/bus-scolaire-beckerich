import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import {
  ErreurCommune,
  chargerSession,
  communeConfiguree,
  oublierSession,
  seConnecter,
  type MotifCommune,
} from '../lib/commune'

/**
 * Connexion de l'espace commune.
 *
 * Un seul champ, et pas un mot de GitHub, de JSON ni de jeton : l'agent qui vient
 * annoncer une annulation de bus n'a aucune raison d'apprendre par quel mécanisme
 * l'application publie. Les messages d'erreur disent ce qui s'est passé et quoi faire,
 * pas quel code HTTP est revenu.
 */
export function Commune() {
  const { t } = useT()
  const naviguer = useNavigate()
  const [session, setSession] = useState(chargerSession)
  const [code, setCode] = useState('')
  const [motif, setMotif] = useState<MotifCommune | null>(null)
  const [minutes, setMinutes] = useState(0)
  const [occupe, setOccupe] = useState(false)

  if (!communeConfiguree()) {
    return (
      <div className="pile">
        <h2>{t('commune.titre')}</h2>
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
      setSession(await seConnecter(code))
      naviguer('/commune/alertes')
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
        <header className="pile pile--serre">
          <h2>{t('commune.titre')}</h2>
          <p className="champ__aide">
            {t('commune.connecteCommo', { nom: session.nom, service: session.service })}
          </p>
        </header>

        <section className="carte pile pile--serre">
          <Link to="/commune/alertes" className="bouton bouton--primaire">
            {t('commune.allerAlertes')}
          </Link>
          <p className="champ__aide">{t('commune.allerAlertesAide')}</p>
          <Link to="/commune/horaires" className="bouton">
            {t('commune.allerHoraires')}
          </Link>
          <p className="champ__aide">{t('commune.allerHorairesAide')}</p>
        </section>

        <button
          type="button"
          className="bouton bouton--discret"
          onClick={() => {
            oublierSession()
            setSession(null)
          }}
        >
          {t('commune.deconnexion')}
        </button>
      </div>
    )
  }

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('commune.titre')}</h2>
        <p>{t('commune.intro')}</p>
      </header>

      <form className="carte pile" onSubmit={soumettre}>
        <div className="champ">
          <label htmlFor="code">{t('commune.code')}</label>
          <input
            id="code"
            className="champ-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="xxxx-xxxx"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // `text` et non `password` : ce code se dicte au téléphone et se retape,
            // le masquer ne protégerait de rien et multiplierait les fautes de frappe.
            inputMode="text"
          />
          <p className="champ__aide">{t('commune.codeAide')}</p>
        </div>

        {motif && (
          <div className="encart encart--alerte" role="alert">
            {motif === 'trop-de-tentatives'
              ? t('commune.erreur.tropDeTentatives', { minutes })
              : t(`commune.erreur.${motif === 'code-inconnu' ? 'codeInconnu' : motif === 'reseau' ? 'reseau' : 'inconnu'}`)}
          </div>
        )}

        <button
          type="submit"
          className="bouton bouton--primaire"
          disabled={occupe || !code.trim()}
        >
          {occupe ? t('commun.chargement') : t('commune.connexion')}
        </button>
      </form>

      <p className="champ__aide">{t('commune.oubliAide')}</p>
    </div>
  )
}
