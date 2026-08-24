import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { lireJournal, type EntreeJournal } from '../lib/edition'
import type { SessionCompte } from '../lib/comptes'

/**
 * Le journal — qui a publié quoi, et quand — plus les rappels partis tout seuls (lot 26).
 *
 * Un journal que personne ne peut lire ne rend de comptes à personne : cet onglet le
 * rouvre après la consolidation, qui avait retiré la page où il vivait. Lisible par toute
 * session, sans capacité particulière : voir n'est pas éditer.
 *
 * Chargé au montage de l'onglet (les onglets inactifs ne sont pas montés) et rechargeable
 * à la main — le journal n'est pas en direct, un rappel parti à 06:45 s'y voit à la
 * prochaine ouverture.
 */
export function JournalEdition({ session }: { session: SessionCompte }) {
  const { t } = useT()
  const [entrees, setEntrees] = useState<EntreeJournal[] | null>(null)
  const [echec, setEchec] = useState(false)

  const charger = async () => {
    setEchec(false)
    setEntrees(null)
    try {
      setEntrees(await lireJournal(session))
    } catch {
      setEchec(true)
    }
  }

  useEffect(() => {
    void charger()
    // La session ne change pas sous cet onglet ; on charge une fois au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Le libellé d'une action, ou l'action brute si elle n'a pas de traduction. */
  const libelleAction = (action: string) => {
    const cle = `commune.journalAction.${action}`
    const rendu = t(cle)
    return rendu === cle ? action : rendu
  }

  return (
    <div className="pile pile--serre">
      <div className="rangee rangee--espacee">
        <p className="champ__aide">{t('commune.journalAide')}</p>
        <button type="button" className="bouton bouton--discret" onClick={() => void charger()}>
          {t('commune.journalRecharger')}
        </button>
      </div>

      {echec && <div className="encart encart--attention">{t('commune.journalEchec')}</div>}
      {!echec && entrees === null && <p className="champ__aide">{t('commun.chargement')}</p>}
      {entrees?.length === 0 && <p className="champ__aide">{t('commune.journalVide')}</p>}

      {entrees?.map((e) => (
        <div className="carte pile pile--serre" key={`${e.quand}-${e.action}-${e.detail}`}>
          <span className="rangee">
            <span className="etiquette">{libelleAction(e.action)}</span>
            <span className="texte-fort">{e.qui}</span>
          </span>
          <p className="champ__aide">
            {new Date(e.quand).toLocaleString()} · {e.detail}
          </p>
        </div>
      ))}
    </div>
  )
}
