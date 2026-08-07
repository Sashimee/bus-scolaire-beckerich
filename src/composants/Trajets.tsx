import { useT } from '../i18n'
import { nomArret } from '../lib/affichage'
import { incertitude } from '../lib/donnees'
import {
  heureEffective,
  messagePerturbation,
  perturbationsDuTrajet,
  type Perturbation,
} from '../lib/urgences'
import type { JourneeEnfant, Trajet } from '../lib/types'

/** Une ligne de trajet : heure, intitulé, arrêts, ligne et notes éventuelles. */
export function LigneTrajet({
  trajet,
  perturbations = [],
}: {
  trajet: Trajet
  perturbations?: Perturbation[]
}) {
  const { t, langue } = useT()
  const interne = !trajet.concerneParent

  const concernees = perturbationsDuTrajet(perturbations, trajet)
  const annule = concernees.some((p) => p.type === 'annulation')
  const nouvelleHeure = heureEffective(trajet, concernees)
  const decale = !annule && nouvelleHeure !== null && nouvelleHeure !== trajet.depart.heure

  return (
    <div className={`trajet${interne ? ' trajet--interne' : ''}`}>
      <span className="trajet__heure">
        {annule ? (
          <s aria-label={t('urgences.annule')}>{trajet.depart.heure ?? '—'}</s>
        ) : decale ? (
          <>
            <s>{trajet.depart.heure}</s> {nouvelleHeure}
          </>
        ) : (
          (trajet.depart.heure ?? '—')
        )}
        <span className="visuellement-cache">
          {trajet.depart.heure ? '' : t('trajets.heureNonPubliee')}
        </span>
      </span>

      <div>
        <div className="trajet__titre">
          {t(`trajets.${trajet.type}`)}
          {annule && (
            <span className="etiquette" style={{ marginInlineStart: '0.5rem', color: 'var(--rouge)' }}>
              {t('urgences.annule')}
            </span>
          )}
          {decale && (
            <span className="etiquette" style={{ marginInlineStart: '0.5rem', color: 'var(--orange)' }}>
              {t('urgences.horaireModifie')}
            </span>
          )}
        </div>
      </div>

      {concernees.map((p) => (
        <p key={p.id} className="trajet__detail" style={{ color: 'var(--orange)' }}>
          {messagePerturbation(p, langue)}
        </p>
      ))}

      <div className="trajet__detail">
        {nomArret(trajet.depart.arret, t)} → {nomArret(trajet.arrivee.arret, t)}
        {trajet.arrivee.heure && ` · ${trajet.arrivee.heure}`}{' '}
        <span className="etiquette etiquette--ligne">{trajet.ligne.nom}</span>
      </div>

      {trajet.notes.map((note) => (
        <p key={note} className="trajet__detail">
          {t(`notes.${note}`)}
        </p>
      ))}

      {trajet.alternatives.length > 0 && (
        <p className="trajet__detail">
          {t('trajets.alternative', {
            ligne: trajet.alternatives[0].ligne.nom,
            heure: trajet.alternatives[0].heureDepart ?? '—',
          })}
        </p>
      )}
    </div>
  )
}

/** Les trajets d'une journée, séparant ce qui concerne le parent du reste. */
export function JourneeTrajets({
  journee,
  perturbations = [],
}: {
  journee: JourneeEnfant
  perturbations?: Perturbation[]
}) {
  const { t } = useT()
  const parent = journee.trajets.filter((x) => x.concerneParent)
  const internes = journee.trajets.filter((x) => !x.concerneParent)

  if (!journee.trajets.length && !journee.manquants.length) {
    return <p className="champ__aide">{t('trajets.aucun')}</p>
  }

  return (
    <div className="pile pile--serre">
      {parent.map((trajet, i) => (
        <LigneTrajet key={`${trajet.type}-${i}`} trajet={trajet} perturbations={perturbations} />
      ))}

      {internes.length > 0 && (
        <details>
          <summary className="champ__aide" style={{ cursor: 'pointer' }}>
            {t('trajets.interne')}
          </summary>
          {internes.map((trajet, i) => (
            <LigneTrajet key={`${trajet.type}-${i}`} trajet={trajet} perturbations={perturbations} />
          ))}
        </details>
      )}

      {journee.manquants.map((type) => (
        <div className="encart encart--attention" key={type}>
          <div className="encart__titre">{t('manquants.titre')}</div>
          {t(`manquants.${type}`) === `manquants.${type}`
            ? t('manquants.generique')
            : t(`manquants.${type}`)}
        </div>
      ))}

      {journee.incertitudes.map((id) => (
        <div className="encart encart--info" key={id}>
          <div className="encart__titre">{t('incertitudes.titre')}</div>
          {t(`incertitudes.${id}`)}
          {incertitude(id)?.aVerifierAupres && (
            <p className="champ__aide" style={{ marginBlockStart: '0.3rem' }}>
              {incertitude(id)!.aVerifierAupres}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
