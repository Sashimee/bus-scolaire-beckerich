import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { Assistant, type Etape } from '../composants/Assistant'
import { ResumePerturbation } from '../composants/BandeauUrgences'
import { useUrgences } from '../urgences-contexte'
import { useBlocageRechargement } from '../rechargement-contexte'
import { arrets, plan } from '../lib/donnees'
import { nomArret } from '../lib/affichage'
import {
  ErreurCommune,
  chargerSession,
  publierPerturbation,
  retirerPerturbation,
  type MotifCommune,
} from '../lib/commune'
import type { Gravite, Perturbation, TypePerturbation } from '../lib/urgences'

/**
 * Les quatre situations que la commune annonce réellement, dans ses mots.
 *
 * Le type technique est déduit du choix : l'agent ne voit jamais « arret-deplace »,
 * il voit « Un arrêt est déplacé ».
 */
const SITUATIONS: { cle: string; type: TypePerturbation; gravite: Gravite }[] = [
  { cle: 'annulation', type: 'annulation', gravite: 'alerte' },
  { cle: 'retard', type: 'retard', gravite: 'attention' },
  { cle: 'deplacement', type: 'arret-deplace', gravite: 'attention' },
  { cle: 'information', type: 'message', gravite: 'info' },
]

const GRAVITES: Gravite[] = ['info', 'attention', 'alerte']

const jourIso = (decalage = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + decalage)
  return d.toISOString().slice(0, 10)
}

/**
 * Annoncer une perturbation, en cinq questions.
 *
 * Reprend la logique de `/admin` mais pas sa forme : là-bas, dix champs d'un bloc,
 * dont certains n'ont de sens que pour deux types sur quatre. Ici une question par
 * écran, dans l'ordre où on y pense — quoi, qui, quand, quelle gravité, et enfin ce
 * que verront les parents.
 */
