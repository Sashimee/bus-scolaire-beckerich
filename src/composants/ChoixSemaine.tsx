import { useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { coursApresMidi } from '../lib/plan'
import type { BorneHeure } from '../lib/plan'
import { reponseUniforme } from '../lib/moments'
import type { Jour } from '../lib/types'

/**
 * Une question de la semaine, posée une fois plutôt que cinq.
 *
 * Le réglage se faisait jour par jour, cinq lignes par question, alors que la réponse
 * est la même tous les jours pour la quasi-totalité des familles. Le raccourci « toute
 * la semaine » existait, mais posé AU-DESSUS de la grille : on le découvrait après
 * avoir réglé cinq lignes à la main.
 *
 * Ici c'est l'inverse. Une seule réponse, en grand, et la grille des cinq jours
 * seulement pour qui déclare que ça change d'un jour à l'autre. Une semaine déjà
 * irrégulière ouvre la grille d'elle-même : sinon la réponse affichée en gros
 * mentirait sur trois jours.
 */

/** Un jour de la grille, avec la mention des jours sans cours l'après-midi. */
export function NomDuJour({ jour, id }: { jour: Jour; id?: string }) {
  const { t } = useT()
  return (
    <span className="grille-semaine__nom" id={id}>
      {t(`jours.${jour}`)}
      {!coursApresMidi(jour) && <small>{t('repas.sansCoursApresMidi')}</small>}
    </span>
  )
}

export interface OptionChoix<T extends string> {
  valeur: T
  /** Réponse en toutes lettres, telle qu'un parent la dirait. */
  libelle: string
  /** Ce que la réponse change concrètement. Affiché sous le libellé. */
  aide?: ReactNode
  /** Deux mots, pour la grille des cinq jours et le récapitulatif. */
  court: string
}

/**
 * Une question à réponse unique, en cartes plutôt qu'en liste déroulante.
 *
 * Un `select` cache ses options tant qu'on ne l'ouvre pas : le parent doit deviner
 * qu'il y a un choix, puis le comparer de mémoire. Ici les réponses sont posées à
 * plat, chacune avec ce qu'elle change écrit dessous.
 */
export function ChoixSimple<T extends string>({
  id,
  options,
  valeur,
  onChoisir,
}: {
  id: string
  options: readonly OptionChoix<T>[]
  valeur: T
  onChoisir: (v: T) => void
}) {
  return (
    <div className="reponses">
      {options.map((o) => {
        // La teinte de la réponse retenue est portée par le `<label>`, parent de
        // l'input : aucun sélecteur frère ne l'atteint, et `:has()` la rendrait
        // tributaire du moteur. Le composant sait déjà laquelle est cochée.
        const retenu = valeur === o.valeur
        return (
          <label
            className={`reponses__option${retenu ? ' reponses__option--retenu' : ''}`}
            key={o.valeur}
            htmlFor={`${id}-${o.valeur}`}
          >
            <input
              id={`${id}-${o.valeur}`}
              type="radio"
              name={id}
              value={o.valeur}
              checked={retenu}
              onChange={() => onChoisir(o.valeur)}
            />
            <span className="reponses__texte">
              <span className="reponses__libelle">{o.libelle}</span>
              {o.aide && <span className="champ__aide">{o.aide}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}

interface Props<T extends string> {
  /** Préfixe d'identifiant : doit être unique dans la page (enfant + moment). */
  id: string
  legende: string
  /** Les jours que cette question couvre. Le midi n'en couvre que trois. */
  jours: readonly Jour[]
  options: readonly OptionChoix<T>[]
  /** Réponses réellement possibles ce jour-là, quand le plan en interdit certaines. */
  optionsDuJour?: (jour: Jour) => readonly T[]
  valeurDuJour: (jour: Jour) => T
  onRepondre: (jours: readonly Jour[], valeur: T) => void
  /** Précision propre à un jour, sous sa ligne dans la grille. */
  noteDuJour?: (jour: Jour) => ReactNode
}

export function ChoixSemaine<T extends string>({
  id,
  legende,
  jours,
  options,
  optionsDuJour,
  valeurDuJour,
  onRepondre,
  noteDuJour,
}: Props<T>) {
  const { t } = useT()
  const [detail, setDetail] = useState(false)
  const uniforme = reponseUniforme(jours.map(valeurDuJour))
  // Une semaine irrégulière impose la grille : la question en gros ne saurait pas quoi
  // afficher, et n'importe quelle réponse cochée serait fausse quatre jours sur cinq.
  const ouvert = detail || uniforme === null

  const repondrePourTous = (valeur: T) => {
    onRepondre(jours, valeur)
    setDetail(false)
  }

  return (
    <fieldset className="fieldset-nu pile pile--serre">
      <legend className="legende legende--question">{legende}</legend>

      {!ouvert && (
        <>
          <ChoixSimple
            id={id}
            options={options}
            valeur={uniforme as T}
            onChoisir={repondrePourTous}
          />

          <div>
            <button
              type="button"
              className="bouton bouton--discret"
              onClick={() => setDetail(true)}
            >
              {t('semaine.detailler')}
            </button>
          </div>
        </>
      )}

      {ouvert && (
        <div className="pile pile--serre">
          {/*
              Les mêmes options, en actions cette fois : elles règlent les cinq jours
              d'un coup et referment le détail. Ce ne sont pas des états — la grille en
              dessous reste la source de vérité, d'où l'absence d'`aria-pressed`.
          */}
          <div className="champ">
            <span className="legende" id={`${id}-tous`}>
              {t('semaine.touteLaSemaine')}
            </span>
            <div className="segments" role="group" aria-labelledby={`${id}-tous`}>
              {options.map((o) => (
                <button key={o.valeur} type="button" onClick={() => repondrePourTous(o.valeur)}>
                  {o.court}
                </button>
              ))}
            </div>
          </div>

          <div className="grille-semaine">
            {jours.map((jour) => {
              const permises = optionsDuJour?.(jour) ?? options.map((o) => o.valeur)
              const note = noteDuJour?.(jour)
              return (
                <div className="grille-semaine__jour grille-semaine__jour--simple" key={jour}>
                  <NomDuJour jour={jour} id={`${id}-${jour}`} />
                  <div className="pile pile--serre">
                    <div className="segments" role="group" aria-labelledby={`${id}-${jour}`}>
                      {options
                        .filter((o) => permises.includes(o.valeur))
                        .map((o) => (
                          <button
                            key={o.valeur}
                            type="button"
                            aria-pressed={valeurDuJour(jour) === o.valeur}
                            onClick={() => onRepondre([jour], o.valeur)}
                          >
                            {o.court}
                          </button>
                        ))}
                    </div>
                    {note && <p className="champ__aide">{note}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </fieldset>
  )
}

/**
 * L'intersection des bornes de plusieurs jours.
 *
 * Une heure unique pour toute la semaine doit être valable tous les jours. Si les
 * amplitudes ne se recouvrent pas — la dernière navette du mercredi part plus tôt que
 * celle du lundi — il n'existe aucune heure commune, et la question ne peut se poser
 * que jour par jour.
 */
function borneCommune(bornes: (BorneHeure | null)[]): BorneHeure | null {
  const valides = bornes.filter((b): b is BorneHeure => b !== null)
  if (!valides.length) return null
  const min = valides.reduce((a, b) => (b.min > a ? b.min : a), valides[0].min)
  const max = valides.reduce((a, b) => (b.max < a ? b.max : a), valides[0].max)
  if (min > max) return null
  const defaut = valides[0].defaut
  return { min, max, defaut: defaut < min ? min : defaut > max ? max : defaut }
}

interface PropsHeure {
  id: string
  legende: string
  /** Uniquement les jours où une heure est réellement déclarée. */
  jours: readonly Jour[]
  heureDuJour: (jour: Jour) => string | null
  borneDuJour: (jour: Jour) => BorneHeure | null
  onHeure: (jours: readonly Jour[], heure: string) => void
  noteDuJour?: (jour: Jour) => ReactNode
}

/**
 * Une heure pour la semaine, ou une par jour.
 *
 * Même principe que la question : dix champs d'heure côte à côte étaient illisibles sur
 * un téléphone, et neuf fois sur dix ils portaient la même valeur.
 */
export function HeureSemaine({
  id,
  legende,
  jours,
  heureDuJour,
  borneDuJour,
  onHeure,
  noteDuJour,
}: PropsHeure) {
  const { t } = useT()
  const [detail, setDetail] = useState(false)

  if (!jours.length) return null

  const commune = borneCommune(jours.map(borneDuJour))
  const uniforme = reponseUniforme(jours.map(heureDuJour))
  const ouvert = detail || uniforme === null || commune === null

  if (!ouvert && uniforme && commune) {
    return (
      <div className="champ">
        <label htmlFor={`${id}-tous`}>{legende}</label>
        <input
          id={`${id}-tous`}
          type="time"
          step={300}
          min={commune.min}
          max={commune.max}
          value={uniforme}
          onChange={(e) => e.target.value && onHeure(jours, e.target.value)}
        />
        <p className="champ__aide">
          {t('dillendapp.bornes', { min: commune.min, max: commune.max })}
        </p>
        <div>
          <button type="button" className="bouton bouton--discret" onClick={() => setDetail(true)}>
            {t('heure.detailler')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <fieldset className="fieldset-nu pile pile--serre">
      <legend className="legende">{legende}</legend>
      <div className="grille-semaine">
        {jours.map((jour) => {
          const borne = borneDuJour(jour)
          const heure = heureDuJour(jour)
          const note = noteDuJour?.(jour)
          if (!borne || !heure) return null
          return (
            <div className="grille-semaine__jour grille-semaine__jour--simple" key={jour}>
              <NomDuJour jour={jour} />
              <div className="champ">
                <label className="visuellement-cache" htmlFor={`${id}-${jour}`}>
                  {t('heure.pourJour', { jour: t(`jours.${jour}`) })}
                </label>
                <input
                  id={`${id}-${jour}`}
                  type="time"
                  step={300}
                  min={borne.min}
                  max={borne.max}
                  value={heure}
                  onChange={(e) => e.target.value && onHeure([jour], e.target.value)}
                />
                <p className="champ__aide">
                  {t('dillendapp.bornes', { min: borne.min, max: borne.max })}
                </p>
                {note && <p className="champ__aide">{note}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
