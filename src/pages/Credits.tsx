import { NOMS_LANGUES, useT, LANGUES } from '../i18n'
import { credits, lienSur, type Credit } from '../lib/credits'

/** Une personne créditée : son nom, ce qu'elle a fait, et un lien s'il en existe un. */
function Personne({ credit }: { credit: Credit }) {
  const url = lienSur(credit.lien)
  const detail = credit.role ?? credit.motif

  return (
    <li>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {credit.nom}
        </a>
      ) : (
        <span className="texte-fort">{credit.nom}</span>
      )}
      {detail && <span className="champ__aide"> — {detail}</span>}
    </li>
  )
}

/**
 * Qui a fait quoi.
 *
 * L'application est faite par un parent, à titre privé, et traduite en cinq langues
 * avec l'aide de gens qui n'y gagnent rien. Le README cite les sources des données ;
 * cette page-ci cite les personnes.
 */
export function Credits() {
  const { t } = useT()
  const languesTraduites = LANGUES.filter((l) => credits.traductions[l]?.length)

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('credits.titre')}</h2>
        <p>{t('credits.intro')}</p>
      </header>

      {credits.developpement.length > 0 && (
        <section className="carte pile pile--serre">
          <h3 className="titre-carte">{t('credits.developpement')}</h3>
          <ul className="liste-nue pile pile--serre">
            {credits.developpement.map((c) => (
              <Personne credit={c} key={c.nom} />
            ))}
          </ul>
        </section>
      )}

      {languesTraduites.length > 0 && (
        <section className="carte pile pile--serre">
          <h3 className="titre-carte">{t('credits.traductions')}</h3>
          <p className="champ__aide">{t('credits.traductionsAide')}</p>
          {languesTraduites.map((langue) => (
            <div className="pile pile--serre" key={langue}>
              <span className="etiquette">{NOMS_LANGUES[langue]}</span>
              <ul className="liste-nue pile pile--serre">
                {credits.traductions[langue]!.map((c) => (
                  <Personne credit={c} key={c.nom} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {credits.remerciements.length > 0 && (
        <section className="carte pile pile--serre">
          <h3 className="titre-carte">{t('credits.remerciements')}</h3>
          <p className="champ__aide">{t('credits.remerciementsAide')}</p>
          <ul className="liste-nue pile pile--serre">
            {credits.remerciements.map((c) => (
              <Personne credit={c} key={c.nom} />
            ))}
          </ul>
        </section>
      )}

      <p className="champ__aide">{t('credits.accord')}</p>
    </div>
  )
}
