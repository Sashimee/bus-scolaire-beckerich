import { useT } from '../i18n'
import { destinationTrajet, nomArret } from '../lib/affichage'
import { siteDuCycle, plan } from '../lib/donnees'
import { semaineEnfant, type ContexteEnfant } from '../lib/plan'
import { JOURS } from '../lib/types'
import type { TypeTrajet } from '../lib/types'

/** Clés d'affichage de la destination, pour tenir dans une cellule de tableau. */
const LIBELLE_DESTINATION = {
  ecole: 'impression.versEcole',
  maison: 'impression.versMaison',
  dillendapp: 'impression.versDillendapp',
} as const

function libelleDestination(type: TypeTrajet): string {
  return LIBELLE_DESTINATION[destinationTrajet(type)]
}

/**
 * Fiche d'un enfant destinée au papier.
 *
 * Volontairement séparée de l'affichage écran plutôt que dérivée de lui : la mise en
 * page confortable d'un téléphone occupe trois pages A4, ce qui est inutilisable sur
 * une porte de frigo. Ici, tout tient sur une page, sans couleur, lisible de loin.
 */
export function FicheImprimable({ ctx }: { ctx: ContexteEnfant }) {
  const { t, langue } = useT()
  const { enfant } = ctx
  const semaine = semaineEnfant(ctx)

  return (
    <article className="fiche" aria-hidden="true">
      <header className="fiche__entete">
        <h1 className="fiche__nom">{enfant.prenom}</h1>
        <p className="fiche__site">
          {t(`cycles.${enfant.cycle}`)} · {siteDuCycle(enfant.cycle).nom}
        </p>
      </header>

      {ctx.marcheDirecte ? (
        <p className="fiche__arret">
          <strong>{t('impression.aPied')} :</strong>{' '}
          {t('enfant.aPiedDetail', {
            minutes: ctx.temps,
            site: siteDuCycle(enfant.cycle).nom,
            prenom: enfant.prenom,
          })}
        </p>
      ) : (
        <p className="fiche__arret">
          <strong>{t('enfant.arretLePlusProche')} :</strong> {nomArret(ctx.arretDomicile, t)} —{' '}
          {t('enfant.tempsMarcheEstimation', { minutes: ctx.temps })}
          {ctx.arretDomicile.precision === 'approximative' &&
            ` (${t('arrets.precisionApproximative').toLowerCase()})`}
        </p>
      )}

      {!ctx.marcheDirecte && (
      <table className="fiche__tableau">
        <thead>
          <tr>
            <th scope="col">{t('impression.jour')}</th>
            <th scope="col">{t('impression.midi')}</th>
            <th scope="col">{t('impression.trajets')}</th>
          </tr>
        </thead>
        <tbody>
          {JOURS.map((jour) => {
            const journee = semaine.find((j) => j.jour === jour)!
            const utiles = journee.trajets.filter((x) => x.concerneParent)
            const sansBus = (enfant.bus?.[jour] ?? 'aller-retour') === 'aucun'

            return (
              <tr key={jour}>
                <th scope="row">{t(`jours.${jour}`)}</th>
                <td>{t(`repas.${enfant.repas[jour]}Court`)}</td>
                <td>
                  {sansBus ? (
                    <span className="fiche__vide">{t('bus.sansBus')}</span>
                  ) : utiles.length ? (
                    <ul className="fiche__trajets">
                      {utiles.map((trajet, i) => (
                        <li key={`${trajet.type}-${i}`}>
                          <b>{trajet.depart.heure ?? '—'}</b> {t(libelleDestination(trajet.type))}
                          <span className="fiche__ligne"> {trajet.ligne.nom}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="fiche__vide">—</span>
                  )}
                  {journee.recuperation && (
                    <div className="fiche__note">
                      <b>{t('dillendapp.recuperation', { heure: journee.recuperation.heure })}</b>
                    </div>
                  )}
                  {journee.manquants.includes('retour-soir') && (
                    <div className="fiche__note">{t('manquants.retour-soir')}</div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      )}

      <footer className="fiche__pied">
        <p>
          <strong>{t('avertissement.independance')}</strong> {t('avertissement.priorite')}
        </p>
        <p>
          {t('plan.anneeScolaire', { annee: plan.anneesCouvertes.join(' · ') })} ·{' '}
          {plan.source.url} ·{' '}
          {t('impression.genereLe', { date: new Date().toLocaleDateString(langue) })}
        </p>
      </footer>
    </article>
  )
}
