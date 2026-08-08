import { useT } from '../i18n'
import { destinationTrajet, nomArret } from '../lib/affichage'
import { plan, siteDuCycle } from '../lib/donnees'
import { semaineEnfant, type ContexteEnfant } from '../lib/plan'
import { JOURS } from '../lib/types'
import type { Jour, TypeTrajet } from '../lib/types'

const LIBELLE_DESTINATION = {
  ecole: 'impression.versEcole',
  maison: 'impression.versMaison',
  dillendapp: 'impression.versDillendapp',
} as const

const libelleDestination = (type: TypeTrajet) => LIBELLE_DESTINATION[destinationTrajet(type)]

/**
 * Au-delà de cinq enfants, une colonne fait moins de 28 mm : les heures s'y cassent en
 * quatre morceaux et la feuille devient illisible. On pagine alors par groupes de
 * quatre, ce qui rend deux pages propres plutôt qu'une bouillie.
 *
 * Cinq est aussi la limite naturelle du domaine — précoce plus C1 à C4 — donc le cas
 * « six enfants » restera théorique. Il doit néanmoins produire quelque chose de juste.
 */
const MAX_UNE_PAGE = 5
const PAR_PAGE_AU_DELA = 4

function grouper<T>(elements: T[]): T[][] {
  if (elements.length <= MAX_UNE_PAGE) return [elements]
  const pages: T[][] = []
  for (let i = 0; i < elements.length; i += PAR_PAGE_AU_DELA) {
    pages.push(elements.slice(i, i + PAR_PAGE_AU_DELA))
  }
  return pages
}

/** Ce qu'une cellule doit dire d'une journée : les trajets, puis ce que le parent doit faire. */
function CelluleJour({ ctx, jour }: { ctx: ContexteEnfant; jour: Jour }) {
  const { t } = useT()
  const journee = semaineEnfant(ctx).find((j) => j.jour === jour)!
  const utiles = journee.trajets.filter((x) => x.concerneParent)
  const sansBus = (ctx.enfant.bus?.[jour] ?? 'aller-retour') === 'aucun'

  return (
    <>
      {sansBus ? (
        <span className="fiche__vide">{t('bus.sansBus')}</span>
      ) : utiles.length ? (
        <ul className="fiche__trajets fiche__trajets--colonne">
          {utiles.map((trajet, i) => (
            <li key={`${trajet.type}-${i}`}>
              <b>{trajet.depart.heure ?? '—'}</b>
              <span aria-hidden="true"> → </span>
              <b>{trajet.arrivee.heure ?? '—'}</b>
              <span className="fiche__ligne"> {t(libelleDestination(trajet.type))}</span>
              <span className="fiche__ligne"> {trajet.ligne.nom}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="fiche__vide">—</span>
      )}

      {journee.depose && (
        <div className="fiche__note">
          <b>{t('dillendapp.depose', { heure: journee.depose.heure })}</b>
        </div>
      )}
      {journee.recuperation && (
        <div className="fiche__note">
          <b>{t('dillendapp.recuperation', { heure: journee.recuperation.heure })}</b>
        </div>
      )}
      {journee.manquants.includes('retour-soir') && (
        <div className="fiche__note">{t('manquants.retour-soir')}</div>
      )}
    </>
  )
}

/**
 * Fiche papier de tout le foyer : un tableau, les cinq jours en lignes, un enfant par
 * colonne.
 *
 * `FicheImprimable` reste, pour l'impression d'un enfant seul. Celle-ci répond à un
 * autre besoin : une famille de trois enfants imprimait trois feuilles qu'il fallait
 * ensuite lire en parallèle pour savoir qui part quand. Ici, un coup d'œil suffit.
 *
 * La contrainte est la largeur, pas la hauteur : sur A4 portrait avec 12 mm de marge,
 * il reste 186 mm, moins 22 mm pour la colonne des jours. Le corps de texte se règle
 * donc sur le nombre d'enfants, par `data-enfants`.
 */
export function FicheFoyer({ contextes }: { contextes: ContexteEnfant[] }) {
  const { t, langue } = useT()
  if (!contextes.length) return null

  return (
    <div className="fiche">
      {grouper(contextes).map((page, iPage) => (
        <article className="fiche-foyer" data-enfants={page.length} key={iPage}>
          <header className="fiche__entete">
            <h1 className="fiche__nom">{t('impression.familleTitre')}</h1>
            <p className="fiche__site">
              {t('impression.genereLe', { date: new Date().toLocaleDateString(langue) })}
            </p>
          </header>

          <table className="fiche__tableau fiche-foyer__tableau">
            <thead>
              <tr>
                <th scope="col">{t('impression.jour')}</th>
                {page.map((ctx) => (
                  <th scope="col" key={ctx.enfant.id}>
                    <span className="fiche-foyer__prenom">{ctx.enfant.prenom}</span>
                    <span className="fiche__ligne">
                      {t(`cycles.${ctx.enfant.cycle}`)} · {siteDuCycle(ctx.enfant.cycle).nom}
                    </span>
                    <span className="fiche__ligne">
                      {ctx.marcheDirecte
                        ? t('impression.aPied')
                        : `${nomArret(ctx.arretDomicile, t)} · ${t('enfant.tempsMarche', {
                            minutes: ctx.temps,
                          })}`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {JOURS.map((jour) => (
                <tr key={jour}>
                  <th scope="row">{t(`jours.${jour}`)}</th>
                  {page.map((ctx) => (
                    <td key={ctx.enfant.id}>
                      {ctx.marcheDirecte ? (
                        <span className="fiche__vide">{t('impression.aPied')}</span>
                      ) : (
                        <CelluleJour ctx={ctx} jour={jour} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <footer className="fiche__pied">
            <p>
              <strong>{t('avertissement.independance')}</strong> {t('avertissement.priorite')}
            </p>
            <p>
              {t('plan.anneeScolaire', { annee: plan.anneesCouvertes.join(' · ') })} ·{' '}
              {plan.source.url}
            </p>
          </footer>
        </article>
      ))}
    </div>
  )
}
