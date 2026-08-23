import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { LANGUES, NOMS_LANGUES } from '../i18n/langues'
import {
  CAPACITES,
  ErreurCompte,
  chargerSession,
  comptesConfigures,
  creerCompte,
  listerComptes,
  modifierCompte,
  type Capacite,
  type Compte,
  type MotifCompte,
  type SessionCompte,
} from '../lib/comptes'

/** Les cases à cocher des capacités, partagées par la création et la modification. */
function ChoixCapacites({
  valeur,
  onChange,
  prefixe,
}: {
  valeur: Capacite[]
  onChange: (c: Capacite[]) => void
  prefixe: string
}) {
  const { t } = useT()
  const basculer = (cap: Capacite) =>
    onChange(valeur.includes(cap) ? valeur.filter((x) => x !== cap) : [...valeur, cap])
  return (
    <div className="rangee">
      {CAPACITES.map((cap) => (
        <label className="case" key={cap}>
          <input
            id={`${prefixe}-${cap}`}
            type="checkbox"
            checked={valeur.includes(cap)}
            onChange={() => basculer(cap)}
          />
          <span>{t(`comptes.capacite.${cap}`)}</span>
        </label>
      ))}
    </div>
  )
}

/** Une ligne repliable pour modifier un compte existant. */
function LigneCompte({
  compte,
  session,
  onModifie,
}: {
  compte: Compte
  session: SessionCompte
  onModifie: () => void
}) {
  const { t } = useT()
  const [capacites, setCapacites] = useState<Capacite[]>(compte.capacites)
  const [desactive, setDesactive] = useState(compte.desactive)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const etat = compte.desactive
    ? t('comptes.etatDesactive')
    : compte.courrielVerifie
      ? t('comptes.etatActif')
      : t('comptes.etatAActiver')

  const enregistrer = async () => {
    setErreur(null)
    setOccupe(true)
    try {
      await modifierCompte(session, compte.courriel, { capacites, desactive })
      onModifie()
    } catch (err) {
      setErreur(t(`comptes.erreur.${err instanceof ErreurCompte ? err.motif : 'inconnu'}`, {}))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <details className="repli carte">
      <summary>
        <span className="texte-fort">{compte.courriel}</span>
        <span className="etiquette">{etat}</span>
      </summary>
      <div className="pile pile--serre">
        <p className="champ__aide">
          {compte.nom}
          {compte.service ? ` · ${compte.service}` : ''} ·{' '}
          {compte.dernierAcces
            ? t('comptes.connecte', { nom: new Date(compte.dernierAcces).toLocaleDateString() })
            : t('comptes.jamaisConnecte')}
        </p>

        <div className="champ">
          <label>{t('comptes.droitsAccordes')}</label>
          <ChoixCapacites valeur={capacites} onChange={setCapacites} prefixe={`mod-${compte.courriel}`} />
        </div>

        <label className="case">
          <input type="checkbox" checked={desactive} onChange={(e) => setDesactive(e.target.checked)} />
          <span>{desactive ? t('comptes.reactiver') : t('comptes.desactiver')}</span>
        </label>

        {erreur && <div className="encart encart--attention">{erreur}</div>}
        <button type="button" className="bouton bouton--primaire" onClick={enregistrer} disabled={occupe}>
          {t('comptes.enregistrer')}
        </button>
      </div>
    </details>
  )
}

/**
 * Gestion des comptes, sous la capacité `comptes`.
 *
 * L'accès est gardé côté serveur à chaque requête : cette page ne fait que refléter ce
 * que le serveur autorise. Un compte sans la capacité qui arriverait ici par l'URL verra
 * ses appels refusés, et le message le dira.
 */
export function Comptes() {
  const { t } = useT()
  const [session] = useState(chargerSession)
  const [comptes, setComptes] = useState<Compte[] | null>(null)
  const [erreurListe, setErreurListe] = useState<string | null>(null)

  // Formulaire de création.
  const [courriel, setCourriel] = useState('')
  const [nom, setNom] = useState('')
  const [serviceChamp, setServiceChamp] = useState('')
  const [langue, setLangue] = useState<string>('fr')
  const [capacites, setCapacites] = useState<Capacite[]>([])
  const [erreurCreer, setErreurCreer] = useState<string | null>(null)
  const [creee, setCreee] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(async () => {
    if (!session) return
    setErreurListe(null)
    try {
      setComptes((await listerComptes(session)).comptes)
    } catch (err) {
      setComptes([])
      setErreurListe(t(`comptes.erreur.${err instanceof ErreurCompte ? err.motif : 'inconnu'}`, {}))
    }
  }, [session, t])

  useEffect(() => {
    charger()
  }, [charger])

  if (!comptesConfigures()) {
    return (
      <div className="pile">
        <h2>{t('comptes.gestionTitre')}</h2>
        <div className="encart encart--attention">{t('comptes.nonConfigure')}</div>
      </div>
    )
  }

  if (!session || !session.capacites.includes('comptes')) {
    return (
      <div className="pile">
        <h2>{t('comptes.gestionTitre')}</h2>
        <div className="encart encart--attention">
          {t(`comptes.erreur.${session ? 'capacite-refusee' : 'session-expiree'}` as const, {})}
        </div>
        <Link to="/connexion" className="bouton">
          {t('comptes.allerConnexion')}
        </Link>
      </div>
    )
  }

  const creer = async (e: React.FormEvent) => {
    e.preventDefault()
    setErreurCreer(null)
    setCreee(null)
    setOccupe(true)
    try {
      await creerCompte(session, { courriel, nom, capacites, service: serviceChamp, langue })
      setCreee(t('comptes.compteCree', { courriel }))
      setCourriel('')
      setNom('')
      setServiceChamp('')
      setCapacites([])
      await charger()
    } catch (err) {
      const motif: MotifCompte = err instanceof ErreurCompte ? err.motif : 'inconnu'
      setErreurCreer(t(`comptes.erreur.${motif}`, {}))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('comptes.gestionTitre')}</h2>
        <Link to="/connexion" className="bouton bouton--discret">
          {t('comptes.titre')}
        </Link>
      </header>

      <form className="carte pile pile--serre" onSubmit={creer}>
        <h3>{t('comptes.creerTitre')}</h3>
        <div className="champ">
          <label htmlFor="creer-courriel">{t('comptes.courriel')}</label>
          <input
            id="creer-courriel"
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={courriel}
            onChange={(e) => setCourriel(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="creer-nom">{t('comptes.nom')}</label>
          <input id="creer-nom" type="text" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div className="champ">
          <label htmlFor="creer-service">{t('comptes.service')}</label>
          <input
            id="creer-service"
            type="text"
            value={serviceChamp}
            onChange={(e) => setServiceChamp(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="creer-langue">{t('comptes.langue')}</label>
          <select id="creer-langue" value={langue} onChange={(e) => setLangue(e.target.value)}>
            {LANGUES.map((l) => (
              <option value={l} key={l}>
                {NOMS_LANGUES[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="champ">
          <label>{t('comptes.droitsAccordes')}</label>
          <ChoixCapacites valeur={capacites} onChange={setCapacites} prefixe="creer" />
        </div>
        {erreurCreer && <div className="encart encart--attention">{erreurCreer}</div>}
        {creee && <div className="encart">{creee}</div>}
        <button
          type="submit"
          className="bouton bouton--primaire"
          disabled={occupe || !courriel.trim() || !nom.trim()}
        >
          {t('comptes.creer')}
        </button>
      </form>

      <section className="pile pile--serre">
        <h3>{t('comptes.liste', { nombre: comptes?.length ?? 0 })}</h3>
        {erreurListe && <div className="encart encart--attention">{erreurListe}</div>}
        {comptes?.length === 0 && !erreurListe && <p className="champ__aide">{t('comptes.listeVide')}</p>}
        {comptes?.map((c) => (
          <LigneCompte key={c.courriel} compte={c} session={session} onModifie={charger} />
        ))}
      </section>
    </div>
  )
}
