import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { useBlocageRechargement } from '../rechargement-contexte'
import { plan } from '../lib/donnees'
import { nomArretParId } from '../lib/affichage'
import { validerPlan, type Probleme } from '../lib/validation'
import { ErreurCommune, chargerSession, publierPlan, type MotifCommune } from '../lib/commune'
import type { Plan } from '../lib/types'

/** Une heure modifiée, repérée par sa place exacte dans le plan. */
interface Retouche {
  ligne: string
  service: string
  indice: number
  arret: string
  avant: string | null
  apres: string
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Modifier un horaire, sans jamais voir de JSON.
 *
 * L'éditeur brut reste sur `/admin`, réservé au mainteneur. Ici, une vue tabulaire :
 * ligne → course → arrêts, chaque heure étant un champ modifiable. Ce que l'agent
 * confirme avant publication est un diff en français, pas un objet.
 *
 * La publication passe par le Worker, qui **revalide le plan complet** avec le même
 * `validerPlan()` que celui utilisé ici. La validation côté navigateur sert à montrer
 * les problèmes tout de suite ; c'est celle du Worker qui fait autorité.
 */
export function CommuneHoraires() {
  const { t } = useT()
  const naviguer = useNavigate()
  const session = chargerSession()

  const [ligneId, setLigneId] = useState(plan.lignes[0]?.id ?? '')
  const [retouches, setRetouches] = useState<Retouche[]>([])
  const [occupe, setOccupe] = useState(false)
  const [motif, setMotif] = useState<MotifCommune | null>(null)
  const [problemes, setProblemes] = useState<Probleme[]>([])
  const [publie, setPublie] = useState(false)

  useBlocageRechargement(retouches.length > 0 && !publie, 'commune-horaires')

  useEffect(() => {
    if (!session) naviguer('/commune')
  }, [session, naviguer])

  const ligne = plan.lignes.find((l) => l.id === ligneId)

  /** L'heure actuellement affichée pour un arrêt : la retouche si elle existe. */
  const heureAffichee = (service: string, indice: number, dorigine: string | null) =>
    retouches.find((r) => r.service === service && r.indice === indice)?.apres ?? dorigine ?? ''

  const retoucher = (service: string, indice: number, arret: string, avant: string | null, apres: string) => {
    setPublie(false)
    setRetouches((liste) => {
      const autres = liste.filter((r) => !(r.service === service && r.indice === indice))
      // Revenir à la valeur d'origine efface la retouche : le diff ne doit montrer
      // que ce qui change réellement.
      if (apres === (avant ?? '') || apres === '') return autres
      return [...autres, { ligne: ligneId, service, indice, arret, avant, apres }]
    })
  }

  /** Le plan complet, retouches appliquées. C'est lui qui part au Worker. */
  const planModifie = useMemo((): Plan => {
    if (!retouches.length) return plan
    return {
      ...plan,
      lignes: plan.lignes.map((l) => ({
        ...l,
        services: l.services.map((s) => ({
          ...s,
          arrets: s.arrets.map((a, i) => {
            const r = retouches.find((x) => x.service === s.id && x.indice === i)
            return r ? { ...a, heure: r.apres } : a
          }),
        })),
      })),
    }
  }, [retouches])

  const invalides = retouches.filter((r) => !HEURE.test(r.apres))

  if (!session) return null

  const publier = async () => {
    setOccupe(true)
    setMotif(null)
    setProblemes([])

    // Validation locale d'abord : montrer les problèmes sans attendre l'aller-retour.
    const locaux = validerPlan(planModifie)
    const erreurs = locaux.filter((p) => p.gravite === 'erreur')
    if (erreurs.length) {
      setProblemes(erreurs)
      setOccupe(false)
      return
    }

    try {
      await publierPlan(
        session,
        planModifie,
        retouches.map((r) => `${r.arret} ${r.avant ?? '—'}→${r.apres}`).join(', '),
      )
      setPublie(true)
      setRetouches([])
    } catch (erreur) {
      if (erreur instanceof ErreurCommune) {
        setMotif(erreur.motif)
        if (erreur.motif === 'plan-invalide') setProblemes((erreur.detail as Probleme[]) ?? [])
      } else {
        setMotif('inconnu')
      }
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="pile pile--large">
      <header className="rangee rangee--espacee">
        <h2>{t('commune.horairesTitre')}</h2>
        <span className="etiquette">{session.nom}</span>
      </header>

      <div className="encart encart--attention">
        <div className="encart__titre">{t('commune.horairesAvertissement')}</div>
        {t('commune.horairesAvertissementDetail')}
      </div>

      <div className="champ">
        <label htmlFor="ligne">{t('commune.ligne')}</label>
        <select id="ligne" value={ligneId} onChange={(e) => setLigneId(e.target.value)}>
          {plan.lignes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
      </div>

      {ligne?.services.map((service) => (
        <section className="pile pile--serre" key={service.id}>
          <h3 className="titre-carte">
            {t(`plan.${service.periode === 'apres-midi' ? 'apresMidi' : service.periode}`)}
          </h3>
          <p className="champ__aide">
            {service.jours.map((j) => t(`jours.${j}Court`)).join(' ')}
          </p>

          <div className="tableau-conteneur">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('commune.arret')}</th>
                  <th scope="col">{t('commune.heure')}</th>
                </tr>
              </thead>
              <tbody>
                {service.arrets.map((a, i) => (
                  <tr key={`${a.arret}-${i}`}>
                    <th scope="row" className="tableau__arret">
                      {nomArretParId(a.arret, t)}
                    </th>
                    <td>
                      <label
                        className="visuellement-cache"
                        htmlFor={`${service.id}-${i}`}
                      >
                        {nomArretParId(a.arret, t)}
                      </label>
                      <input
                        id={`${service.id}-${i}`}
                        type="time"
                        step={60}
                        value={heureAffichee(service.id, i, a.heure)}
                        onChange={(e) => retoucher(service.id, i, a.arret, a.heure, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/*
       * Le diff, en français. C'est la seule chose que l'agent doit relire avant de
       * publier : « Aller — Bus 2, matin, Hovelange · Kneppchen : 07:32 → 07:35 ».
       */}
      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('commune.modifications', { nombre: retouches.length })}</h3>

        {retouches.length === 0 ? (
          <p className="champ__aide">{t('commune.aucuneModification')}</p>
        ) : (
          <ul className="liste-puces pile pile--serre">
            {retouches.map((r) => {
              const l = plan.lignes.find((x) => x.id === r.ligne)
              const s = l?.services.find((x) => x.id === r.service)
              return (
                <li key={`${r.service}-${r.indice}`}>
                  {l?.nom} · {t(`plan.${s?.periode === 'apres-midi' ? 'apresMidi' : s?.periode}`)} ·{' '}
                  {nomArretParId(r.arret, t)} : <b className="heure">{r.avant ?? '—'}</b>
                  <span aria-hidden="true"> → </span>
                  <b className="heure">{r.apres}</b>
                </li>
              )
            })}
          </ul>
        )}

        {invalides.length > 0 && (
          <div className="encart encart--alerte">{t('commune.heureInvalide')}</div>
        )}

        {problemes.length > 0 && (
          <div className="encart encart--alerte">
            <div className="encart__titre">{t('commune.planRefuse')}</div>
            <ul className="liste-puces">
              {problemes.slice(0, 15).map((p, i) => (
                <li key={i}>
                  <strong>{p.ou}</strong> — {p.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {motif && motif !== 'plan-invalide' && (
          <div className="encart encart--alerte" role="alert">
            {t(
              `commune.erreur.${
                motif === 'session-expiree'
                  ? 'sessionExpiree'
                  : motif === 'conflit'
                    ? 'conflit'
                    : motif === 'reseau'
                      ? 'reseau'
                      : 'inconnu'
              }`,
            )}
          </div>
        )}

        {publie && <div className="encart encart--info">{t('commune.planPublie')}</div>}

        <p className="champ__aide">{t('commune.reconstruction')}</p>

        <button
          type="button"
          className="bouton bouton--primaire"
          disabled={occupe || retouches.length === 0 || invalides.length > 0}
          onClick={() => {
            if (confirm(t('commune.publierPlanConfirmation', { nombre: retouches.length }))) {
              void publier()
            }
          }}
        >
          {occupe ? t('commun.chargement') : t('commune.publierPlan')}
        </button>

        {retouches.length > 0 && (
          <button type="button" className="bouton bouton--discret" onClick={() => setRetouches([])}>
            {t('commune.annulerModifications')}
          </button>
        )}
      </section>

      <Link to="/commune" className="bouton bouton--discret">
        {t('commune.retourAccueil')}
      </Link>
    </div>
  )
}
