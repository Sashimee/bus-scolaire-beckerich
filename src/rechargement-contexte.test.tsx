import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FournisseurRechargement, useBlocageRechargement, useRechargement } from './rechargement-contexte'

/** Affiche l'état du blocage, pour l'observer depuis les tests. */
function Temoin() {
  const { bloque } = useRechargement()
  return <span data-testid="etat">{bloque ? 'bloque' : 'libre'}</span>
}

function Saisie({ enCours, raison = 'brouillon' }: { enCours: boolean; raison?: string }) {
  useBlocageRechargement(enCours, raison)
  return null
}

const etat = () => screen.getByTestId('etat').textContent

describe('blocage du rechargement automatique', () => {
  it('ne bloque rien tant qu’aucune saisie n’est en cours', () => {
    render(
      <FournisseurRechargement>
        <Temoin />
        <Saisie enCours={false} />
      </FournisseurRechargement>,
    )
    expect(etat()).toBe('libre')
  })

  it('bloque pendant une saisie et libère à la fin', () => {
    const { rerender } = render(
      <FournisseurRechargement>
        <Temoin />
        <Saisie enCours={true} />
      </FournisseurRechargement>,
    )
    expect(etat()).toBe('bloque')

    rerender(
      <FournisseurRechargement>
        <Temoin />
        <Saisie enCours={false} />
      </FournisseurRechargement>,
    )
    expect(etat()).toBe('libre')
  })

  it('libère au démontage de la page qui bloquait', () => {
    // Sans cela, quitter /admin laisserait l'application bloquée pour toute la session.
    const { rerender } = render(
      <FournisseurRechargement>
        <Temoin />
        <Saisie enCours={true} />
      </FournisseurRechargement>,
    )
    expect(etat()).toBe('bloque')

    rerender(
      <FournisseurRechargement>
        <Temoin />
      </FournisseurRechargement>,
    )
    expect(etat()).toBe('libre')
  })

  it('reste bloqué tant qu’une seule des raisons subsiste', () => {
    const { rerender } = render(
      <FournisseurRechargement>
        <Temoin />
        <Saisie enCours={true} raison="brouillon-admin" />
        <Saisie enCours={true} raison="brouillon-commune" />
      </FournisseurRechargement>,
    )
    expect(etat()).toBe('bloque')

    rerender(
      <FournisseurRechargement>
        <Temoin />
        <Saisie enCours={false} raison="brouillon-admin" />
        <Saisie enCours={true} raison="brouillon-commune" />
      </FournisseurRechargement>,
    )
    expect(etat()).toBe('bloque')
  })

  it('refuse de fonctionner hors de son fournisseur', () => {
    // Un bandeau rendu hors du fournisseur rechargerait sans jamais consulter la
    // garde : mieux vaut une erreur franche au développement.
    expect(() => render(<Temoin />)).toThrow()
  })
})
