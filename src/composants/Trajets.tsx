import { useT } from '../i18n'
import { nomArret, sensTrajet } from '../lib/affichage'
import { incertitude } from '../lib/donnees'
import {
  heureArriveeEffective,
  heureEffective,
  messagePerturbation,
  perturbationsDuTrajet,
  type Perturbation,
} from '../lib/urgences'
import type { JourneeEnfant, Trajet } from '../lib/types'

/**
 * Une heure de trajet, telle qu'elle doit se lire une fois les urgences appliquées :
 * barrée si le bus est annulé, barrée puis corrigée s'il est retardé.
 */
function HeureTrajet({
  heure,
  effective,
  annule,
  libelle,
}: {
  heure: string | null
  effective: string | null
  annule: boolean
  libelle: string
}) {
  const { t } = useT()
  const decale = !annule && effective !== null && effective !== heure

  return (
    <>
      <span className="visuellement-cache">
        {heure ? `${libelle} ` : `${libelle} ${t('trajets.heureNonPubliee')}`}
      </span>
      {annule ? (
        <s aria-label={t('urgences.annule')}>{heure ?? '—'}</s>
      ) : decale ? (
        <>
          <s>{heure}</s> {effective}
        </>
      ) : (
        (heure ?? '—')
      )}
    </>
  )
}

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
  const nouvelleArrivee = heureArriveeEffective(trajet, concernees)

  // Sur un retour, c'est l'heure d'arrivée que le parent doit voir en premier : c'est
  // elle qui lui dit quand être à l'arrêt.
  const retour = sensTrajet(trajet.type) === 'retour'
  const classeDepart = retour ? 'trajet__heure--secondaire' : 'trajet__heure--principale'
  const classeArrivee = retour ? 'trajet__heure--principale' : 'trajet__heure--secondaire'

  // L'étiquette « horaire modifié » suit l'heure mise en avant, pas systématiquement
  // celle du départ.
  const heureEnAvant = retour ? trajet.arrivee.heure : trajet.depart.heure
  const effectiveEnAvant = retour ? nouvelleArrivee : nouvelleHeure
  const decale = !annule && effectiveEnAvant !== null && effectiveEnAvant !== heureEnAvant

  return (
    <div className={`trajet${interne ? ' trajet--interne' : ''}`}>
      <span className={`trajet__heure ${classeDepart}`}>
        <HeureTrajet
          heure={trajet.depart.heure}
          effective={nouvelleHeure}
          annule={annule}
          libelle={t('trajets.depart')}
        />
      </span>

      <div className="trajet__corps">
        <div className="trajet__titre rangee">
          <span>{t(`trajets.${trajet.type}`)}</span>
          {annule && <span className="etiquette etiquette--danger">{t('urgences.annule')}</span>}
          {decale && (
            <span className="etiquette etiquette--attention">{t('urgences.horaireModifie')}</span>
          )}
        </div>
      </div>

      <span className={`trajet__heure ${classeArrivee}`}>
        <span aria-hidden="true">→ </span>
        <HeureTrajet
          heure={trajet.arrivee.heure}
          effective={nouvelleArrivee}
          annule={annule}
          libelle={t('trajets.arrivee')}
        />
      </span>

      {concernees.map((p) => (
        <p key={p.id} className="trajet__detail trajet__detail--attention">
          {messagePerturbation(p, langue)}
        </p>
      ))}

      <div className="trajet__detail">
        {nomArret(trajet.depart.arret, t)} → {nomArret(trajet.arrivee.arret, t)}{' '}
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
        <details className="repli">
          <summary className="champ__aide">{t('trajets.interne')}</summary>
          {internes.map((trajet, i) => (
            <LigneTrajet key={`${trajet.type}-${i}`} trajet={trajet} perturbations={perturbations} />
          ))}
        </details>
      )}

      {journee.recuperation && (
        <div className="encart encart--info">
          <div className="encart__titre">{t('dillendapp.aRecuperer')}</div>
          {t('dillendapp.recuperation', { heure: journee.recuperation.heure })}
        </div>
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
            <p className="champ__aide">{incertitude(id)!.aVerifierAupres}</p>
          )}
        </div>
      ))}
    </div>
  )
}