export function CommuneAlertes() {
  const { t, langue } = useT()
  const naviguer = useNavigate()
  const { urgences, rafraichir } = useUrgences()
  const session = chargerSession()

  const [indice, setIndice] = useState(0)
  const [situation, setSituation] = useState(SITUATIONS[0])
  const [ligne, setLigne] = useState('')
  const [service, setService] = useState('')
  const [arret, setArret] = useState('')
  const [remplacement, setRemplacement] = useState('')
  const [minutes, setMinutes] = useState(10)
  const [quand, setQuand] = useState<'aujourdhui' | 'deuxJours' | 'dates'>('aujourdhui')
  const [du, setDu] = useState(jourIso())
  const [au, setAu] = useState(jourIso())
  const [gravite, setGravite] = useState<Gravite>(SITUATIONS[0].gravite)
  // Trois rappels par défaut sur une alerte : c'est le plafond, et une annulation
  // publiée à 6 h 40 n'est vue de personne sans eux.
  const [rappels, setRappels] = useState(3)
  const [message, setMessage] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [motif, setMotif] = useState<MotifCommune | null>(null)
  const [publiee, setPubliee] = useState(false)

  // Une saisie en cours ne doit pas disparaître sous un rechargement automatique.
  useBlocageRechargement(message.trim().length > 0 && !publiee, 'commune-alerte')

  useEffect(() => {
    if (!session) naviguer('/commune')
  }, [session, naviguer])

  const servicesDeLaLigne = useMemo(
    () => plan.lignes.find((l) => l.id === ligne)?.services ?? [],
    [ligne],
  )

  const dates = useMemo(() => {
    if (quand === 'aujourdhui') return { du: jourIso(), au: jourIso() }
    if (quand === 'deuxJours') return { du: jourIso(), au: jourIso(1) }
    return { du, au }
  }, [quand, du, au])

  const brouillon = (): Perturbation => ({
    id: `commune-${Date.now().toString(36)}`,
    du: dates.du,
    au: dates.au,
    type: situation.type,
    ...(ligne ? { ligne } : {}),
    ...(service ? { service } : {}),
    ...(arret ? { arret } : {}),
    ...(situation.type === 'retard' ? { minutes } : {}),
    ...(situation.type === 'arret-deplace' && remplacement
      ? { arretRemplacement: remplacement }
      : {}),
    message: { [langue]: message.trim(), fr: message.trim() },
    publieLe: new Date().toISOString(),
    publiePar: session?.nom ?? '',
    gravite,
    // Les rappels ne valent que pour une alerte : ailleurs, insister n'apporte rien
    // et use la confiance dans la notification.
    ...(gravite === 'alerte' ? { rappels } : {}),
  })

  if (!session) return null

  const publier = async () => {
    setOccupe(true)
    setMotif(null)
    try {
      await publierPerturbation(session, brouillon())
      setPubliee(true)
      rafraichir()
    } catch (erreur) {
      setMotif(erreur instanceof ErreurCommune ? erreur.motif : 'inconnu')
    } finally {
      setOccupe(false)
    }
  }

  const retirer = async (id: string) => {
    if (!confirm(t('commune.retirerConfirmation'))) return
    setOccupe(true)
    try {
      await retirerPerturbation(session, id)
      rafraichir()
    } catch (erreur) {
      setMotif(erreur instanceof ErreurCommune ? erreur.motif : 'inconnu')
    } finally {
      setOccupe(false)
    }
  }

  const etapes: Etape[] = [
    // 1. Que se passe-t-il ? Quatre grandes cartes, sans jargon.
    {
      cle: 'situation',
      contenu: (
        <div className="pile pile--serre">
          {SITUATIONS.map((s) => (
            <button
              key={s.cle}
              type="button"
              className={`choix${situation.cle === s.cle ? ' choix--retenu' : ''}`}
              aria-pressed={situation.cle === s.cle}
              onClick={() => {
                setSituation(s)
                // La gravité suit la situation, mais reste modifiable à l'étape 4.
                setGravite(s.gravite)
              }}
            >
              <span className="choix__titre">{t(`commune.situation.${s.cle}`)}</span>
              <span className="choix__aide">{t(`commune.situation.${s.cle}Aide`)}</span>
            </button>
          ))}
        </div>
      ),
    },

    // 2. Qui est concerné ? Jamais d'identifiant technique à l'écran.
    {
      cle: 'portee',
      contenu: (
        <div className="carte pile pile--serre">
          <div className="champ">
            <label htmlFor="ligne">{t('commune.ligne')}</label>
            <select
              id="ligne"
              value={ligne}
              onChange={(e) => {
                setLigne(e.target.value)
                setService('')
              }}
            >
              <option value="">{t('commune.toutesLignes')}</option>
              {plan.lignes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </div>

          {servicesDeLaLigne.length > 1 && (
            <div className="champ">
              <label htmlFor="service">{t('commune.course')}</label>
              <select id="service" value={service} onChange={(e) => setService(e.target.value)}>
                <option value="">{t('commune.toutesCourses')}</option>
                {servicesDeLaLigne.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(`plan.${s.periode === 'apres-midi' ? 'apresMidi' : s.periode}`)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="champ">
            <label htmlFor="arret">{t('commune.arret')}</label>
            <select id="arret" value={arret} onChange={(e) => setArret(e.target.value)}>
              <option value="">{t('commune.tousArrets')}</option>
              {arrets.map((a) => (
                <option key={a.id} value={a.id}>
                  {nomArret(a, t)}
                </option>
              ))}
            </select>
          </div>

          {situation.type === 'arret-deplace' && (
            <div className="champ">
              <label htmlFor="remplacement">{t('commune.remplacement')}</label>
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

          {situation.type === 'retard' && (
            <div className="champ">
              <label htmlFor="minutes">{t('commune.minutes')}</label>
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

          {/* Une perturbation sans ligne ni arrêt s'affiche chez tout le monde : le
              dire ici évite d'alarmer une commune entière par inadvertance. */}
          {!ligne && !arret && (
            <div className="encart encart--attention">{t('commune.porteeLarge')}</div>
          )}
        </div>
      ),
    },

    // 3. Quand ? Des boutons, pas deux champs date nus.
    {
      cle: 'quand',
      contenu: (
        <div className="carte pile pile--serre">
          <div className="segments" role="group" aria-label={t('assistant.quand')}>
            {(['aujourdhui', 'deuxJours', 'dates'] as const).map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={quand === q}
                onClick={() => setQuand(q)}
              >
                {t(`commune.quand.${q}`)}
              </button>
            ))}
          </div>

          {quand === 'dates' && (
            <div className="rangee">
              <div className="champ champ--flexible">
                <label htmlFor="du">{t('commune.du')}</label>
                <input id="du" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
              </div>
              <div className="champ champ--flexible">
                <label htmlFor="au">{t('commune.au')}</label>
                <input
                  id="au"
                  type="date"
                  value={au}
                  min={du}
                  onChange={(e) => setAu(e.target.value)}
                />
              </div>
            </div>
          )}

          <p className="champ__aide">
            {t('commune.periodeRetenue', { du: dates.du, au: dates.au })}
          </p>
          <p className="champ__aide">{t('commune.expiration')}</p>
        </div>
      ),
    },

    // 4. Message et gravité. La gravité s'exprime en conséquences, pas en jargon.
    {
      cle: 'message',
      pretePourLaSuite: message.trim().length > 0,
      contenu: (
        <div className="carte pile pile--serre">
          <div className="champ">
            <label htmlFor="message">{t('commune.message')}</label>
            <input
              id="message"
              type="text"
              value={message}
              maxLength={200}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('commune.messagePlaceholder')}
            />
            <p className="champ__aide">
              {t('commune.messageAide', { restant: 200 - message.length })}
            </p>
          </div>

          <fieldset className="fieldset-nu">
            <legend className="legende" id="gravite-legende">
              {t('commune.gravite')}
            </legend>
            <div className="pile pile--serre">
              {GRAVITES.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`choix${gravite === g ? ' choix--retenu' : ''}`}
                  aria-pressed={gravite === g}
                  onClick={() => setGravite(g)}
                >
                  <span className="choix__titre">{t(`commune.gravites.${g}`)}</span>
                  <span className="choix__aide">{t(`commune.gravites.${g}Aide`)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {gravite === 'alerte' && (
            <div className="champ">
              <label htmlFor="rappels">{t('commune.rappels')}</label>
              <select
                id="rappels"
                value={rappels}
                onChange={(e) => setRappels(Number(e.target.value))}
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {t(`commune.rappelsOption.${n}`)}
                  </option>
                ))}
              </select>
              <p className="champ__aide">{t('commune.rappelsAide')}</p>
            </div>
          )}
        </div>
      ),
    },

    // 5. Aperçu à l'identique, puis publication.
    {
      cle: 'apercu',
      contenu: (
        <div className="pile pile--serre">
          <p className="champ__aide">{t('commune.apercuAide')}</p>
          <div className={`encart encart--${gravite === 'alerte' ? 'alerte' : gravite}`}>
            <ResumePerturbation p={brouillon()} />
          </div>
          <p className="champ__aide">{t('commune.delai')}</p>
          {publiee && <div className="encart encart--info">{t('commune.publiee')}</div>}
          {motif && (
            <div className="encart encart--alerte" role="alert">
              {t(`commune.erreur.${motif === 'session-expiree' ? 'sessionExpiree' : motif === 'reseau' ? 'reseau' : 'inconnu'}`)}
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="pile pile--large">
      <header className="rangee rangee--espacee">
        <h2>{t('commune.alertesTitre')}</h2>
        <span className="etiquette">{session.nom}</span>
      </header>

      <div className="encart encart--attention">
        <div className="encart__titre">{t('commune.responsabilite')}</div>
        {t('commune.responsabiliteDetail')}
      </div>

      <Assistant
        etapes={etapes}
        indice={Math.min(indice, etapes.length - 1)}
        onIndice={setIndice}
        fin={
          <button
            type="button"
            className="bouton bouton--primaire"
            disabled={occupe || publiee || !message.trim()}
            onClick={publier}
          >
            {occupe ? t('commun.chargement') : t('commune.publier')}
          </button>
        }
      />

      <section className="pile pile--serre">
        <h3 className="titre-carte">
          {t('commune.enCours', { nombre: urgences.perturbations.length })}
        </h3>
        {urgences.perturbations.length === 0 && (
          <p className="champ__aide">{t('commune.aucune')}</p>
        )}
        {urgences.perturbations.map((p) => (
          <div className="carte pile pile--serre" key={p.id}>
            <ResumePerturbation p={p} />
            <p className="champ__aide">
              {p.du} → {p.au}
            </p>
            <button
              type="button"
              className="bouton bouton--danger"
              disabled={occupe}
              onClick={() => void retirer(p.id)}
            >
              {t('commune.retirer')}
            </button>
          </div>
        ))}
      </section>

      <Link to="/commune" className="bouton bouton--discret">
        {t('commune.retourAccueil')}
      </Link>
    </div>
  )
}
