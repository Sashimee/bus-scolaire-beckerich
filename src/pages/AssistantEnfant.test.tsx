/**
 * Les invariants de l'assistant, ceux qu'une régression casse en silence.
 *
 * Premier test d'interface du dépôt : le moteur est couvert par `src/lib/*.test.ts`,
 * mais rien ne garantissait jusqu'ici qu'un réglage n'en contredise pas un autre à
 * l'écran — un enfant déposé au Dillendapp le lundi matin qui se voit quand même
 * proposer une adresse de départ ce matin-là, par exemple.
 *
 * On monte l'application entière plutôt qu'un composant isolé : c'est `etat.tsx` qui
 * porte ces invariants, et c'est donc l'assemblage qu'il faut éprouver.
 */
import { useEffect, useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AssistantEnfant } from './AssistantEnfant'
import { FournisseurFoyer, useFoyer } from '../etat'
import { FournisseurTraduction } from '../i18n'
import { FournisseurUrgences } from '../urgences-contexte'
import { FournisseurRechargement } from '../rechargement-contexte'
import fr from '../i18n/fr.json'
import type { Adresse, Enfant, Foyer, Jour, RepasMidi } from '../lib/types'
import { JOURS } from '../lib/types'

// Le fournisseur déduit la langue du navigateur, qui répond « en » sous jsdom. Les
// assertions portent sur le dictionnaire de référence : autant le lui imposer.
Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

const HOVELANGE: Adresse = {
  libelle: 'Hovelange 1',
  localite: 'Hovelange',
  coord: [49.7228, 5.9049],
}

function enfant(id: string, prenom: string): Enfant {
  return {
    id,
    prenom,
    cycle: 'c2',
    repas: Object.fromEntries(JOURS.map((j) => [j, 'maison'])) as Record<Jour, RepasMidi>,
    periscolaireMidi: false,
    periscolaireHorsMidi: false,
    adresses: {},
  }
}

/**
 * Pose le foyer de départ. `localStorage` n'est pas disponible sous jsdom — et de
 * toute façon, passer par les actions du contexte éprouve le chemin réel.
 */
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

/** Expose l'enfant tel que l'état le porte réellement, invariants appliqués. */
function Temoin({ id }: { id: string }) {
  const { foyer } = useFoyer()
  return <span data-testid="enfant">{JSON.stringify(foyer.enfants.find((e) => e.id === id))}</span>
}

function monter(foyer: Foyer, id: string) {
  return render(
    <MemoryRouter initialEntries={[`/enfant/${id}/assistant`]}>
      <FournisseurTraduction>
        <FournisseurRechargement>
          <FournisseurUrgences>
            <FournisseurFoyer>
              <Amorce foyer={foyer} />
              <Routes>
                <Route path="/enfant/:id/assistant" element={<AssistantEnfant />} />
              </Routes>
              <Temoin id={id} />
            </FournisseurFoyer>
          </FournisseurUrgences>
        </FournisseurRechargement>
      </FournisseurTraduction>
    </MemoryRouter>,
  )
}

/** L'enfant tel qu'il est réellement enregistré, après les invariants d'`etat.tsx`. */
const enregistre = (): Enfant =>
  JSON.parse(screen.getByTestId('enfant').textContent!) as Enfant

const cliquer = (element: HTMLElement) => act(() => element.click())

/** Avance jusqu'à l'étape portant ce titre français. */
function allerA(titre: string) {
  for (let i = 0; i < 8; i++) {
    if (screen.queryByRole('heading', { level: 2, name: titre })) return
    cliquer(screen.getByRole('button', { name: fr.onboarding.suivant }))
  }
  throw new Error(`étape « ${titre} » introuvable`)
}

