/**
 * Ce que l'écran « Aujourd'hui » promet à un parent pressé.
 *
 * `src/lib/aujourdhui.ts` éprouve les règles ; ce qui se joue ici est l'assemblage, et
 * il n'est pas anodin : l'heure en grand doit être celle du prochain bus utile, un jour
 * sans école doit le dire au lieu de laisser un écran muet, et les horaires du jour
 * doivent rester lisibles même quand tout est passé. Trois manières de laisser un enfant
 * au bord de la route, dont aucune ne se voit dans un test de moteur.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Accueil } from './Accueil'
import { FournisseurFoyer, useFoyer } from '../etat'
import { FournisseurTraduction } from '../i18n'
import { FournisseurUrgences } from '../urgences-contexte'
import { FournisseurRechargement } from '../rechargement-contexte'
import fr from '../i18n/fr.json'
import { JOURS } from '../lib/types'
import type { Adresse, Enfant, Foyer, Jour, RepasMidi } from '../lib/types'

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

const HOVELANGE: Adresse = {
  libelle: 'Hovelange 1',
  localite: 'Hovelange',
  coord: [49.7228, 5.9049],
}

/** Deux minutes de marche jusqu'à l'arrêt, quatre trajets les lundis. */
const MIA: Enfant = {
  id: 'mia',
  prenom: 'Mia',
  cycle: 'c2',
  repas: Object.fromEntries(JOURS.map((j) => [j, 'maison'])) as Record<Jour, RepasMidi>,
  periscolaireMidi: false,
  periscolaireHorsMidi: false,
  adresses: {},
}

const FOYER: Foyer = { adresse: HOVELANGE, enfants: [MIA] }

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

/** Monte l'accueil à un instant donné. La date fait tout ici : elle est explicite. */
function monter(quand: Date, foyer: Foyer = FOYER) {
  vi.setSystemTime(quand)
  return render(
    <MemoryRouter>
      <FournisseurTraduction>
        <FournisseurRechargement>
          <FournisseurUrgences>
            <FournisseurFoyer>
              <Amorce foyer={foyer} />
              <Accueil />
            </FournisseurFoyer>
          </FournisseurUrgences>
        </FournisseurRechargement>
      </FournisseurTraduction>
    </MemoryRouter>,
  )
}

/**
 * L'heure en grand, et elle seule.
 *
 * La même heure figure aussi dans les horaires du jour et sur la fiche à imprimer :
 * chercher « 07:45 » dans la page ne dirait pas lequel des trois on a trouvé, et le
 * test passerait alors même que le prochain départ montrerait un bus déjà parti.
 */
const enGrand = () => document.querySelector('.prochain__heure')?.textContent

/** Les heures de la tuile « Horaires du jour », dans l'ordre. */
const horaireDuJour = () =>
  [...document.querySelectorAll('.sous-tuile__heure')].map((e) => e.textContent)

// Un lundi de classe ordinaire, hors vacances : le bus de Mia part à 07:45, revient à
// 12:25, repart à 13:45 et la ramène à 16:25.
const LUNDI = (h: number, m: number) => new Date(2026, 8, 21, h, m)
const TOUSSAINT = new Date(2026, 10, 2, 7, 0)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('le prochain départ', () => {
  it('annonce le premier bus à venir, temps de marche déduit du compte à rebours', () => {
    monter(LUNDI(7, 0))

    expect(enGrand()).toBe('07:45')
    // 45 minutes avant le bus, moins 2 minutes de marche jusqu'à l'arrêt.
    expect(screen.getByText(fr.aujourdhui.dans.replace('{minutes}', '43'))).toBeDefined()
  })

  /*
   * Le cœur du sujet : à 07:50 le bus du matin est parti. L'écran doit montrer le
   * suivant — pas celui qu'on a raté.
   */
  it('passe au suivant dès qu’un bus est parti', () => {
    monter(LUNDI(7, 50))

    expect(enGrand()).toBe('12:25')
    expect(screen.queryByText(fr.aujourdhui.plusDeBus)).toBeNull()
  })

  it('dit qu’il est temps de partir quand la marche ne rentre plus', () => {
    monter(LUNDI(7, 44))

    expect(screen.getByText(fr.aujourdhui.partirMaintenant)).toBeDefined()
  })

  it('annonce la fin des bus plutôt qu’un écran vide, le soir venu', () => {
    monter(LUNDI(17, 0))

    expect(screen.getByText(fr.aujourdhui.plusDeBus)).toBeDefined()
  })
})

describe('les horaires du jour', () => {
  it('restent affichés en entier, y compris ce qui est déjà passé', () => {
    monter(LUNDI(12, 30))

    expect(screen.getByText(fr.aujourdhui.horaireDuJour)).toBeDefined()
    expect(horaireDuJour()).toEqual(['07:45', '12:25', '13:45', '16:25'])
  })
})

describe('les jours sans école', () => {
  it('dit pourquoi il n’y a pas de bus, à la place du prochain départ', () => {
    monter(TOUSSAINT)

    expect(screen.getByText(fr.aujourdhui.pasEcole)).toBeDefined()
    expect(
      screen.getByText(fr.aujourdhui.raisonVacances.replace('{periode}', fr.vacances.toussaint)),
    ).toBeDefined()
    expect(screen.queryByText(fr.aujourdhui.partirMaintenant)).toBeNull()
  })
})

describe('l’horloge de l’écran', () => {
  /*
   * Sans cela, le compte à rebours ne bougeait qu'au gré d'une requête réseau : posé sur
   * la table du petit-déjeuner, l'écran affichait « dans 43 min » pendant dix minutes.
   */
  it('avance seule, sans rien attendre du réseau', () => {
    monter(LUNDI(7, 0))
    expect(screen.getByText(fr.aujourdhui.dans.replace('{minutes}', '43'))).toBeDefined()

    act(() => void vi.advanceTimersByTime(5 * 60_000))

    expect(screen.getByText(fr.aujourdhui.dans.replace('{minutes}', '38'))).toBeDefined()
  })
})

describe('un foyer sans enfant', () => {
  it('propose la configuration plutôt qu’un écran vide', () => {
    monter(LUNDI(7, 0), { adresse: null, enfants: [] })

    expect(screen.getByRole('link', { name: fr.onboarding.commencer })).toBeDefined()
  })
})
