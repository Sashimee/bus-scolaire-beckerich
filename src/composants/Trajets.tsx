import { useT } from '../i18n'
import { nomArret } from '../lib/affichage'
import { incertitude } from '../lib/donnees'
import type { JourneeEnfant, Trajet } from '../lib/types'

/** Une ligne de trajet : heure, intitulé, arrêts, ligne et notes éventuelles. */
export function LigneTrajet({ trajet }: { trajet: Trajet }) {
  const { t } = useT()
  const interne = !trajet.concerneParent

  return (
    <div className={`trajet${interne ? ' trajet--interne' : ''}`}>
      <span className="trajet__heure">
        {trajet.depart.heure ?? '—'}
        <span className="visuellement-cache">
          {trajet.depart.heure ? '' : t('trajets.heureNonPubliee')}
        </span>
      </span>

      <div>
        <div className="trajet__titre">{t(`trajets.${trajet.type}`)}</div>
      </div>

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
export function JourneeTrajets({ journee }: { journee: JourneeEnfant }) {
  const { t } = useT()
  const parent = journee.trajets.filter((x) => x.concerneParent)
  const internes = journee.trajets.filter((x) => !x.concerneParent)

  if (!journee.trajets.length && !journee.manquants.length) {
    return <p className="champ__aide">{t('trajets.aucun')}</p>
  }

  return (
    <div className="pile pile--serre">
      {parent.map((trajet, i) => (
        <LigneTrajet key={`${trajet.type}-${i}`} trajet={trajet} />
      ))}

      {internes.length > 0 && (
        <details>
          <summary className="champ__aide" style={{ cursor: 'pointer' }}>
            {t('trajets.interne')}
          </summary>
          {internes.map((trajet, i) => (
            <LigneTrajet key={`${trajet.type}-${i}`} trajet={trajet} />
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