describe('adresse du foyer dans l’assistant', () => {
  it('reste modifiable tant qu’il n’y a qu’un enfant', () => {
    monter({ adresse: null, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.adresse)
    expect(screen.getByLabelText(fr.adresse.label)).toBeDefined()
  })

  it('devient consultable seulement dès le deuxième enfant', () => {
    // La modifier depuis l'assistant du cadet déplacerait aussi l'aîné, sans que rien
    // ne le dise.
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa'), enfant('b', 'Tom')] }, 'b')
    allerA(fr.assistant.adresse)
    expect(screen.queryByLabelText(fr.adresse.label)).toBeNull()
    expect(screen.getByText(fr.adresse.partageeFratrie)).toBeDefined()
    expect(screen.getByRole('link', { name: fr.adresse.modifierPourTous })).toBeDefined()
  })
})

describe('inscription au Dillendapp', () => {
  it('bascule toute la semaine sur le Dillendapp quand on coche le midi', () => {
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.midi)
    cliquer(screen.getByLabelText(fr.dillendapp.inscriptionMidi, { exact: false }))

    const e = enregistre()
    expect(JOURS.every((j) => e.repas[j] === 'dillendapp')).toBe(true)
  })

  it('n’écrase pas une grille déjà réglée jour par jour', () => {
    const regle = enfant('a', 'Léa')
    regle.repas = { ...regle.repas, mardi: 'dillendapp' }
    monter({ adresse: HOVELANGE, enfants: [regle] }, 'a')
    allerA(fr.assistant.midi)
    cliquer(screen.getByLabelText(fr.dillendapp.inscriptionMidi, { exact: false }))

    const e = enregistre()
    expect(e.repas.mardi).toBe('dillendapp')
    expect(e.repas.lundi).toBe('maison')
  })

  it('n’ouvre les horaires que si la case hors-midi est cochée', () => {
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.midi)
    cliquer(screen.getByLabelText(fr.dillendapp.inscriptionMidi, { exact: false }))
    cliquer(screen.getByRole('button', { name: fr.onboarding.suivant }))
    // Sans la case hors-midi, l'étape suivante est celle des adresses.
    expect(screen.queryByRole('heading', { level: 2, name: fr.assistant.periscolaire })).toBeNull()
  })
})

describe('contradictions entre réglages', () => {
  /** Coche la case hors-midi, puis ouvre l'étape des horaires. */
  function ouvrirHoraires() {
    allerA(fr.assistant.midi)
    cliquer(screen.getByLabelText(fr.dillendapp.inscriptionHorsMidi, { exact: false }))
    allerA(fr.assistant.periscolaire)
  }

  it('efface l’adresse du matin dès que le parent dépose l’enfant lui-même', () => {
    const avecAdresse = enfant('a', 'Léa')
    avecAdresse.adresses = {
      lundi: { matin: { libelle: 'Chez la nounou', localite: 'Schweich', coord: [49.7209, 5.9214] } },
    }
    monter({ adresse: HOVELANGE, enfants: [avecAdresse] }, 'a')
    ouvrirHoraires()

    const matin = screen.getByRole('group', { name: fr.dillendapp.blocMatin })
    cliquer(within(matin).getAllByRole('checkbox')[0])

    const e = enregistre()
    expect(e.dillendappDepuis!.lundi).toBe('07:00')
    expect(e.adresses?.lundi?.matin ?? null).toBeNull()
  })

  it('force le repas au Dillendapp un jour sans cours l’après-midi', () => {
    // Le mardi, la classe s'arrête à 11:45 : y rester l'après-midi suppose d'y
    // avoir déjeuné.
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    ouvrirHoraires()

    const soir = screen.getByRole('group', { name: fr.dillendapp.blocSoir })
    cliquer(within(soir).getAllByRole('checkbox')[1])

    const e = enregistre()
    expect(e.repas.mardi).toBe('dillendapp')
    expect(e.periscolaireMidi).toBe(true)
  })
})

describe('fin de l’assistant', () => {
  it('ne répète pas les actions de la fiche', () => {
    // L'impression est sur `/enfant/:id`, le fichier d'agenda sur `/agenda` et la copie
    // du lien sur `/reglages` : aucune de ces actions n'a sa place ici.
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.recapitulatif)
    expect(
      screen.queryByRole('button', { name: fr.calendrier.icsEnfant.replace('{prenom}', 'Léa') }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: fr.partage.copier })).toBeNull()
    expect(screen.queryByRole('button', { name: fr.impression.bouton })).toBeNull()
    expect(screen.getByRole('button', { name: fr.assistant.terminer })).toBeDefined()
  })

  it('annonce un nombre d’étapes qui ne bouge pas sous les pieds du parent', () => {
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    // L'étape des horaires est masquée, mais le total reste celui de l'assistant
    // complet : sinon « sur 6 » devient « sur 7 » au moment où l'on coche une case.
    expect(screen.getAllByText(/sur 7$/).length).toBeGreaterThan(0)
  })
})
