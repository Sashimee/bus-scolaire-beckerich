import { useMemo, useState } from 'react'
import { LANGUES, NOMS_LANGUES, useT, type Langue } from '../i18n'
import fr from '../i18n/fr.json'
import {
  motifRefus,
  valeurDeReference,
  type Modifications,
  type Surcouche,
} from '../lib/traductions'
import { useBlocageRechargement } from '../rechargement-contexte'

/**
 * Toutes les clés traduisibles, groupées par section de premier niveau.
 *
 * Calculé une fois pour toutes à partir du français, qui fait référence : ce sont les
 * seules clés qu'une correction a le droit de recouvrir.
 */
const SECTIONS: { nom: string; cles: string[] }[] = Object.entries(
  fr as Record<string, unknown>,
).flatMap(([section, contenu]) => {
  if (section.startsWith('$')) return []
  const cles: string[] = []
  const parcourir = (noeud: unknown, chemin: string) => {
    if (typeof noeud === 'string' || Array.isArray(noeud)) {
      cles.push(chemin)
      return
    }
    if (noeud && typeof noeud === 'object') {
      for (const [k, v] of Object.entries(noeud)) {
        if (!k.startsWith('$')) parcourir(v, `${chemin}.${k}`)
      }
    }
  }
  parcourir(contenu, section)
  return cles.length ? [{ nom: section, cles }] : []
})

const TOTAL_CLES = SECTIONS.reduce((n, s) => n + s.cles.length, 0)

type Brouillon = Record<string, string | string[]>

interface Props {
  /** Ce qui est déjà publié, pour amorcer les champs. */
  surcouche: Surcouche
  /**
   * Publie les seules corrections faites, pour une langue. Renvoie l'état fusionné tel
   * qu'il est désormais en ligne — il peut contenir le travail d'un autre traducteur
   * publié entre-temps.
   */
  publier: (langue: Langue, modifications: Modifications) => Promise<Surcouche>
}

/**
 * Correction des textes de l'application, langue par langue.
 *
 * Un seul composant pour deux hôtes : `/admin` publie avec le jeton GitHub de son
 * utilisateur, `/traductions` avec un code personnel et le jeton machine du Worker.
 * Ce qui change, c'est `publier` — rien d'autre.
 *
 * Le texte français reste affiché à côté de chaque champ : traduire sans voir la
 * phrase d'origine, c'est traduire à l'aveugle.
 */
