import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { ResumePerturbation } from '../composants/BandeauUrgences'
import { useUrgences } from '../urgences-contexte'
import { useBlocageRechargement } from '../rechargement-contexte'
import { arrets, plan } from '../lib/donnees'
import { nomArret } from '../lib/affichage'
import { isoDate } from '../lib/calendrier'
import {
  lireUrgencesDepot,
  publierUrgences,
  verifierAcces,
  type Identite,
} from '../lib/github'
import { nouvelIdentifiant, type Gravite, type Perturbation, type TypePerturbation } from '../lib/urgences'
import { URL_WORKER, connexionGithubConfiguree, lienEditeurGithub } from '../config'
import { AdminArrets } from '../composants/AdminArrets'
import { AdminPlan } from '../composants/AdminPlan'

const CLE_JETON = 'bus-beckerich.jeton-github'
const TYPES: TypePerturbation[] = ['annulation', 'retard', 'arret-deplace', 'message']
const GRAVITES: Gravite[] = ['info', 'attention', 'alerte']

/** Le jeton vit en sessionStorage : il disparaît à la fermeture de l'onglet. */
const lireJeton = () => {
  try {
    return sessionStorage.getItem(CLE_JETON)
  } catch {
    return null
  }
}
const ecrireJeton = (j: string | null) => {
  try {
    if (j) sessionStorage.setItem(CLE_JETON, j)
    else sessionStorage.removeItem(CLE_JETON)
  } catch {
    /* stockage indisponible : la session ne survivra pas au rechargement */
  }
}

