/**
 * La carte ne part pas chercher ses tuiles toute seule.
 *
 * Les triplets `{z}/{x}/{y}` demandés à OpenStreetMap sont calculés depuis le domicile
 * jusqu'au zoom 18 : la tuile centrale désigne le pâté de maisons. Montée au montage,
 * cette carte faisait donc sortir une dérivée de l'adresse à chaque ouverture d'une
 * fiche enfant, pendant que « Limites » affirmait que rien ne sortait. R61.
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CarteTrajet } from './CarteTrajet'
import { FournisseurTraduction } from '../i18n'
import fr from '../i18n/fr.json'
import type { Arret } from '../lib/types'

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

const ARRET: Arret = {
  id: 'hovelange-kneppchen',
  village: 'Hovelange',
  lieuNom: 'Kneppchen',
  coord: [49.72349, 5.90348],
  precision: 'approximative',
  source: 'test',
}

const DOMICILE: [number, number] = [49.7228, 5.9049]

function monter() {
  return render(
    <FournisseurTraduction>
      <CarteTrajet depuis={DOMICILE} vers={ARRET} />
    </FournisseurTraduction>,
  )
}

describe('carte du trajet', () => {
  it('ne demande aucune tuile avant que le parent ne le demande', () => {
    const { container } = monter()

    expect(screen.getByRole('button', { name: fr.carte.afficher })).toBeDefined()
    expect(container.querySelector('.carte-osm')).toBeNull()
  })

  it('dit ce que le geste déclenche, plutôt que de le taire', () => {
    monter()

    const avertissement = screen.getByText(fr.carte.avertissement)
    expect(avertissement).toBeDefined()
    expect(fr.carte.avertissement).toContain('OpenStreetMap')
  })

  it('ne charge la carte qu’après le geste', () => {
    const { container } = monter()

    fireEvent.click(screen.getByRole('button', { name: fr.carte.afficher }))

    expect(screen.queryByRole('button', { name: fr.carte.afficher })).toBeNull()
    // Hors ligne ou non, l'un des deux états succède au bouton : jamais le bouton lui-même.
    const chargee = container.querySelector('.carte-osm') !== null
    const horsLigne = screen.queryByText(fr.carte.horsLigne) !== null
    expect(chargee || horsLigne).toBe(true)
  })
})
