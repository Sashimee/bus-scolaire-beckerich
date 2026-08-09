/**
 * Ce qu'un traducteur ne doit jamais perdre.
 *
 * Le moteur de fusion est couvert par `src/lib/traductions.test.ts`. Ici, on éprouve
 * l'écran : c'est lui qui jetait le brouillon en changeant de langue, et qui affichait
 * « commune.erreur » en toutes lettres quand une publication échouait.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { EditeurTraductions } from './EditeurTraductions'
import { FournisseurTraduction } from '../i18n'
import { FournisseurRechargement } from '../rechargement-contexte'
import { ErreurCommune } from '../lib/commune'
import fr from '../i18n/fr.json'
import de from '../i18n/de.json'
import en from '../i18n/en.json'
import type { Modifications, Surcouche } from '../lib/traductions'
import type { Langue } from '../i18n/langues'

Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })

const monter = (publier: (l: Langue, m: Modifications) => Promise<Surcouche>) =>
  render(
    <FournisseurTraduction>
      <FournisseurRechargement>
        <EditeurTraductions surcouche={{}} publier={publier} />
      </FournisseurRechargement>
    </FournisseurTraduction>,
  )

/** Poser une valeur sur un champ contrôlé par React. */
const poserValeur = (champ: HTMLElement, valeur: string) => {
  const prototype =
    champ instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : champ instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(champ, valeur)
    champ.dispatchEvent(new Event(champ instanceof HTMLSelectElement ? 'change' : 'input', {
      bubbles: true,
    }))
  })
}

/**
 * Restreint l'écran à une seule clé, puis saisit une correction.
 *
 * Le filtre n'est pas un confort de test : sans lui, l'éditeur monte les 555 champs du
 * dictionnaire et jsdom met plus d'une minute par rendu.
 */
function corriger(cle: string, texte: string) {
  poserValeur(screen.getByLabelText(fr.traductions.recherche), cle)
  const repli = document.querySelector('details')!
  act(() => {
    repli.open = true
    repli.dispatchEvent(new Event('toggle'))
  })
  const champ = document.getElementById(cle) as HTMLTextAreaElement
  poserValeur(champ, texte)
  return champ
}

const changerLangue = (code: string) =>
  poserValeur(screen.getByLabelText(fr.traductions.langue), code)

describe('ce que le champ propose', () => {
  it('part de la traduction existante, pas d’un champ vide', () => {
    // Le champ retombait sur le français, donc sur une chaîne vide : le traducteur
    // voyait un blanc et devait retaper ce qui existait déjà. Changer de langue ne
    // changeait alors rien à l'écran.
    monter(async () => ({}))
    poserValeur(screen.getByLabelText(fr.traductions.recherche), 'assistant.terminer')
    const repli = document.querySelector('details')!
    act(() => {
      repli.open = true
      repli.dispatchEvent(new Event('toggle'))
    })
    expect((document.getElementById('assistant.terminer') as HTMLTextAreaElement).value).toBe(
      de.assistant.terminer,
    )
  })

  it('montre la langue de comparaison en référence, et pas seulement le français', () => {
    monter(async () => ({}))
    poserValeur(screen.getByLabelText(fr.traductions.recherche), 'assistant.terminer')
    const repli = document.querySelector('details')!
    act(() => {
      repli.open = true
      repli.dispatchEvent(new Event('toggle'))
    })
    // Par défaut on compare au français.
    expect(screen.getByText(fr.assistant.terminer, { exact: false })).toBeDefined()

    poserValeur(screen.getByLabelText(fr.traductions.comparerA), 'en')
    expect(screen.getByText(en.assistant.terminer, { exact: false })).toBeDefined()
  })

  it('ne propose jamais de comparer une langue à elle-même', () => {
    monter(async () => ({}))
    const comparer = screen.getByLabelText(fr.traductions.comparerA) as HTMLSelectElement
    expect([...comparer.options].map((o) => o.value)).not.toContain('de')

    changerLangue('fr')
    const suite = screen.getByLabelText(fr.traductions.comparerA) as HTMLSelectElement
    expect([...suite.options].map((o) => o.value)).not.toContain('fr')
  })
})

describe('brouillon du traducteur', () => {
  it('survit à un changement de langue', () => {
    // Le sélecteur vidait le brouillon : passer à une autre langue pour vérifier une
    // tournure effaçait tout le travail en cours, sans confirmation ni message.
    monter(async () => ({}))
    corriger('assistant.terminer', 'Erledigt')

    changerLangue('pt')
    expect(screen.getAllByText(/en attente dans d'autres langues/)[0]).toBeDefined()

    changerLangue('de')
    expect((document.getElementById('assistant.terminer') as HTMLTextAreaElement).value).toBe(
      'Erledigt',
    )
  })

  it('survit à un échec de publication', async () => {
    const publier = vi.fn().mockRejectedValue(new ErreurCommune('session-expiree'))
    monter(publier)
    corriger('assistant.terminer', 'Erledigt')

    await act(async () => {
      screen.getByRole('button', { name: fr.traductions.publier }).click()
    })

    expect((document.getElementById('assistant.terminer') as HTMLTextAreaElement).value).toBe(
      'Erledigt',
    )
    expect(screen.getAllByText(fr.traductions.brouillonConserve)[0]).toBeDefined()
  })

  it('dit ce qui a échoué, en français et pas en clé de dictionnaire', () => {
    // L'écran affichait `t('commune.erreur')`, qui désigne un objet : `t` renvoyait la
    // clé elle-même, et le traducteur lisait « commune.erreur » à l'écran.
    expect(fr.commune.erreur.sessionExpiree).toBeTruthy()
  })

  it('ne publie que la langue affichée', async () => {
    const publier = vi.fn().mockResolvedValue({})
    monter(publier)
    corriger('assistant.terminer', 'Erledigt')

    await act(async () => {
      screen.getByRole('button', { name: fr.traductions.publier }).click()
    })

    expect(publier).toHaveBeenCalledWith('de', { 'assistant.terminer': 'Erledigt' })
  })
})
