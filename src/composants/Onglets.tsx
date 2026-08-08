import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

export interface Onglet {
  cle: string
  libelle: string
  contenu: ReactNode
}

/**
 * Onglets, au motif ARIA complet.
 *
 * L'onglet actif vit dans la query string, pas dans un `useState` : `/admin` bloque le
 * rechargement automatique pendant une saisie, et un rechargement qui ramènerait
 * l'agent communal sur le premier onglet lui ferait perdre le fil de ce qu'il éditait.
 * C'est aussi ce qui permet d'envoyer un lien direct vers un onglet précis.
 *
 * Le contenu des onglets inactifs n'est pas monté : chaque panneau porte son propre
 * brouillon, et les garder tous vivants ferait cohabiter plusieurs blocages de
 * rechargement pour des saisies que personne ne regarde.
 */
export function Onglets({
  onglets,
  param = 'onglet',
}: {
  onglets: Onglet[]
  /** Nom du paramètre d'URL qui porte l'onglet actif. */
  param?: string
}) {
  const [parametres, setParametres] = useSearchParams()
  const boutons = useRef<(HTMLButtonElement | null)[]>([])

  const demande = parametres.get(param)
  const actif = Math.max(
    0,
    onglets.findIndex((o) => o.cle === demande),
  )

  const aller = (i: number) => {
    const suivants = new URLSearchParams(parametres)
    suivants.set(param, onglets[i].cle)
    setParametres(suivants, { replace: true })
  }

  // Flèches gauche/droite, avec bouclage : c'est ce qu'attend quiconque navigue au
  // clavier dans une barre d'onglets.
  const auClavier = (e: React.KeyboardEvent, i: number) => {
    const pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!pas) return
    e.preventDefault()
    const cible = (i + pas + onglets.length) % onglets.length
    aller(cible)
    boutons.current[cible]?.focus()
  }

  return (
    <div className="pile">
      <div className="segments segments--onglets" role="tablist">
        {onglets.map((o, i) => (
          <button
            key={o.cle}
            ref={(el) => {
              boutons.current[i] = el
            }}
            type="button"
            role="tab"
            id={`onglet-${o.cle}`}
            aria-selected={i === actif}
            aria-controls={`panneau-${o.cle}`}
            // Un seul onglet dans l'ordre de tabulation : la barre entière se parcourt
            // ensuite aux flèches, pas à coups de Tab.
            tabIndex={i === actif ? 0 : -1}
            onClick={() => aller(i)}
            onKeyDown={(e) => auClavier(e, i)}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panneau-${onglets[actif].cle}`}
        aria-labelledby={`onglet-${onglets[actif].cle}`}
        tabIndex={0}
      >
        {onglets[actif].contenu}
      </div>
    </div>
  )
}
