/**
 * Les invariants de l'assistant, ceux qu'une régression casse en silence.
 *
 * Le moteur est couvert par `src/lib/*.test.ts` — dont `moments.test.ts`, qui éprouve
 * la traduction entre une réponse de parent et les champs du stockage. Ce qui se joue
 * ici est l'assemblage : que l'écran écrive bien ce qu'il affiche, qu'une question ne
 * se pose pas là où elle n'a pas d'objet, et que le parcours ne change pas de forme
 * sous les pieds du parent.
 *
 * On monte l'application entière plutôt qu'un composant isolé : c'est `etat.tsx` qui
 * porte ces invariants, et c'est donc l'assemblage qu'il faut éprouver.
 */
import { useEffect, useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AssistantEnfant } from './AssistantEnfant'
import { FournisseurFoyer, useFoyer } from '../etat'
import { FournisseurTraduction } from '../i18n'
import { FournisseurUrgences } from '../urgences-contexte'
import { FournisseurRechargement } from '../rechargement-contexte'
import fr from '../i18n/fr.json'
import type { Adresse, Enfant, Foyer, Jour, RepasMidi } from '../lib/types'
import { JOURS } from '../lib/types'
import { JOURS_MIDI } from '../lib/moments'

// Le fournisseur déduit la langue du navigateur, qui répond « en » sous jsdom. Les
// assertions portent sur le dictionnaire de référence : autant le lui imposer.
Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

const HOVELANGE: Adresse = {
  libelle: 'Hovelange 1',
  localite: 'Hovelange',
  coord: [49.7228, 5.9049],
}

const NOUNOU: Adresse = {
  libelle: 'Chez la nounou',
  localite: 'Schweich',
  coord: [49.7209, 5.9214],
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
const enregistre = (): Enfant => JSON.parse(screen.getByTestId('enfant').textContent!) as Enfant

const cliquer = (element: HTMLElement) => act(() => element.click())

/** Avance jusqu'à l'étape portant ce titre français. */
function allerA(titre: string) {
  for (let i = 0; i < 8; i++) {
    if (screen.queryByRole('heading', { level: 2, name: titre })) return
    cliquer(screen.getByRole('button', { name: fr.onboarding.suivant }))
  }
  throw new Error(`étape « ${titre} » introuvable`)
}

/** Coche une réponse en carte, dont le nom accessible porte aussi son explication. */
const repondre = (libelle: string) => cliquer(screen.getByLabelText(libelle, { exact: false }))

describe('adresse du foyer dans l’assistant', () => {
  it('reste modifiable tant qu’il n’y a qu’un enfant', () => {
    monter({ adresse: null, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.titreAdresse.replace('{prenom}', 'Léa'))
    expect(screen.getByLabelText(fr.adresse.label)).toBeDefined()
  })

  it('devient consultable seulement dès le deuxième enfant', () => {
    // La modifier depuis l'assistant du cadet déplacerait aussi l'aîné, sans que rien
    // ne le dise.
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa'), enfant('b', 'Tom')] }, 'b')
    allerA(fr.assistant.titreAdresse.replace('{prenom}', 'Tom'))
    expect(screen.queryByLabelText(fr.adresse.label)).toBeNull()
    expect(screen.getByText(fr.adresse.partageeFratrie)).toBeDefined()
    expect(screen.getByRole('link', { name: fr.adresse.modifierPourTous })).toBeDefined()
  })
})

describe('une question par moment de la journée', () => {
  it('écrit d’un seul geste tout ce qu’une dépose à la maison relais implique', () => {
    // Trois réglages du stockage — l'heure de présence, l'usage du bus, l'adresse de
    // départ — pour une seule phrase de parent. C'est la raison d'être des moments.
    const avecAdresse = enfant('a', 'Léa')
    avecAdresse.adresses = { lundi: { matin: NOUNOU } }
    monter({ adresse: HOVELANGE, enfants: [avecAdresse] }, 'a')

    allerA(fr.assistant.titreMatin)
    repondre(fr.matin.relais)

    const e = enregistre()
    expect(JOURS.every((j) => e.dillendappDepuis![j] === '07:00')).toBe(true)
    expect(e.periscolaireHorsMidi).toBe(true)
    expect(e.bus!.lundi).toBe('retour')
    expect(e.adresses?.lundi?.matin ?? null).toBeNull()
  })

  it('force le repas au Dillendapp un jour sans cours l’après-midi', () => {
    // Le mardi, la classe s'arrête à 11:45 : y rester l'après-midi suppose d'y avoir
    // déjeuné. Le parent n'a pas à faire le rapprochement lui-même.
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.titreSoir)
    repondre(fr.soir.relais)

    const e = enregistre()
    expect(e.repas.mardi).toBe('dillendapp')
    expect(e.periscolaireMidi).toBe(true)
    expect(e.dillendappJusqua!.mardi).not.toBeNull()
  })

  it('ne propose la grille des cinq jours que si on la demande', () => {
    // La réponse est la même tous les jours pour la quasi-totalité des familles :
    // cinq lignes à régler étaient cinq occasions de se tromper.
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.titreMatin)
    expect(screen.queryByRole('group', { name: fr.semaine.touteLaSemaine })).toBeNull()

    cliquer(screen.getByRole('button', { name: fr.semaine.detailler }))
    expect(screen.getByRole('group', { name: fr.semaine.touteLaSemaine })).toBeDefined()
  })

  it('ouvre la grille d’elle-même quand la semaine est déjà irrégulière', () => {
    // Repliée, la réponse affichée en gros mentirait quatre jours sur cinq.
    const irregulier = enfant('a', 'Léa')
    irregulier.bus = Object.fromEntries(
      JOURS.map((j) => [j, j === 'mercredi' ? 'retour' : 'aller-retour']),
    ) as Enfant['bus']
    monter({ adresse: HOVELANGE, enfants: [irregulier] }, 'a')

    allerA(fr.assistant.titreMatin)
    expect(screen.getByRole('group', { name: fr.semaine.touteLaSemaine })).toBeDefined()
  })

  it('ne pose pas la question du déjeuner les jours où la classe s’arrête à midi', () => {
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.titreMidi)
    cliquer(screen.getByRole('button', { name: fr.semaine.detailler }))

    // Les cinq jours ont un groupe de réponses au matin ; le midi n'en a que trois.
    expect(screen.queryByRole('group', { name: fr.jours.mardi })).toBeNull()
    expect(screen.getByRole('group', { name: fr.jours.lundi })).toBeDefined()
  })
})

