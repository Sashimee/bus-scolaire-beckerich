import { useState } from 'react'
import { LANGUES, NOMS_LANGUES, useT, type Langue } from '../i18n'
import { lienSur, relireCredits, type Credit, type Credits } from '../lib/credits'
import { useBlocageRechargement } from '../rechargement-contexte'

/** Une liste de personnes, modifiable : ajouter, retirer, réordonner. */
function ListeCredits({
  id,
  legende,
  aide,
  entrees,
  avecLien,
  champLibre,
  onChanger,
}: {
  id: string
  legende: string
  aide: string
  entrees: Credit[]
  /** Le développement porte un lien ; les remerciements, un motif. */
  avecLien: boolean
  /** Nom du second champ : `role` ou `motif`. */
  champLibre: 'role' | 'motif'
  onChanger: (entrees: Credit[]) => void
}) {
  const { t } = useT()

  const majAt = (i: number, champs: Partial<Credit>) =>
    onChanger(entrees.map((c, k) => (k === i ? { ...c, ...champs } : c)))

  const deplacer = (i: number, pas: number) => {
    const cible = i + pas
    if (cible < 0 || cible >= entrees.length) return
    const suite = [...entrees]
    ;[suite[i], suite[cible]] = [suite[cible], suite[i]]
    onChanger(suite)
  }

  return (
    <fieldset className="fieldset-nu pile pile--serre">
      <legend className="legende">{legende}</legend>
      <p className="champ__aide">{aide}</p>

      {entrees.length === 0 && <p className="champ__aide">{t('credits.aucun')}</p>}

      {entrees.map((c, i) => (
        <div className="carte pile pile--serre" key={`${id}-${i}`}>
          <div className="champ">
            <label htmlFor={`${id}-nom-${i}`}>{t('credits.nom')}</label>
            <input
              id={`${id}-nom-${i}`}
              type="text"
              maxLength={80}
              value={c.nom}
              onChange={(e) => majAt(i, { nom: e.target.value })}
            />
          </div>

          <div className="champ">
            <label htmlFor={`${id}-detail-${i}`}>{t(`credits.${champLibre}`)}</label>
            <input
              id={`${id}-detail-${i}`}
              type="text"
              maxLength={120}
              value={c[champLibre] ?? ''}
              onChange={(e) => majAt(i, { [champLibre]: e.target.value })}
            />
          </div>

          {avecLien && (
            <div className="champ">
              <label htmlFor={`${id}-lien-${i}`}>{t('credits.lien')}</label>
              <input
                id={`${id}-lien-${i}`}
                type="url"
                value={c.lien ?? ''}
                placeholder="https://…"
                onChange={(e) => majAt(i, { lien: e.target.value })}
              />
              {/* Un lien qui ne sera pas rendu doit se voir ici, pas se découvrir en
                  ligne sur une page publique qui l'ignore silencieusement. */}
              {c.lien && !lienSur(c.lien) && (
                <p className="champ__aide texte-attention">{t('credits.lienIgnore')}</p>
              )}
            </div>
          )}

          <div className="rangee">
            <button type="button" className="bouton bouton--discret" onClick={() => deplacer(i, -1)}>
              {t('credits.monter')}
            </button>
            <button type="button" className="bouton bouton--discret" onClick={() => deplacer(i, 1)}>
              {t('credits.descendre')}
            </button>
            <button
              type="button"
              className="bouton bouton--danger"
              onClick={() => onChanger(entrees.filter((_, k) => k !== i))}
            >
              {t('credits.retirer')}
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="bouton"
        onClick={() => onChanger([...entrees, { nom: '' }])}
      >
        {t('credits.ajouter')}
      </button>
    </fieldset>
  )
}

/**
 * Modification des crédits, depuis `/admin` uniquement.
 *
 * Un traducteur ne s'ajoute pas lui-même : `/traductions` ne touche qu'aux textes.
 * C'est délibéré — décider qui figure sur une page publique n'est pas du même ordre
 * que corriger une tournure.
 */
export function EditeurCredits({
  credits: publies,
  publier,
}: {
  credits: Credits
  publier: (credits: Credits) => Promise<void>
}) {
  const { t } = useT()
  const [brouillon, setBrouillon] = useState<Credits>(publies)
  const [langue, setLangue] = useState<Langue>('de')
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(false)
  const [publiee, setPubliee] = useState(false)

  const modifie = JSON.stringify(brouillon) !== JSON.stringify(publies)
  useBlocageRechargement(modifie, 'brouillon-credits')

  const changer = (champs: Partial<Credits>) => {
    setPubliee(false)
    setBrouillon((b) => ({ ...b, ...champs }))
  }

  // Un nom vide ne serait pas publié : autant le dire avant d'envoyer.
  const sansNom = [
    ...brouillon.developpement,
    ...brouillon.remerciements,
    ...Object.values(brouillon.traductions).flat(),
  ].filter((c) => !c?.nom?.trim()).length

  const envoyer = async () => {
    setOccupe(true)
    setErreur(false)
    try {
      // On republie ce que la page affichera réellement, pas le brouillon brut.
      await publier(relireCredits(brouillon))
      setPubliee(true)
    } catch {
      setErreur(true)
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="pile">
      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('credits.titre')}</h3>
        <p className="champ__aide">{t('credits.editeurAide')}</p>
        <div className="encart encart--attention">{t('credits.accord')}</div>
      </section>

      <section className="carte pile pile--serre">
        <ListeCredits
          id="dev"
          legende={t('credits.developpement')}
          aide={t('credits.developpementAide')}
          entrees={brouillon.developpement}
          avecLien
          champLibre="role"
          onChanger={(developpement) => changer({ developpement })}
        />
      </section>

      <section className="carte pile pile--serre">
        <div className="champ">
          <label htmlFor="credits-langue">{t('credits.traductions')}</label>
          <select
            id="credits-langue"
            value={langue}
            onChange={(e) => setLangue(e.target.value as Langue)}
          >
            {LANGUES.map((l) => (
              <option key={l} value={l}>
                {NOMS_LANGUES[l]}
              </option>
            ))}
          </select>
        </div>

        <ListeCredits
          id={`trad-${langue}`}
          legende={NOMS_LANGUES[langue]}
          aide={t('credits.traductionsAide')}
          entrees={brouillon.traductions[langue] ?? []}
          avecLien={false}
          champLibre="role"
          onChanger={(liste) =>
            changer({ traductions: { ...brouillon.traductions, [langue]: liste } })
          }
        />
      </section>

      <section className="carte pile pile--serre">
        <ListeCredits
          id="merci"
          legende={t('credits.remerciements')}
          aide={t('credits.remerciementsAide')}
          entrees={brouillon.remerciements}
          avecLien={false}
          champLibre="motif"
          onChanger={(remerciements) => changer({ remerciements })}
        />
      </section>

      <section className="carte pile pile--serre">
        {sansNom > 0 && (
          <div className="encart encart--attention">{t('credits.sansNom', { nombre: sansNom })}</div>
        )}
        {erreur && <div className="encart encart--alerte">{t('commune.erreur.inconnu')}</div>}
        {publiee && <p>✓ {t('credits.publiee')}</p>}

        <button
          type="button"
          className="bouton bouton--primaire"
          disabled={occupe || !modifie}
          onClick={() => void envoyer()}
        >
          {occupe ? t('commun.chargement') : t('credits.publier')}
        </button>
      </section>
    </div>
  )
}