export function EditeurTraductions({ surcouche, publier }: Props) {
  const { t } = useT()
  // Ce qui est en ligne, à notre connaissance. Amorcé par la surcouche chargée à
  // l'ouverture, puis remplacé par l'état que le serveur renvoie à chaque publication.
  const [publiees, setPubliees] = useState<Surcouche>(surcouche)
  const [langue, setLangue] = useState<Langue>('de')
  const [recherche, setRecherche] = useState('')
  const [brouillon, setBrouillon] = useState<Brouillon>({})
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [publiee, setPubliee] = useState(false)

  const enAttente = Object.keys(brouillon).length
  useBlocageRechargement(enAttente > 0, 'brouillon-traductions')

  /** La valeur affichée : brouillon, puis surcouche publiée, puis le dictionnaire. */
  const valeurAffichee = (cle: string): string | string[] => {
    const b = brouillon[cle]
    if (b !== undefined) return b
    const s = publiees[langue]?.[cle]
    if (s !== undefined) return s
    const reference = valeurDeReference(cle)
    return Array.isArray(reference) ? (reference as string[]) : ''
  }

  const modifiee = (cle: string) => cle in brouillon || publiees[langue]?.[cle] !== undefined

  const noter = (cle: string, valeur: string | string[]) => {
    setPubliee(false)
    setBrouillon((b) => ({ ...b, [cle]: valeur }))
  }

  /** Retire la correction : la clé revient au dictionnaire compilé. */
  const revenirALOrigine = (cle: string) => {
    setPubliee(false)
    setBrouillon((b) => {
      const suite = { ...b }
      delete suite[cle]
      return suite
    })
    if (publiees[langue]?.[cle] !== undefined) {
      // Marquer explicitement le retrait : sans cela, publier ne ferait que ne pas
      // toucher à l'entrée déjà en ligne.
      setBrouillon((b) => ({ ...b, [cle]: '' }))
    }
  }

  const problemes = useMemo(
    () =>
      Object.entries(brouillon)
        .filter(([, v]) => !(typeof v === 'string' && v === ''))
        .map(([cle, v]) => ({ cle, motif: motifRefus(langue, cle, v) }))
        .filter((p) => p.motif !== null),
    [brouillon, langue],
  )

  const sectionsFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return SECTIONS
    return SECTIONS.map((s) => ({
      nom: s.nom,
      cles: s.cles.filter(
        (c) =>
          c.toLowerCase().includes(q) ||
          String(valeurDeReference(c)).toLowerCase().includes(q),
      ),
    })).filter((s) => s.cles.length)
  }, [recherche])

  const envoyer = async () => {
    setOccupe(true)
    setErreur(null)
    try {
      // On n'envoie QUE les corrections faites ici, jamais la surcouche entière :
      // c'est ce qui permet à deux traducteurs de travailler en même temps sans se
      // recouvrir. Une chaîne vide veut dire « retire cette correction ».
      const modifications: Modifications = Object.fromEntries(
        Object.entries(brouillon).map(([cle, valeur]) => [
          cle,
          typeof valeur === 'string' && valeur === '' ? null : valeur,
        ]),
      )

      // L'état renvoyé fait foi : il peut porter le travail d'un autre, publié pendant
      // que celui-ci tapait.
      setPubliees(await publier(langue, modifications))
      setBrouillon({})
      setPubliee(true)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'inconnu')
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="pile">
      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('traductions.titre')}</h3>
        <p className="champ__aide">{t('traductions.aide')}</p>

        <div className="champ">
          <label htmlFor="traductions-langue">{t('traductions.langue')}</label>
          <select
            id="traductions-langue"
            value={langue}
            onChange={(e) => {
              setLangue(e.target.value as Langue)
              setBrouillon({})
            }}
          >
            {LANGUES.map((l) => (
              <option key={l} value={l}>
                {NOMS_LANGUES[l]}
              </option>
            ))}
          </select>
          <p className="champ__aide">{t('traductions.langueAide')}</p>
        </div>

        <div className="champ">
          <label htmlFor="traductions-recherche">{t('traductions.recherche')}</label>
          <input
            id="traductions-recherche"
            type="search"
            value={recherche}
            placeholder={t('traductions.recherchePlaceholder')}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <p className="champ__aide">
            {t('traductions.compte', {
              affichees: sectionsFiltrees.reduce((n, s) => n + s.cles.length, 0),
              total: TOTAL_CLES,
            })}
          </p>
        </div>
      </section>

      {sectionsFiltrees.map((section) => (
        <details className="repli carte" key={section.nom}>
          <summary>
            <span className="repli__resume rangee">
              <span className="texte-fort">{section.nom}</span>
              <span className="etiquette">{section.cles.length}</span>
              {section.cles.some(modifiee) && (
                <span className="etiquette">{t('traductions.corrigee')}</span>
              )}
            </span>
          </summary>

          <div className="pile">
            {section.cles.map((cle) => {
              const reference = valeurDeReference(cle)
              const valeur = valeurAffichee(cle)
              const motif = cle in brouillon ? motifRefus(langue, cle, valeur) : null

              return (
                <div className="pile pile--serre" key={cle}>
                  <code className="champ__aide">{cle}</code>
                  <p className="adresse-retenue">
                    {Array.isArray(reference) ? reference.join(' · ') : String(reference)}
                  </p>

                  {Array.isArray(reference) ? (
                    (valeur as string[]).map((ligne, i) => (
                      <div className="champ" key={i}>
                        <label className="visuellement-cache" htmlFor={`${cle}-${i}`}>
                          {t('traductions.etape', { numero: i + 1 })}
                        </label>
                        <input
                          id={`${cle}-${i}`}
                          type="text"
                          value={ligne}
                          onChange={(e) => {
                            const suite = [...(valeur as string[])]
                            suite[i] = e.target.value
                            noter(cle, suite)
                          }}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="champ">
                      <label className="visuellement-cache" htmlFor={cle}>
                        {cle}
                      </label>
                      <textarea
                        id={cle}
                        rows={2}
                        value={valeur as string}
                        onChange={(e) => noter(cle, e.target.value)}
                      />
                    </div>
                  )}

                  {motif && (
                    <div className="encart encart--alerte">{t(`traductions.refus.${motif}`)}</div>
                  )}
                  {modifiee(cle) && (
                    <button
                      type="button"
                      className="bouton bouton--discret"
                      onClick={() => revenirALOrigine(cle)}
                    >
                      {t('traductions.revenir')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      ))}

      <section className="carte pile pile--serre">
        <p className="champ__aide">{t('traductions.enAttente', { nombre: enAttente })}</p>
        {problemes.length > 0 && (
          <div className="encart encart--alerte">
            <div className="encart__titre">{t('traductions.bloquantes')}</div>
            <ul className="liste-puces">
              {problemes.map((p) => (
                <li key={p.cle}>
                  <code>{p.cle}</code> — {t(`traductions.refus.${p.motif}`)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {erreur && <div className="encart encart--alerte">{t('commune.erreur')}</div>}
        {publiee && <p>✓ {t('traductions.publiee')}</p>}

        <button
          type="button"
          className="bouton bouton--primaire"
          disabled={occupe || enAttente === 0 || problemes.length > 0}
          onClick={() => void envoyer()}
        >
          {occupe ? t('commun.chargement') : t('traductions.publier')}
        </button>
      </section>
    </div>
  )
}
