import { useT } from '../i18n'
import { plan } from '../lib/donnees'
import { nomArretParId } from '../lib/affichage'
import type { Ligne } from '../lib/types'

function TableauLigne({ ligne }: { ligne: Ligne }) {
  const { t } = useT()

  // Les services d'une même ligne partagent leur séquence d'arrêts ; on prend la plus
  // longue comme colonne de référence et on aligne les horaires dessus.
  const reference = ligne.services.reduce((a, b) => (b.arrets.length > a.arrets.length ? b : a))

  return (
    <section className="pile pile--serre">
      <h3 style={{ fontSize: '1rem' }}>{ligne.nom}</h3>

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
            {reference.arrets.map((a, i) => (
              <tr key={`${a.arret}-${i}`}>
                <th scope="row" style={{ fontWeight: 500 }}>
                  {nomArretParId(a.arret, t)}
                </th>
                {ligne.services.map((s) => {
                  const correspondant = s.arrets[i]
                  const meme = correspondant?.arret === a.arret
                  return (
                    <td className="heure" key={s.id}>
                      {meme ? (correspondant.heure ?? '—') : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {[...new Set(reference.arrets.flatMap((a) => a.notes ?? []))].map((note) => (
        <p className="champ__aide" key={note}>
          * {t(`notes.${note}`)}
        </p>
      ))}
    </section>
  )
}

export function PagePlan() {
  const { t } = useT()
  const { matin, apresMidi } = plan.horairesEcole

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('plan.titre')}</h2>
        <p>{t('plan.intro')}</p>
        <p className="champ__aide">
          {t('plan.anneeScolaire', { annee: plan.anneesCouvertes.join(' · ') })} ·{' '}
          {t('validite.releve', { date: plan.source.dateReleve })}
        </p>
        {plan.source.confirmationOrale && (
          <div className="encart encart--info">
            {t('validite.confirme', {
              personne: plan.source.confirmePar ?? '—',
              date: plan.source.confirmeLe ?? '—',
            })}{' '}
            {t('validite.confirmeOral')}
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

      <section className="carte">
        <div className="encart__titre">{t('plan.horairesEcole')}</div>
        <p>
          {t('plan.horairesEcoleDetail', {
            matinDebut: matin.debut,
            matinFin: matin.fin,
            apresMidiDebut: apresMidi.debut,
            apresMidiFin: apresMidi.fin,
          })}
        </p>
      </section>

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
