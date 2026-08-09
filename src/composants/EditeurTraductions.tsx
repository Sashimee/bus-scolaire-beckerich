import { useMemo, useState } from 'react'
import { LANGUES, NOMS_LANGUES, useT, type Langue } from '../i18n'
import fr from '../i18n/fr.json'
import { valeurCompilee } from '../i18n/dictionnaires'
import {
  motifRefus,
  valeurDeReference,
  type Modifications,
  type Surcouche,
} from '../lib/traductions'
import { cleErreur, ErreurCommune } from '../lib/commune'
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

/**
 * Traduit un échec de publication en clé de message.
 *
 * L'écran affichait `t('commune.erreur')`, qui désigne un OBJET du dictionnaire : `t`
 * renvoyait donc la clé elle-même, et le traducteur lisait « commune.erreur » en toutes
 * lettres. Devant un échec, il doit savoir ce qui s'est passé et si son travail est
 * perdu — ici, il ne l'est jamais, le brouillon reste en mémoire.
 */
function motifAffichable(e: unknown): { cle: string; detail?: string } {
  if (e instanceof ErreurCommune) {
    return { cle: cleErreur(e.motif), detail: e.detail ? String(e.detail) : undefined }
  }
  // `/admin` passe par l'API GitHub, qui lève des `Error` ordinaires.
  if (e instanceof Error && e.message === 'conflit') return { cle: 'conflit' }
  if (e instanceof Error) return { cle: 'inconnu', detail: e.message }
  return { cle: 'inconnu' }
}

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
  const [depliees, setDepliees] = useState<Record<string, boolean>>({})
  // Traduire vers le portugais en regardant l'allemand plutôt que le français : le
  // français reste la référence de validation, pas forcément la plus utile à l'écran.
  const [comparaison, setComparaison] = useState<Langue>('fr')
  /**
   * Un brouillon PAR LANGUE.
   *
   * Le sélecteur de langue vidait le brouillon : passer à l'allemand pour vérifier une
   * tournure effaçait vingt corrections portugaises, sans confirmation ni message. Un
   * traducteur doit pouvoir circuler entre les langues sans perdre son travail.
   */
  const [brouillons, setBrouillons] = useState<Partial<Record<Langue, Brouillon>>>({})
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<{ cle: string; detail?: string } | null>(null)
  const [publiee, setPubliee] = useState(false)

  // Le `?? {}` créait un objet neuf à chaque rendu, ce qui rejouait le `useMemo` des
  // problèmes de saisie sans arrêt.
  const brouillon = useMemo(() => brouillons[langue] ?? {}, [brouillons, langue])
  const enAttente = Object.keys(brouillon).length
  const enAttenteAilleurs = LANGUES.filter((l) => l !== langue).reduce(
    (n, l) => n + Object.keys(brouillons[l] ?? {}).length,
    0,
  )
  useBlocageRechargement(enAttente + enAttenteAilleurs > 0, 'brouillon-traductions')

  const majBrouillon = (transformer: (b: Brouillon) => Brouillon) =>
    setBrouillons((tous) => ({ ...tous, [langue]: transformer(tous[langue] ?? {}) }))

  /**
   * Ce qu'un parent lit AUJOURD'HUI dans cette langue : correction publiée s'il y en a
   * une, sinon le dictionnaire compilé de la langue, avec repli sur le français.
   */
  const valeurEnLigne = (l: Langue, cle: string): string | string[] => {
    const publiee = publiees[l]?.[cle]
    if (publiee !== undefined) return publiee
    const compilee = valeurCompilee(l, cle)
    if (typeof compilee === 'string') return compilee
    return Array.isArray(compilee) ? (compilee as string[]) : ''
  }

  /**
   * La valeur du champ : brouillon en cours, sinon ce qui est en ligne.
   *
   * Elle retombait sur le français, donc sur une chaîne VIDE pour les textes : le
   * traducteur voyait un champ blanc et devait retaper une traduction qui existait
   * déjà. Changer de langue ne changeait rien à l'écran, puisque tout était vide.
   */
  const valeurAffichee = (cle: string): string | string[] => brouillon[cle] ?? valeurEnLigne(langue, cle)

  const modifiee = (cle: string) => cle in brouillon || publiees[langue]?.[cle] !== undefined

  const noter = (cle: string, valeur: string | string[]) => {
    setPubliee(false)
    setErreur(null)
    majBrouillon((b) => ({ ...b, [cle]: valeur }))
  }

  /** Retire la correction : la clé revient au dictionnaire compilé. */
  const revenirALOrigine = (cle: string) => {
    setPubliee(false)
    majBrouillon((b) => {
      const suite = { ...b }
      // Marquer explicitement le retrait quand l'entrée est en ligne : sans cela,
      // publier ne ferait que ne pas y toucher.
      if (publiees[langue]?.[cle] !== undefined) suite[cle] = ''
      else delete suite[cle]
      return suite
    })
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
      setBrouillons((tous) => ({ ...tous, [langue]: {} }))
      setPubliee(true)
    } catch (e) {
      // Le brouillon reste en mémoire : c'est justement ce que le message doit dire.
      setErreur(motifAffichable(e))
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
              const suivante = e.target.value as Langue
              setLangue(suivante)
              // Comparer une langue à elle-même n'apprend rien.
              if (comparaison === suivante) setComparaison(suivante === 'fr' ? 'de' : 'fr')
              setPubliee(false)
              setErreur(null)
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
          <label htmlFor="traductions-comparaison">{t('traductions.comparerA')}</label>
          <select
            id="traductions-comparaison"
            value={comparaison}
            onChange={(e) => setComparaison(e.target.value as Langue)}
          >
            {LANGUES.filter((l) => l !== langue).map((l) => (
              <option key={l} value={l}>
                {NOMS_LANGUES[l]}
              </option>
            ))}
          </select>
          <p className="champ__aide">{t('traductions.comparerAAide')}</p>
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

      {/*
          Le contenu d'une section n'est monté qu'une fois la section dépliée.
          Un `<details>` fermé garde bien ses enfants dans le DOM : les 555 clés du
          dictionnaire faisaient donc autant de champs de saisie construits à
          l'ouverture de la page, pour n'en montrer aucun.
      */}
      {sectionsFiltrees.map((section) => (
        <details
          className="repli carte"
          key={section.nom}
          onToggle={(e) => {
            // Lu tout de suite : `currentTarget` ne vaut plus rien au moment où React
            // exécutera la fonction de mise à jour.
            const ouverte = e.currentTarget.open
            setDepliees((d) => ({ ...d, [section.nom]: ouverte }))
          }}
        >
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
            {(depliees[section.nom] ? section.cles : []).map((cle) => {
              const reference = valeurDeReference(cle)
              const valeur = valeurAffichee(cle)
              const motif = cle in brouillon ? motifRefus(langue, cle, valeur) : null

              return (
                <div className="pile pile--serre" key={cle}>
                  <code className="champ__aide">{cle}</code>
                  <p className="adresse-retenue">
                    <span className="etiquette">{NOMS_LANGUES[comparaison]}</span>{' '}
                    {(() => {
                      const c = valeurEnLigne(comparaison, cle)
                      return Array.isArray(c) ? c.join(' · ') : c
                    })()}
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
        {/* Sans cela, un traducteur qui a changé de langue oublie ce qu'il y a laissé
            et ferme l'onglet dessus. */}
        {enAttenteAilleurs > 0 && (
          <p className="champ__aide">
            {t('traductions.enAttenteAilleurs', { nombre: enAttenteAilleurs })}
          </p>
        )}
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
        {erreur && (
          <div className="encart encart--alerte" role="alert">
            <div className="encart__titre">{t(`commune.erreur.${erreur.cle}`)}</div>
            {/* Le point qui compte : rien n'est perdu tant que l'onglet reste ouvert. */}
            <p>{t('traductions.brouillonConserve')}</p>
            {erreur.detail && <p className="champ__aide"><code>{erreur.detail}</code></p>}
          </div>
        )}
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
