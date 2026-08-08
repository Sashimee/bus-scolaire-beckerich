import { useEffect } from 'react'
import { useT } from '../i18n'
import { useUrgences } from '../urgences-contexte'
import { perturbationsDuJour, messagePerturbation, type Perturbation } from '../lib/urgences'
import { arret as trouverArret, plan } from '../lib/donnees'
import { nomArret } from '../lib/affichage'

const CLASSE_GRAVITE = {
  info: 'encart--info',
  attention: 'encart--attention',
  alerte: 'encart--alerte',
} as const

/** Décrit en une ligne ce que la perturbation change concrètement. */
export function ResumePerturbation({ p }: { p: Perturbation }) {
  const { t, langue } = useT()
  const ligne = plan.lignes.find((l) => l.id === p.ligne)

  const portee = [
    ligne?.nom,
    p.arret ? nomArret(trouverArret(p.arret), t) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div className="encart__titre rangee">
        <span>{t(`urgences.type.${p.type}`)}</span>
        {portee && <span className="etiquette">{portee}</span>}
      </div>
      <p>{messagePerturbation(p, langue)}</p>
      {p.type === 'retard' && p.minutes ? (
        <p className="champ__aide">{t('urgences.retardDe', { minutes: p.minutes })}</p>
      ) : null}
      {p.type === 'arret-deplace' && p.arretRemplacement ? (
        <p className="champ__aide">
          {t('urgences.remplacePar', {
            arret: nomArret(trouverArret(p.arretRemplacement), t),
          })}
        </p>
      ) : null}
      <p className="champ__aide">
        {t('urgences.publiePar', {
          personne: p.publiePar,
          date: new Date(p.publieLe).toLocaleString(langue),
        })}
      </p>
    </>
  )
}

/**
 * Perturbations du jour, affichées en tête d'application tant qu'elles s'appliquent.
 *
 * Elles ne sont pas refermables : une annulation de bus doit rester sous les yeux du
 * parent, pas disparaître au premier geste maladroit. Le placement dans la page revient
 * à `PileBandeaux`, qui arbitre entre les bandeaux concurrents.
 */
export function BandeauUrgences() {
  const { t } = useT()
  const { urgences, marquerVues } = useUrgences()
  const actives = perturbationsDuJour(urgences, new Date())

  useEffect(() => {
    if (actives.length) marquerVues(actives.map((p) => p.id))
  }, [actives.map((p) => p.id).join(','), marquerVues]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!actives.length) return null

  return (
    <div className="pile pile--serre" role="status" aria-live="polite">
      {actives.map((p) => (
        <div className={`encart ${CLASSE_GRAVITE[p.gravite]}`} key={p.id}>
          <ResumePerturbation p={p} />
        </div>
      ))}
      <p className="champ__aide">{t('urgences.avertissementFiabilite')}</p>
    </div>
  )
}
