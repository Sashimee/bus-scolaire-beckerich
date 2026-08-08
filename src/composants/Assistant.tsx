import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useT } from '../i18n'

export interface Etape {
  /** Clé i18n du titre, sous `assistant.`. */
  cle: string
  contenu: ReactNode
  /** L'étape ne peut pas être quittée tant que ceci est faux. */
  pretePourLaSuite?: boolean
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
 */
export function Assistant({ etapes, indice, onIndice, fin }: Props) {
  const { t } = useT()
  const titre = useRef<HTMLHeadingElement>(null)
  const etape = etapes[indice]
  const derniere = indice === etapes.length - 1

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
        <p className="champ__aide" aria-hidden="true">
          {t('assistant.progression', { etape: indice + 1, total: etapes.length })}
        </p>
        <ol className="progression" aria-hidden="true">
          {etapes.map((e, i) => (
            <li
              key={e.cle}
              className={`progression__pas${i <= indice ? ' progression__pas--fait' : ''}`}
            />
          ))}
        </ol>
        <h2 ref={titre} tabIndex={-1}>
          {t(`assistant.${etape.cle}`)}
        </h2>
        <p className="visuellement-cache" aria-live="polite">
          {t('assistant.progression', { etape: indice + 1, total: etapes.length })}
        </p>
      </header>

      {etape.contenu}

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
  )
}
