/**
 * Ce que la page Plan promet sur les horaires de cours.
 *
 * Elle n'en a longtemps affiché qu'un seul jeu — celui du précoce, le seul cycle qui ne
 * prend pas le bus — présenté comme celui de toute l'école. Un parent de C2 lisait donc
 * « cours jusqu'à 11:45 » alors que sa classe s'arrête à 12:05. Ce test tient la
 * promesse inverse : chaque cycle voit ses propres heures, telles que la brochure
 * communale les publie.
 */
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import fr from '../i18n/fr.json'
import { plan } from '../lib/donnees'

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

async function afficher() {
  const { PagePlan } = await import('./Plan')
  const { FournisseurTraduction } = await import('../i18n')

  render(
    <FournisseurTraduction>
      <PagePlan />
    </FournisseurTraduction>,
  )
}

/** La ligne du tableau des horaires de cours qui porte ce cycle. */
const ligneDuCycle = (libelle: string) =>
  screen.getByRole('rowheader', { name: libelle }).closest('tr')!

describe('horaires de cours affichés cycle par cycle', () => {
  it('donne à chaque cycle les heures de son école, et non celles d’un autre', async () => {
    await afficher()

    expect(within(ligneDuCycle(fr.cycles.c2)).getByText('08:00 – 12:05')).toBeDefined()
    expect(within(ligneDuCycle(fr.cycles.c3)).getByText('08:00 – 12:10')).toBeDefined()
    expect(within(ligneDuCycle(fr.cycles.c4)).getByText('07:55 – 12:00')).toBeDefined()
    expect(within(ligneDuCycle(fr.cycles.c1)).getByText('08:00 – 11:50')).toBeDefined()
  })

  it('affiche aussi l’après-midi, dont les heures diffèrent du matin', async () => {
    await afficher()

    expect(within(ligneDuCycle(fr.cycles.c2)).getByText('14:00 – 15:55')).toBeDefined()
    expect(within(ligneDuCycle(fr.cycles.c4)).getByText('13:55 – 15:50')).toBeDefined()
  })

  it('nomme les jours de cours au lieu de les laisser deviner', async () => {
    await afficher()

    const attendu = fr.plan.horairesEcoleJours
      .replace('{matin}', plan.horairesEcole.jours.matin.map((j) => fr.jours[j]).join(' · '))
      .replace(
        '{apresMidi}',
        plan.horairesEcole.jours.apresMidi.map((j) => fr.jours[j]).join(' · '),
      )
    expect(screen.getByText(attendu)).toBeDefined()
  })
})

describe('points non tranchés par le plan officiel', () => {
  it('les affiche tous, question et hypothèse', async () => {
    await afficher()

    for (const incertitude of plan.incertitudes) {
      expect(screen.getByText(incertitude.question)).toBeDefined()
      expect(screen.getByText(incertitude.hypothese)).toBeDefined()
    }
    expect(plan.incertitudes.length).toBeGreaterThan(0)
  })
})