describe('forme du parcours', () => {
  it('annonce six étapes, et aucune ne se dérobe en cours de route', () => {
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    expect(screen.getAllByText(/sur 6$/).length).toBeGreaterThan(0)

    // Une réponse qui ouvrait autrefois un écran de plus n'en ouvre plus aucun : le
    // repère ne bouge pas sous les pieds du parent.
    allerA(fr.assistant.titreSoir)
    repondre(fr.soir.relais)
    expect(screen.getAllByText(/sur 6$/).length).toBeGreaterThan(0)
  })

  it('permet de revenir sur une réponse sans reculer écran par écran', () => {
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.titreSoir)

    const versLeMatin = fr.assistant.allerA
      .replace('{numero}', '3')
      .replace('{titre}', fr.assistant.titreMatin)
    cliquer(screen.getByRole('button', { name: versLeMatin }))
    expect(screen.getByRole('heading', { level: 2, name: fr.assistant.titreMatin })).toBeDefined()
  })

  it('récapitule les réponses avant les trajets, et ne répète pas les actions de la fiche', () => {
    // L'impression est sur `/enfant/:id`, le fichier d'agenda sur `/agenda` et la copie
    // du lien sur `/reglages` : aucune de ces actions n'a sa place ici.
    monter({ adresse: HOVELANGE, enfants: [enfant('a', 'Léa')] }, 'a')
    allerA(fr.assistant.titreRecapitulatif.replace('{prenom}', 'Léa'))

    expect(screen.getByText(fr.recapitulatif.reponses)).toBeDefined()
    // Le déjeuner n'est récapitulé que les jours où il y a cours l'après-midi.
    expect(screen.getAllByText(fr.midi.maisonCourt).length).toBe(JOURS_MIDI.length)
    expect(
      screen.queryByRole('button', { name: fr.calendrier.icsEnfant.replace('{prenom}', 'Léa') }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: fr.partage.copier })).toBeNull()
    expect(screen.queryByRole('button', { name: fr.impression.bouton })).toBeNull()
    expect(screen.getByRole('button', { name: fr.assistant.terminer })).toBeDefined()
  })

  it('dit ce qui manque au lieu de griser un bouton sans explication', () => {
    monter({ adresse: HOVELANGE, enfants: [enfant('a', '')] }, 'a')
    expect(screen.getByText(fr.assistant.obstaclePrenom)).toBeDefined()
    expect(screen.getByRole('button', { name: fr.onboarding.suivant })).toHaveProperty(
      'disabled',
      true,
    )
  })
})
