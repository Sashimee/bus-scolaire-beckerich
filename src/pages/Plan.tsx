import { useT } from '../i18n'
import { cycles, plan } from '../lib/donnees'
import { alignerServices, nomArretParId } from '../lib/affichage'
import type { Ligne } from '../lib/types'

function TableauLigne({ ligne }: { ligne: Ligne }) {
  const { t } = useT()

  const { reference, colonnes } = alignerServices(ligne)

  return (
    <section className="pile pile--serre">
      <h3 className="titre-carte">{ligne.nom}</h3>

      {ligne.reserve && (
        <p className="champ__aide">
          {t('plan.reserve')} :{' '}
          {ligne.reserve.cycles?.map((c) => t(`cycles.${c}`)).join(', ')}
          {ligne.reserve.villagesAussiAdmis?.length
            ? ` · ${ligne.reserve.villagesAussiAdmis.join(', ')}`
            : ''}
        </p>
      )}

      <div className="tableau-conteneur">
        <table>
          <thead>
            <tr>
              <th scope="col">{ligne.nom}</th>
              {ligne.services.map((s) => (
                <th scope="col" key={s.id}>
                  {t(`plan.${s.periode === 'apres-midi' ? 'apresMidi' : s.periode}`)}
                  <br />
                  <span className="champ__aide">
                    {s.jours.map((j) => t(`jours.${j}Court`)).join(' ')}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reference.map((a, i) => (
              <tr key={`${a.arret}-${i}`}>
                <th scope="row" className="tableau__arret">
                  {nomArretParId(a.arret, t)}
                </th>
                {colonnes.map(({ service, cases }) => {
                  const c = cases[i]
                  return (
                    <td className="heure" key={service.id}>
                      {c ? (c.heure ?? (c.desservi === false ? '—' : '·')) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {[...new Set(colonnes.flatMap((c) => c.cases.flatMap((x) => x?.notes ?? [])))].map((note) => (
        <p className="champ__aide" key={note}>
          * {t(`notes.${note}`)}
        </p>
      ))}
    </section>
  )
}

export function PagePlan() {
  const { t } = useT()
  const { jours, parCycle } = plan.horairesEcole

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('plan.titre')}</h2>
        <p>{t('plan.intro')}</p>
        <p className="champ__aide">
          {t('plan.anneeScolaire', { annee: plan.anneesCouvertes.join(' · ') })} ·{' '}
          {t('validite.releve', { date: plan.source.dateReleve })}
        </p>
        {plan.source.confirmePar && (
          <div className="encart encart--info">
            <p>
              {t('validite.confirme', {
                personne: plan.source.confirmePar,
                date: plan.source.confirmeLe ?? '—',
              })}
            </p>
            {plan.source.confirmationOrale && <p>{t('validite.confirmeOral')}</p>}
          </div>
        )}
        <div className="rangee">
          <a
            className="bouton bouton--primaire"
            href={`${import.meta.env.BASE_URL}plan-bus-2025-2026.pdf`}
            download
          >
            {t('plan.telecharger')}
          </a>
          <a
            className="bouton"
            href={plan.source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('plan.voirEnLigne')}
          </a>
        </div>
      </header>

      {/* Les heures de sortie ne sont pas les mêmes d'une école à l'autre : les donner
          cycle par cycle, comme la brochure, plutôt qu'une moyenne qui serait fausse
          partout. */}
      <section className="carte pile pile--serre">
        <div className="encart__titre">{t('plan.horairesEcole')}</div>
        <p className="champ__aide">
          {t('plan.horairesEcoleJours', {
            matin: jours.matin.map((j) => t(`jours.${j}`)).join(' · '),
            apresMidi: jours.apresMidi.map((j) => t(`jours.${j}`)).join(' · '),
          })}
        </p>
        <div className="tableau-conteneur">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('plan.cycle')}</th>
                <th scope="col">{t('plan.matin')}</th>
                <th scope="col">{t('plan.apresMidi')}</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map(({ id }) => (
                <tr key={id}>
                  <th scope="row" className="tableau__arret">
                    {t(`cycles.${id}`)}
                  </th>
                  <td className="heure">{t('plan.creneau', { ...parCycle[id].matin })}</td>
                  <td className="heure">{t('plan.creneau', { ...parCycle[id].apresMidi })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reprise mot pour mot de l'avertissement du site officiel : c'est la commune
          qui fixe ce qu'un horaire promet, pas cette application. */}
      <div className="encart encart--attention">
        <div className="encart__titre">{t('plan.avertissementHoraires')}</div>
        <p>{t('plan.avertissementHorairesDetail')}</p>
      </div>

      {plan.lignes.map((ligne) => (
        <TableauLigne ligne={ligne} key={ligne.id} />
      ))}

      {plan.incertitudes.map((i) => (
        <div className="encart encart--attention" key={i.id}>
          <div className="encart__titre">{t('incertitudes.titre')}</div>
          <p>{i.question}</p>
          <p className="champ__aide">{i.hypothese}</p>
        </div>
      ))}
    </div>
  )
}
