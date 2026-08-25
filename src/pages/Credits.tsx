import { useEffect, useState } from 'react'
import { NOMS_LANGUES, useT, LANGUES } from '../i18n'
import { credits, relireCredits, lienSur, type Credit, type Credits } from '../lib/credits'
import { URL_API } from '../config'

/**
 * Charge les crédits depuis l'API (`/credits`) quand un serveur est configuré, avec le
 * bundle pour repli — sans serveur, hors ligne, ou avant toute publication. Écrit ici,
 * côté navigateur, et non dans `lib/credits.ts` que le serveur partage.
 */
async function chargerCredits(signal: AbortSignal): Promise<Credits> {
  if (!URL_API) return credits
  try {
    const rep = await fetch(`${URL_API}/credits`, { cache: 'no-store', signal })
    if (!rep.ok) return credits
    const donnees = (await rep.json()) as { credits?: unknown }
    return relireCredits(donnees.credits)
  } catch {
    return credits
  }
}

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
  // Le bundle d'abord, pour un affichage immédiat ; la version publiée le remplace dès
  // qu'elle arrive.
  const [donnees, setDonnees] = useState<Credits>(credits)

  useEffect(() => {
    const ctrl = new AbortController()
    void chargerCredits(ctrl.signal).then(setDonnees)
    return () => ctrl.abort()
  }, [])

  const languesTraduites = LANGUES.filter((l) => donnees.traductions[l]?.length)

  return (
    <div className="pile pile--large">
      <header className="entete-bande">
        <h2>{t('credits.titre')}</h2>
        <p className="entete-bande__note">{t('credits.intro')}</p>
      </header>

      {donnees.developpement.length > 0 && (
        <section className="carte pile pile--serre">
          <h3 className="titre-carte">{t('credits.developpement')}</h3>
          <ul className="liste-nue pile pile--serre">
            {donnees.developpement.map((c) => (
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
                {donnees.traductions[langue]!.map((c) => (
                  <Personne credit={c} key={c.nom} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {donnees.remerciements.length > 0 && (
        <section className="carte pile pile--serre">
          <h3 className="titre-carte">{t('credits.remerciements')}</h3>
          <p className="champ__aide">{t('credits.remerciementsAide')}</p>
          <ul className="liste-nue pile pile--serre">
            {donnees.remerciements.map((c) => (
              <Personne credit={c} key={c.nom} />
            ))}
          </ul>
        </section>
      )}

      <p className="champ__aide">{t('credits.accord')}</p>
    </div>
  )
}
