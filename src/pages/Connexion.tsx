import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import {
  ErreurCompte,
  chargerSession,
  changerMotDePasse,
  comptesConfigures,
  demanderReinitialisation,
  oublierSession,
  seConnecter,
  type MotifCompte,
  type SessionCompte,
} from '../lib/comptes'

const LONGUEUR_MDP_MIN = 10

/** La phrase d'une erreur, dans la langue courante — les minutes d'attente si besoin. */
function useMessageErreur() {
  const { t } = useT()
  return (motif: MotifCompte, detail?: unknown) =>
    t(`comptes.erreur.${motif}`, motif === 'trop-de-tentatives' ? { minutes: Number(detail ?? 15) } : {})
}

/** Le bloc « mon compte » une fois connecté : droits, mot de passe, déconnexion. */
function MonCompte({ session, onDeconnexion }: { session: SessionCompte; onDeconnexion: () => void }) {
  const { t } = useT()
  const messageErreur = useMessageErreur()
  const [ancien, setAncien] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [fait, setFait] = useState(false)
  const [occupe, setOccupe] = useState(false)

  const changer = async (e: React.FormEvent) => {
    e.preventDefault()
    setErreur(null)
    setFait(false)
    if (nouveau.length < LONGUEUR_MDP_MIN) {
      setErreur(t('comptes.longueurMin', { min: LONGUEUR_MDP_MIN }))
      return
    }
    setOccupe(true)
    try {
      await changerMotDePasse(session, ancien, nouveau)
      setFait(true)
      setAncien('')
      setNouveau('')
    } catch (err) {
      setErreur(messageErreur(err instanceof ErreurCompte ? err.motif : 'inconnu'))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('comptes.titre')}</h2>
        <p className="champ__aide">{t('comptes.connecte', { nom: session.nom })}</p>
      </header>

      <section className="carte pile pile--serre">
        <h3>{t('comptes.vosDroits')}</h3>
        {session.capacites.length === 0 ? (
          <p className="champ__aide">{t('comptes.aucunDroit')}</p>
        ) : (
          <div className="rangee">
            {session.capacites.map((cap) => (
              <span className="etiquette" key={cap}>
                {t(`comptes.capacite.${cap}`)}
              </span>
            ))}
          </div>
        )}
        {(session.capacites.includes('credits') || session.capacites.includes('arrets')) && (
          <Link to="/edition" className="bouton">
            {t('edition.titre')}
          </Link>
        )}
        {session.capacites.includes('comptes') && (
          <Link to="/comptes" className="bouton">
            {t('comptes.gestionAcces')}
          </Link>
        )}
      </section>

      <form className="carte pile pile--serre" onSubmit={changer}>
        <h3>{t('comptes.changerTitre')}</h3>
        <div className="champ">
          <label htmlFor="ancien">{t('comptes.ancienMotDePasse')}</label>
          <input
            id="ancien"
            type="password"
            autoComplete="current-password"
            value={ancien}
            onChange={(e) => setAncien(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="nouveau">{t('comptes.nouveauMotDePasse')}</label>
          <input
            id="nouveau"
            type="password"
            autoComplete="new-password"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
          />
          <p className="champ__aide">{t('comptes.longueurMin', { min: LONGUEUR_MDP_MIN })}</p>
        </div>
        {erreur && <div className="encart encart--attention">{erreur}</div>}
        {fait && <div className="encart">{t('comptes.motDePasseChange')}</div>}
        <button type="submit" className="bouton bouton--primaire" disabled={occupe || !ancien || !nouveau}>
          {t('comptes.changer')}
        </button>
      </form>

      <button type="button" className="bouton bouton--discret" onClick={onDeconnexion}>
        {t('comptes.deconnexion')}
      </button>
    </div>
  )
}

/**
 * Connexion à l'espace agents (lot 24).
 *
 * Un compte — courriel + mot de passe — et non plus un code personnel. Les messages
 * d'erreur disent ce qui s'est passé et quoi faire, jamais quel code HTTP est revenu.
 * Une adresse inconnue et un mauvais mot de passe rendent le même message : le serveur
 * refuse d'aider à énumérer les comptes, et l'interface n'en dit pas plus que lui.
 */
export function Connexion() {
  const { t } = useT()
  const messageErreur = useMessageErreur()
  const [session, setSession] = useState(chargerSession)
  const [courriel, setCourriel] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [seSouvenir, setSeSouvenir] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  // Repli « mot de passe oublié » : un second formulaire, sans quitter la page.
  const [oubli, setOubli] = useState(false)
  const [oubliEnvoye, setOubliEnvoye] = useState(false)

  if (!comptesConfigures()) {
    return (
      <div className="pile">
        <h2>{t('comptes.titre')}</h2>
        <div className="encart encart--attention">{t('comptes.nonConfigure')}</div>
      </div>
    )
  }

  if (session) {
    return (
      <MonCompte
        session={session}
        onDeconnexion={() => {
          oublierSession()
          setSession(null)
        }}
      />
    )
  }

  const connecter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courriel.trim() || !motDePasse) return
    setOccupe(true)
    setErreur(null)
    try {
      setSession(await seConnecter(courriel, motDePasse, seSouvenir))
    } catch (err) {
      const e2 = err instanceof ErreurCompte ? err : new ErreurCompte('inconnu')
      setErreur(messageErreur(e2.motif, e2.detail))
    } finally {
      setOccupe(false)
    }
  }

  const demander = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courriel.trim()) return
    setOccupe(true)
    setErreur(null)
    try {
      await demanderReinitialisation(courriel)
      setOubliEnvoye(true)
    } catch (err) {
      const e2 = err instanceof ErreurCompte ? err : new ErreurCompte('inconnu')
      setErreur(messageErreur(e2.motif, e2.detail))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('comptes.titre')}</h2>
        <p>{t('comptes.intro')}</p>
      </header>

      {oubli ? (
        <form className="carte pile" onSubmit={demander}>
          {oubliEnvoye ? (
            <div className="encart">{t('comptes.reinitEnvoye')}</div>
          ) : (
            <>
              <div className="champ">
                <label htmlFor="courriel-oubli">{t('comptes.courriel')}</label>
                <input
                  id="courriel-oubli"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  value={courriel}
                  onChange={(e) => setCourriel(e.target.value)}
                />
              </div>
              {erreur && <div className="encart encart--attention">{erreur}</div>}
              <button type="submit" className="bouton bouton--primaire" disabled={occupe || !courriel.trim()}>
                {t('comptes.reinitDemande')}
              </button>
            </>
          )}
          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => {
              setOubli(false)
              setOubliEnvoye(false)
              setErreur(null)
            }}
          >
            {t('comptes.annuler')}
          </button>
        </form>
      ) : (
        <form className="carte pile" onSubmit={connecter}>
          <div className="champ">
            <label htmlFor="courriel">{t('comptes.courriel')}</label>
            <input
              id="courriel"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={courriel}
              onChange={(e) => setCourriel(e.target.value)}
            />
          </div>
          <div className="champ">
            <label htmlFor="motdepasse">{t('comptes.motDePasse')}</label>
            <input
              id="motdepasse"
              type="password"
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </div>
          <label className="case">
            <input type="checkbox" checked={seSouvenir} onChange={(e) => setSeSouvenir(e.target.checked)} />
            <span>{t('comptes.seSouvenir')}</span>
          </label>
          {erreur && <div className="encart encart--attention">{erreur}</div>}
          <button type="submit" className="bouton bouton--primaire" disabled={occupe || !courriel.trim() || !motDePasse}>
            {t('comptes.connexion')}
          </button>
          <button type="button" className="bouton bouton--discret" onClick={() => setOubli(true)}>
            {t('comptes.motDePasseOublie')}
          </button>
        </form>
      )}
    </div>
  )
}
