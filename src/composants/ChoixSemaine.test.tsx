/**
 * L'état coché des cartes-réponses.
 *
 * Il tenait à `.choix__option:has(input:checked)` : le fond teinté et la bordure
 * d'accent venaient du sélecteur, pas du composant. Sur un moteur sans `:has()`, la
 * réponse retenue n'aurait plus été signalée que par la puce du bouton radio — lisible,
 * mais bien plus discret que prévu — et rien ici ne l'aurait dit, jsdom n'appliquant
 * aucune feuille de style.
 *
 * La classe étant désormais posée par le composant, elle s'assère. C'est le premier
 * test du dépôt sur cet état : ni `checked`, ni classe, n'étaient vérifiés nulle part.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ChoixSimple, type OptionChoix } from './ChoixSemaine'

type Reponse = 'bus' | 'ecole' | 'relais'

const OPTIONS: readonly OptionChoix<Reponse>[] = [
  { valeur: 'bus', libelle: 'En bus', court: 'Bus' },
  { valeur: 'ecole', libelle: 'Je l’emmène à l’école', court: 'École' },
  { valeur: 'relais', libelle: 'Je l’emmène à la maison relais', aide: 'Puis navette', court: 'Relais' },
]

const monter = (valeur: Reponse, onChoisir = () => {}) =>
  render(<ChoixSimple id="matin" options={OPTIONS} valeur={valeur} onChoisir={onChoisir} />)

/** La carte porte la classe ; le bouton radio est dedans. */
const carte = (libelle: string) =>
  screen.getByLabelText(libelle, { exact: false }).closest('label')!
const radio = (libelle: string) =>
  screen.getByLabelText(libelle, { exact: false }) as HTMLInputElement

describe('cartes-réponses', () => {
  it('signale la réponse retenue par une classe, et pas seulement par la puce', () => {
    monter('ecole')
    expect(carte('Je l’emmène à l’école').className).toContain('reponses__option--retenu')
    expect(radio('Je l’emmène à l’école').checked).toBe(true)
  })

  it('ne la pose que sur celle-là', () => {
    // Trois options, pour qu'une classe posée sur toutes ne passe pas.
    monter('ecole')
    expect(carte('En bus').className).not.toContain('reponses__option--retenu')
    expect(carte('Je l’emmène à la maison relais').className).not.toContain(
      'reponses__option--retenu',
    )
    expect(radio('En bus').checked).toBe(false)
    expect(radio('Je l’emmène à la maison relais').checked).toBe(false)
  })

  it('suit la valeur reçue, sans état interne', () => {
    // Le composant ne mémorise rien : la réponse affichée est celle du stockage, et
    // c'est ce qui garantit que la grille des cinq jours et la question en gros ne
    // peuvent pas se contredire.
    const { rerender } = monter('bus')
    expect(carte('En bus').className).toContain('reponses__option--retenu')
    rerender(<ChoixSimple id="matin" options={OPTIONS} valeur="relais" onChoisir={() => {}} />)
    expect(carte('En bus').className).not.toContain('reponses__option--retenu')
    expect(carte('Je l’emmène à la maison relais').className).toContain(
      'reponses__option--retenu',
    )
  })

  it('annonce la réponse cliquée', () => {
    const onChoisir = vi.fn()
    monter('bus', onChoisir)
    act(() => radio('Je l’emmène à la maison relais').click())
    expect(onChoisir).toHaveBeenCalledWith('relais')
  })

  it('n’enveloppe pas les cartes dans une carte', () => {
    // `.choix` était déclaré deux fois dans la même couche, ici et pour la carte
    // cliquable de l'espace commune : la seconde gagnait, et le groupe héritait d'un
    // fond, d'un padding et d'un `:hover` qui le teintait comme s'il était cliquable.
    monter('bus')
    expect(carte('En bus').parentElement!.className).toBe('reponses')
  })
})