export function Admin() {
  const { t, langue } = useT()
  const { urgences, rafraichir } = useUrgences()

  const [jeton, setJeton] = useState<string | null>(lireJeton)
  const [identite, setIdentite] = useState<Identite | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [saisieJeton, setSaisieJeton] = useState('')
  const [publiee, setPubliee] = useState(false)

  // Brouillon de perturbation
  const aujourdhui = isoDate(new Date())
  const [type, setType] = useState<TypePerturbation>('annulation')
  const [ligne, setLigne] = useState('')
  const [service, setService] = useState('')
  const [arret, setArret] = useState('')
  const [du, setDu] = useState(aujourdhui)
  const [au, setAu] = useState(aujourdhui)
  const [minutes, setMinutes] = useState(10)
  const [remplacement, setRemplacement] = useState('')
  const [message, setMessage] = useState('')
  const [gravite, setGravite] = useState<Gravite>('alerte')

  // Un rechargement automatique en plein milieu d'une saisie effacerait le texte de
  // l'annonce, au pire moment : celui où quelqu'un cherche à publier une urgence.
  useBlocageRechargement(message.trim().length > 0, 'brouillon-admin')

  // Récupère le jeton renvoyé par le Worker après la connexion GitHub.
  useEffect(() => {
    const m = /[#&]jeton=([^&]+)/.exec(window.location.hash)
    if (!m) return
    const recu = decodeURIComponent(m[1])
    ecrireJeton(recu)
    setJeton(recu)
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  // Vérifie l'identité et surtout le droit d'écriture sur le dépôt.
  useEffect(() => {
    if (!jeton) {
      setIdentite(null)
      return
    }
    let annule = false
    setOccupe(true)
    verifierAcces(jeton)
      .then((i) => {
        if (!annule) {
          setIdentite(i)
          setErreur(null)
        }
      })
      .catch(() => {
        if (!annule) {
          setIdentite(null)
          setErreur('jeton-invalide')
          ecrireJeton(null)
          setJeton(null)
        }
      })
      .finally(() => !annule && setOccupe(false))
    return () => {
      annule = true
    }
  }, [jeton])

  const brouillon = (): Perturbation => ({
    id: nouvelIdentifiant(),
    du,
    au,
    type,
    ...(ligne ? { ligne } : {}),
    ...(service ? { service } : {}),
    ...(arret ? { arret } : {}),
    ...(type === 'retard' ? { minutes } : {}),
    ...(type === 'arret-deplace' && remplacement ? { arretRemplacement: remplacement } : {}),
    message: { fr: message.trim() },
    publieLe: new Date().toISOString(),
    publiePar: identite?.nom ?? identite?.login ?? '—',
    gravite,
  })

  const servicesDeLaLigne = plan.lignes.find((l) => l.id === ligne)?.services ?? []

  async function ecrire(transformer: (p: Perturbation[]) => Perturbation[], resume: string) {
    if (!jeton) return
    setOccupe(true)
    setErreur(null)
    try {
      // On relit juste avant d'écrire : quelqu'un a pu publier entre-temps.
      const { urgences: actuel, sha } = await lireUrgencesDepot(jeton)
      await publierUrgences(
        jeton,
        { ...actuel, perturbations: transformer(actuel.perturbations) },
        sha,
        resume,
      )
      setPubliee(true)
      setMessage('')
      setTimeout(() => setPubliee(false), 6000)
      // Le déploiement prend une à deux minutes ; on relira ensuite.
      setTimeout(rafraichir, 90_000)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'publication-impossible')
    } finally {
      setOccupe(false)
    }
  }

  // — Non connecté ————————————————————————————————————————————————
  if (!identite) {
    return (
      <div className="pile pile--large">
        <header className="pile pile--serre">
          <h2>{t('admin.titre')}</h2>
          <p>{t('admin.intro')}</p>
        </header>

        <div className="encart encart--info">
          <div className="encart__titre">{t('admin.pasUnVerrou')}</div>
          {t('admin.pasUnVerrouDetail')}
        </div>

        {erreur && <div className="encart encart--alerte">{t(`admin.erreur.${erreur}`)}</div>}

        {connexionGithubConfiguree() && (
          <a
            className="bouton bouton--primaire"
            href={`${URL_WORKER}/auth/start?retour=${encodeURIComponent(window.location.href)}`}
          >
            {t('admin.connexionGithub')}
          </a>
        )}

        <details className="carte repli">
          <summary>{t('admin.jetonTitre')}</summary>
          <div className="pile pile--serre">
            <p className="champ__aide">{t('admin.jetonAide')}</p>
            <div className="champ">
              <label htmlFor="jeton">{t('admin.jetonLabel')}</label>
              <input
                id="jeton"
                type="password"
                autoComplete="off"
                value={saisieJeton}
                onChange={(e) => setSaisieJeton(e.target.value)}
                placeholder="github_pat_…"
              />
            </div>
            <button
              type="button"
              className="bouton"
              disabled={!saisieJeton.trim() || occupe}
              onClick={() => {
                ecrireJeton(saisieJeton.trim())
                setJeton(saisieJeton.trim())
                setSaisieJeton('')
              }}
            >
              {t('admin.verifier')}
            </button>
          </div>
        </details>

        <a className="bouton bouton--discret" href={lienEditeurGithub()} target="_blank" rel="noopener noreferrer">
          {t('admin.editerSurGithub')}
        </a>
      </div>
    )
  }

  // — Connecté mais sans droit d'écriture ——————————————————————————
  if (!identite.peutPublier) {
    return (
      <div className="pile pile--large">
        <h2>{t('admin.titre')}</h2>
        <div className="encart encart--alerte">
          <div className="encart__titre">{t('admin.accesRefuse')}</div>
          {t('admin.accesRefuseDetail', { login: identite.login })}
        </div>
        <button
          type="button"
          className="bouton"
          onClick={() => {
            ecrireJeton(null)
            setJeton(null)
          }}
        >
          {t('admin.deconnexion')}
        </button>
      </div>
    )
  }

  // — Connecté avec droit d'écriture ——————————————————————————————
  return (
    <div className="pile pile--large">
      <header className="rangee rangee--espacee">
        <h2>{t('admin.titre')}</h2>
        <span className="rangee">
          <span className="etiquette">{identite.login}</span>
          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => {
              ecrireJeton(null)
              setJeton(null)
            }}
          >
            {t('admin.deconnexion')}
          </button>
        </span>
      </header>

      <div className="encart encart--attention">
        <div className="encart__titre">{t('admin.responsabilite')}</div>
        {t('admin.responsabiliteDetail')}
      </div>

      {publiee && <div className="encart encart--info">{t('admin.publiee')}</div>}
      {erreur && <div className="encart encart--alerte">{t(`admin.erreur.${erreur}`)}</div>}

      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('admin.nouvelle')}</h3>

        <div className="champ">
          <label htmlFor="type">{t('admin.type')}</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value as TypePerturbation)}>
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`urgences.type.${x}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="champ">
          <label htmlFor="ligne">{t('admin.ligne')}</label>
          <select
            id="ligne"
            value={ligne}
            onChange={(e) => {
              setLigne(e.target.value)
              setService('')
            }}
          >
            <option value="">{t('admin.toutesLignes')}</option>
            {plan.lignes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
        </div>

        {servicesDeLaLigne.length > 1 && (
          <div className="champ">
            <label htmlFor="service">{t('admin.course')}</label>
            <select id="service" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">{t('admin.toutesCourses')}</option>
              {servicesDeLaLigne.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(`plan.${s.periode === 'apres-midi' ? 'apresMidi' : s.periode}`)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="champ">
          <label htmlFor="arret">{t('admin.arret')}</label>
          <select id="arret" value={arret} onChange={(e) => setArret(e.target.value)}>
            <option value="">{t('admin.tousArrets')}</option>
            {arrets.map((a) => (
              <option key={a.id} value={a.id}>
                {nomArret(a, t)}
              </option>
            ))}
          </select>
        </div>

        {type === 'retard' && (
          <div className="champ">
            <label htmlFor="minutes">{t('admin.minutes')}</label>
            <input
              id="minutes"
              type="number"
              min={1}
              max={120}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>
        )}

        {type === 'arret-deplace' && (
          <div className="champ">
            <label htmlFor="remplacement">{t('admin.remplacement')}</label>
            <select
              id="remplacement"
              value={remplacement}
              onChange={(e) => setRemplacement(e.target.value)}
            >
              <option value="">—</option>
              {arrets.map((a) => (
                <option key={a.id} value={a.id}>
                  {nomArret(a, t)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rangee">
          <div className="champ champ--flexible">
            <label htmlFor="du">{t('admin.du')}</label>
            <input id="du" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
          </div>
          <div className="champ champ--flexible">
            <label htmlFor="au">{t('admin.au')}</label>
            <input id="au" type="date" value={au} min={du} onChange={(e) => setAu(e.target.value)} />
          </div>
        </div>
        <p className="champ__aide">{t('admin.expiration')}</p>

        <div className="champ">
          <label htmlFor="gravite">{t('admin.gravite')}</label>
          <select id="gravite" value={gravite} onChange={(e) => setGravite(e.target.value as Gravite)}>
            {GRAVITES.map((g) => (
              <option key={g} value={g}>
                {t(`admin.gravites.${g}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="champ">
          <label htmlFor="message">{t('admin.message')}</label>
          <input
            id="message"
            type="text"
            value={message}
            maxLength={200}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('admin.messagePlaceholder')}
          />
          <p className="champ__aide">{t('admin.messageAide')}</p>
        </div>
      </section>

      <section className="pile pile--serre">
        <h3 className="titre-carte">{t('admin.apercu')}</h3>
        <p className="champ__aide">{t('admin.apercuAide')}</p>
        <div className={`encart encart--${gravite === 'alerte' ? 'alerte' : gravite}`}>
          <ResumePerturbation p={brouillon()} />
        </div>
        <button
          type="button"
          className="bouton bouton--primaire"
          disabled={!message.trim() || occupe || au < du}
          onClick={() =>
            ecrire(
              (p) => [...p, brouillon()],
              `Urgence : ${type} — ${message.trim().slice(0, 60)}`,
            )
          }
        >
          {occupe ? t('commun.chargement') : t('admin.publier')}
        </button>
        <p className="champ__aide">{t('admin.delai')}</p>
      </section>

      <section className="pile pile--serre">
        <h3 className="titre-carte">
          {t('admin.enCours', { nombre: urgences.perturbations.length })}
        </h3>
        {urgences.perturbations.length === 0 && (
          <p className="champ__aide">{t('admin.aucune')}</p>
        )}
        {urgences.perturbations.map((p) => (
          <div className="carte pile pile--serre" key={p.id}>
            <ResumePerturbation p={p} />
            <p className="champ__aide">
              {p.du} → {p.au} · {p.id}
            </p>
            <button
              type="button"
              className="bouton bouton--danger"
              disabled={occupe}
              onClick={() => {
                if (confirm(t('admin.retirerConfirmation'))) {
                  void ecrire(
                    (liste) => liste.filter((x) => x.id !== p.id),
                    `Retrait de l'urgence ${p.id}`,
                  )
                }
              }}
            >
              {t('admin.retirer')}
            </button>
          </div>
        ))}
      </section>

      <hr className="separateur" />

      <AdminArrets jeton={jeton!} auteur={identite.nom ?? identite.login} onErreur={setErreur} />

      <hr className="separateur" />

      <AdminPlan jeton={jeton!} onErreur={setErreur} />

      <a className="bouton bouton--discret" href={lienEditeurGithub()} target="_blank" rel="noopener noreferrer">
        {t('admin.editerSurGithub')}
      </a>
      <p className="champ__aide">{langue === 'fr' ? '' : t('admin.messageLangue')}</p>
    </div>
  )
}
