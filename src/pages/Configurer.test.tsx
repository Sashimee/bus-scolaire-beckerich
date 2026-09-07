/**
 * L'écran où un foyer se saisit.
 *
 * Il porte deux règles qu'aucun test de moteur ne voit, et qui décident de tout ce que
 * le parent aura à taper : un enfant neuf part vers l'assistant, qui lui demande ce
 * qu'on ne sait pas encore ; un enfant calqué sur son aîné est déjà complet et part
 * droit sur sa fiche. Se tromper de sens, c'est soit six écrans de questions inutiles,
 * soit une semaine calculée sur des réponses que personne n'a données.
 */
import { useEffect, useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { Configurer } from './Configurer'
import { FournisseurFoyer, useFoyer } from '../etat'
import { FournisseurTraduction } from '../i18n'
import { FournisseurRechargement } from '../rechargement-contexte'
import { FournisseurUrgences } from '../urgences-contexte'
import fr from '../i18n/fr.json'
import { JOURS } from '../lib/types'
import type { Adresse, Enfant, Foyer, Jour, RepasMidi } from '../lib/types'

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

const memoire = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (c: string) => memoire.get(c) ?? null,
    setItem: (c: string, v: string) => void memoire.set(c, v),
    removeItem: (c: string) => void memoire.delete(c),
    clear: () => memoire.clear(),
  },
})

const HOVELANGE: Adresse = {
  libelle: 'Hovelange 1',
  localite: 'Hovelange',
  coord: [49.7228, 5.9049],
}

/** Une aînée dont la semaine s'écarte du cas courant : elle mange à la cantine le lundi. */
const LEA: Enfant = {
  id: 'lea',
  prenom: 'Léa',
  cycle: 'c2',
  repas: Object.fromEntries(
    JOURS.map((j) => [j, j === 'lundi' ? 'relais' : 'maison']),
  ) as Record<Jour, RepasMidi>,
  periscolaireMidi: true,
  periscolaireHorsMidi: false,
  adresses: {},
}

function Amorce({ foyer }: { foyer: Foyer }) {
  const { remplacerFoyer } = useFoyer()
  const pose = useRef(false)
  useEffect(() => {
    if (pose.current) return
    pose.current = true
    remplacerFoyer(foyer)
  }, [foyer, remplacerFoyer])
  return null
}

/** Où la page a envoyé le parent, et ce que l'état a réellement retenu. */
function Temoin() {
  const { pathname } = useLocation()
  const { foyer } = useFoyer()
  return (
    <>
      <span data-testid="chemin">{pathname}</span>
      <span data-testid="foyer">{JSON.stringify(foyer.enfants)}</span>
    </>
  )
}

function monter(foyer: Foyer) {
  memoire.clear()
  return render(
    <MemoryRouter initialEntries={['/configurer']}>
      <FournisseurTraduction>
        <FournisseurRechargement>
          <FournisseurUrgences>
            <FournisseurFoyer>
              <Amorce foyer={foyer} />
              <Configurer />
              <Temoin />
            </FournisseurFoyer>
          </FournisseurUrgences>
        </FournisseurRechargement>
      </FournisseurTraduction>
    </MemoryRouter>,
  )
}

const chemin = () => screen.getByTestId('chemin').textContent!
const enfants = (): Enfant[] => JSON.parse(screen.getByTestId('foyer').textContent!) as Enfant[]

/** Remplit le prénom du formulaire d'ajout et valide. */
function ajouter(prenom: string) {
  const champ = screen.getByLabelText(fr.enfant.ajouter) as HTMLInputElement
  act(() => {
    const poser = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    poser.call(champ, prenom)
    champ.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => screen.getByRole('button', { name: fr.enfant.ajouter }).click())
}

describe('ajouter un enfant', () => {
  it('envoie le premier enfant vers l’assistant : rien n’est encore connu de lui', () => {
    monter({ adresse: HOVELANGE, enfants: [] })

    ajouter('Mia')

    const [mia] = enfants()
    expect(mia.prenom).toBe('Mia')
    expect(chemin()).toBe(`/enfant/${mia.id}/assistant`)
  })

  /*
   * Le deuxième enfant est calqué sur l'aîné par défaut : dans une même famille le
   * rythme se ressemble, et retaper la même grille est le meilleur moyen de s'y tromper.
   * Il est donc déjà complet — l'envoyer dans l'assistant serait six écrans pour rien.
   */
  it('envoie le suivant sur sa fiche, déjà calqué sur son aîné', () => {
    monter({ adresse: HOVELANGE, enfants: [LEA] })

    ajouter('Tom')

    const tom = enfants().find((e) => e.prenom === 'Tom')!
    expect(chemin()).toBe(`/enfant/${tom.id}`)
    expect(tom.repas.lundi).toBe('relais')
    expect(tom.periscolaireMidi).toBe(true)
  })

  it('refuse d’ajouter un enfant sans prénom', () => {
    monter({ adresse: HOVELANGE, enfants: [] })

    const bouton = screen.getByRole('button', { name: fr.enfant.ajouter }) as HTMLButtonElement
    expect(bouton.disabled).toBe(true)
  })
})

describe('la sortie de l’écran de configuration', () => {
  it('ne s’ouvre qu’une fois le foyer utilisable', () => {
    monter({ adresse: null, enfants: [] })
    expect(screen.queryByRole('link', { name: fr.onboarding.terminer })).toBeNull()

    monter({ adresse: HOVELANGE, enfants: [LEA] })
    expect(screen.getByRole('link', { name: fr.onboarding.terminer })).toBeDefined()
  })

  it('dit qu’aucun enfant n’est enregistré plutôt que de laisser la section vide', () => {
    monter({ adresse: HOVELANGE, enfants: [] })

    expect(screen.getByText(fr.enfant.aucun)).toBeDefined()
  })
})
