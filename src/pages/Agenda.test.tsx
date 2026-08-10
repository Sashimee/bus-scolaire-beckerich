/**
 * Ce que le compte rendu de synchronisation dit, et ce qu'il taisait.
 *
 * `synchroniserEnfant` a toujours renvoyé `echecs` ; la page ne lisait que `ecrits`. Un
 * rendez-vous refusé pour lui-même — corps rejeté, quota — se soldait donc par « 3
 * rendez-vous écrits », annoncé comme une réussite pleine. Sans conséquence tant que
 * rien n'échoue, trompeur le jour où quelque chose échoue : c'est la définition d'une
 * régression silencieuse, et c'est pourquoi ce test existe.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fr from '../i18n/fr.json'
import type { Adresse, Enfant, Foyer, Jour, RepasMidi } from '../lib/types'
import { JOURS } from '../lib/types'

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

/**
 * L'intégration Google, simulée entièrement.
 *
 * Sans `VITE_ID_CLIENT_GOOGLE`, le bloc n'apparaît même pas ; et le vrai module parle à
 * Google. On garde `evenementsEnfant`, qui est du calcul pur, et on ne remplace que la
 * couche réseau — ce qu'on veut éprouver ici est la page, pas le protocole.
 */
const resultat = vi.hoisted(() => ({ agenda: 'Bus scolaire — Léa', ecrits: 3, echecs: 0 }))

vi.mock('../lib/agenda/google', () => ({
  googleConfigure: () => true,
  chargerJeton: () => 'jeton',
  jetonValide: async () => 'jeton',
  terminerConnexion: async () => false,
  oublierJeton: () => {},
  demarrerConnexion: async () => {},
  synchroniserEnfant: async () => resultat,
}))

const HOVELANGE: Adresse = { libelle: 'Hovelange 1', localite: 'Hovelange', coord: [49.7228, 5.9049] }

const grille = <T,>(v: T) => Object.fromEntries(JOURS.map((j) => [j, v])) as Record<Jour, T>

const LEA: Enfant = {
  id: 'a',
  prenom: 'Léa',
  cycle: 'c2',
  repas: grille<RepasMidi>('maison'),
  bus: grille('aller-retour' as const),
  periscolaireMidi: false,
  periscolaireHorsMidi: false,
  dillendappDepuis: grille<string | null>(null),
  dillendappJusqua: grille<string | null>(null),
  adresses: {},
}

const FOYER: Foyer = { adresse: HOVELANGE, enfants: [LEA] }

/** Pose le foyer avant le montage : `etat.tsx` le relit depuis `localStorage`. */
function monter() {
  const contenu = new Map<string, string>([['bus-beckerich.foyer', JSON.stringify(FOYER)]])
  vi.stubGlobal('localStorage', {
    getItem: (c: string) => contenu.get(c) ?? null,
    setItem: (c: string, v: string) => void contenu.set(c, v),
    removeItem: (c: string) => void contenu.delete(c),
  })
  return contenu
}

async function afficher() {
  const { Agenda } = await import('./Agenda')
  const { FournisseurFoyer } = await import('../etat')
  const { FournisseurTraduction } = await import('../i18n')
  const { FournisseurUrgences } = await import('../urgences-contexte')

  render(
    <MemoryRouter initialEntries={['/agenda']}>
      <FournisseurTraduction>
        <FournisseurUrgences>
          <FournisseurFoyer>
            <Agenda />
          </FournisseurFoyer>
        </FournisseurUrgences>
      </FournisseurTraduction>
    </MemoryRouter>,
  )
  // La reprise de session est asynchrone : sans ce tour de boucle, React se plaint
  // d'une mise à jour hors `act` et l'écran testé n'est pas celui qui s'affiche.
  await act(async () => {})
}

const synchroniser = async () => {
  const bouton = screen.getByRole('button', { name: fr.agenda.googleSynchroniser })
  await act(async () => {
    bouton.click()
  })
}

const attendu = (modele: string, nombre: number, autres: Record<string, string | number> = {}) =>
  Object.entries({ nombre, ...autres }).reduce(
    (texte, [cle, valeur]) => texte.replace(`{${cle}}`, String(valeur)),
    modele,
  )

describe('compte rendu de la synchronisation Google', () => {
  it('annonce les rendez-vous écrits', async () => {
    monter()
    Object.assign(resultat, { ecrits: 3, echecs: 0 })
    await afficher()
    await synchroniser()

    expect(screen.getByText(attendu(fr.agenda.googleFait, 3, { enfants: 1 }))).toBeDefined()
    expect(screen.queryByText(fr.agenda.googleEchecsTitre)).toBeNull()
  })

  it('ne tait pas les rendez-vous que Google a refusés', async () => {
    monter()
    Object.assign(resultat, { ecrits: 1, echecs: 2 })
    await afficher()
    await synchroniser()

    expect(screen.getByText(fr.agenda.googleEchecsTitre)).toBeDefined()
    expect(screen.getByText(attendu(fr.agenda.googleEchecs, 2))).toBeDefined()
  })
})
