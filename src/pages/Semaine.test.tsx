/**
 * La fiche d'un enfant, semaine entière.
 *
 * C'est l'écran qu'un parent imprime et colle sur le frigo, et le seul endroit où les
 * cinq journées se lisent d'affilée. Deux façons de le rendre inutile sans que rien ne
 * casse : perdre un jour en route, et servir cinq journées vides à l'enfant qui n'a
 * aucun bus à prendre — ce qui se lit comme une panne, pas comme une bonne nouvelle.
 */
import { useEffect, useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Semaine } from './Semaine'
import { FournisseurFoyer, useFoyer } from '../etat'
import { FournisseurTraduction } from '../i18n'
import { FournisseurUrgences } from '../urgences-contexte'
import { FournisseurRechargement } from '../rechargement-contexte'
import { FournisseurInstallation } from '../installation-contexte'
import fr from '../i18n/fr.json'
import { JOURS } from '../lib/types'
import type { Adresse, Cycle, Enfant, Foyer, Jour, RepasMidi } from '../lib/types'

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

// jsdom ne connaît pas `matchMedia`, dont le contexte d'installation se sert pour savoir
// si l'application tourne depuis l'écran d'accueil. Ici, elle tourne dans un navigateur.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})

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

/** À deux pas de l'école de Beckerich : l'arrêt le plus proche EST l'école. */
const DEVANT_LECOLE: Adresse = {
  libelle: 'Dikrecherstrooss',
  localite: 'Beckerich',
  coord: [49.7312, 5.8829],
}

function enfant(id: string, prenom: string, cycle: Cycle): Enfant {
  return {
    id,
    prenom,
    cycle,
    repas: Object.fromEntries(JOURS.map((j) => [j, 'maison'])) as Record<Jour, RepasMidi>,
    periscolaireMidi: false,
    periscolaireHorsMidi: false,
    adresses: {},
  }
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

function monter(foyer: Foyer, id: string) {
  return render(
    <MemoryRouter initialEntries={[`/enfant/${id}`]}>
      <FournisseurTraduction>
        <FournisseurRechargement>
          <FournisseurUrgences>
            <FournisseurFoyer>
              <FournisseurInstallation>
                <Amorce foyer={foyer} />
                <Routes>
                  <Route path="/enfant/:id" element={<Semaine />} />
                </Routes>
              </FournisseurInstallation>
            </FournisseurFoyer>
          </FournisseurUrgences>
        </FournisseurRechargement>
      </FournisseurTraduction>
    </MemoryRouter>,
  )
}

/** La carte d'un jour à l'écran. La fiche à imprimer, elle, n'a pas de titres. */
const carteDuJour = (jour: string) =>
  screen.getByRole('heading', { level: 3, name: jour }).closest('section')!

const MIA = enfant('mia', 'Mia', 'c2')
const TOM = enfant('tom', 'Tom', 'c4')

describe('la semaine d’un enfant qui prend le bus', () => {
  it('donne les cinq jours, chacun avec ses trajets', () => {
    monter({ adresse: HOVELANGE, enfants: [MIA] }, 'mia')

    for (const jour of [fr.jours.lundi, fr.jours.mardi, fr.jours.mercredi, fr.jours.jeudi]) {
      expect(carteDuJour(jour)).toBeDefined()
    }

    // Le lundi de Mia : départ à 07:45, retour de midi à 12:25.
    const lundi = within(carteDuJour(fr.jours.lundi))
    expect(lundi.getByText('07:45')).toBeDefined()
    expect(lundi.getByText('12:25')).toBeDefined()
  })

  it('nomme l’arrêt le plus proche et le temps de marche', () => {
    monter({ adresse: HOVELANGE, enfants: [MIA] }, 'mia')

    expect(screen.getByText(fr.enfant.arretLePlusProche)).toBeDefined()
  })

  /*
   * Deux fois, et c'est voulu : celui qui y pense en arrivant le trouve en haut, celui
   * qui a d'abord lu sa semaine le trouve en repartant. Un lien discret en pied de page
   * ne se voyait ni dans un cas ni dans l'autre.
   */
  it('propose l’agenda en haut et en bas de la fiche', () => {
    monter({ adresse: HOVELANGE, enfants: [MIA] }, 'mia')

    expect(screen.getAllByRole('link', { name: fr.agenda.lienDepuisFiche })).toHaveLength(2)
  })
})

/*
 * L'enfant dont l'école est à cent mètres n'a pas de bus. Cinq journées vides répétées
 * cinq fois se lisent comme une panne de l'application ; il faut le dire une fois, en
 * clair, et se taire ensuite.
 */
describe('l’enfant qui va à l’école à pied', () => {
  it('le dit une fois plutôt que d’aligner cinq journées vides', () => {
    monter({ adresse: DEVANT_LECOLE, enfants: [TOM] }, 'tom')

    expect(screen.getByText(fr.enfant.aPied)).toBeDefined()
    expect(screen.queryByRole('heading', { level: 3, name: fr.jours.lundi })).toBeNull()
  })

  it('ne propose pas l’agenda : il n’y aurait aucun horaire à y mettre', () => {
    monter({ adresse: DEVANT_LECOLE, enfants: [TOM] }, 'tom')

    expect(screen.queryAllByRole('link', { name: fr.agenda.lienDepuisFiche })).toHaveLength(0)
  })
})

describe('une fiche demandée pour un enfant qui n’existe pas', () => {
  it('le dit au lieu de rester blanche', () => {
    monter({ adresse: HOVELANGE, enfants: [MIA] }, 'inconnu')

    expect(screen.getByText(fr.enfant.aucun)).toBeDefined()
  })
})
