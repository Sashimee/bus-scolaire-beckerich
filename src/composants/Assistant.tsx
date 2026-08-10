import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useT } from '../i18n'

export interface Etape {
  /** Identifiant de l'étape, pour la clé de rendu et les identifiants HTML. */
  cle: string
  /** Titre affiché, déjà traduit — il porte le prénom de l'enfant. */
  titre: string
  contenu: ReactNode
  /** L'étape ne peut pas être quittée tant que ceci est faux. */
  pretePourLaSuite?: boolean
  /** Ce qui manque, en toutes lettres. Un bouton grisé sans explication est un mur. */
  obstacle?: string
}

interface Props {
  etapes: Etape[]
  indice: number
  onIndice: (i: number) => void
  /** Rendu à la dernière étape, à la place du bouton « Continuer ». */
  fin: ReactNode
}

/**
 * Coquille de l'assistant : progression, navigation, gestion du focus.
 *
 * Aucun état de brouillon : chaque étape écrit directement dans `etat.tsx`, qui
 * persiste à chaque frappe. Il n'y a donc rien à « valider » ni à « annuler », et un
 * parent interrompu par un enfant retrouve exactement où il en était. C'est aussi ce
 * qui permet de revenir en arrière librement, sans perdre la suite.
 *
 * Les étapes sont fixes : aucune ne se dérobe selon les réponses. Une étape qui
 * disparaît fait bouger le repère sous les pieds du parent au moment précis où il
 * progresse — « sur 6 » devenait « sur 7 » en cochant une case — et interdit de
 * revenir sur ses pas par le même chemin.
 */
export function Assistant({ etapes, indice, onIndice, fin }: Props) {
  const { t } = useT()
  const titre = useRef<HTMLHeadingElement>(null)
  const etape = etapes[indice]
  const derniere = indice === etapes.length - 1
  const progression = t('assistant.progression', { etape: indice + 1, total: etapes.length })

  // Jusqu'où le parent peut sauter directement. Une étape qui bloque bloque aussi les
  // suivantes : sans prénom ni adresse, les questions d'après n'ont pas de réponse
  // calculable, et un écran vide se lit comme une panne.
  const premierBlocage = etapes.findIndex((e) => e.pretePourLaSuite === false)
  const limite = premierBlocage === -1 ? etapes.length - 1 : premierBlocage

  // Au changement d'étape, le lecteur d'écran doit annoncer la nouvelle question, et
  // le clavier repartir du haut : sans cela, le focus reste sur « Continuer », qui a
  // changé de sens entre-temps.
  useEffect(() => {
    titre.current?.focus()
    window.scrollTo({ top: 0 })
  }, [indice])

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        {/*
            Les étapes sont des boutons, et non une frise décorative : revenir sur une
            réponse déjà donnée est le geste le plus fréquent d'un assistant, et il ne
            se faisait qu'en reculant écran par écran.
        */}
        <nav aria-label={t('assistant.etapes')}>
          <ol className="progression">
            {etapes.map((e, i) => (
              <li key={e.cle}>
                <button
                  type="button"
                  className={`progression__pas${i <= indice ? ' progression__pas--fait' : ''}`}
                  aria-current={i === indice ? 'step' : undefined}
                  disabled={i > limite}
                  onClick={() => onIndice(i)}
                >
                  <span className="visuellement-cache">
                    {t('assistant.allerA', { numero: i + 1, titre: e.titre })}
                  </span>
                  <span aria-hidden="true">{i + 1}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <p className="champ__aide" aria-hidden="true">
          {progression}
        </p>
        <h2 ref={titre} tabIndex={-1}>
          {etape.titre}
        </h2>
        <p className="visuellement-cache" aria-live="polite">
          {progression} — {etape.titre}
        </p>
      </header>

      {etape.contenu}

      <div className="pile pile--serre">
        {etape.pretePourLaSuite === false && etape.obstacle && (
          <p className="champ__aide" aria-live="polite">
            {etape.obstacle}
          </p>
        )}

        <div className="rangee rangee--espacee">
          <button
            type="button"
            className="bouton"
            disabled={indice === 0}
            onClick={() => onIndice(indice - 1)}
          >
            {t('onboarding.precedent')}
          </button>

          {derniere ? (
            fin
          ) : (
            <button
              type="button"
              className="bouton bouton--primaire"
              disabled={etape.pretePourLaSuite === false}
              onClick={() => onIndice(indice + 1)}
            >
              {t('onboarding.suivant')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
