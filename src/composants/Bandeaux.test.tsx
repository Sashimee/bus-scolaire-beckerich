/**
 * L'ordre des bandeaux bloquants au premier lancement.
 *
 * Ce qui se joue ici n'est pas cosmétique : l'avertissement d'indépendance est le texte
 * le plus important du site, et il ne vaut que s'il est lu. Servi dans une langue que
 * le parent ne parle pas, il n'est pas lu — il est cliqué. La langue passe donc avant,
 * et rien ne doit pouvoir remettre ces deux marches dans l'autre sens.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PileBandeaux } from './Bandeaux'
import { FournisseurFoyer } from '../etat'
import { FournisseurTraduction } from '../i18n'
import { FournisseurUrgences } from '../urgences-contexte'
import { FournisseurRechargement } from '../rechargement-contexte'
import fr from '../i18n/fr.json'
import pt from '../i18n/pt.json'

// Le fournisseur déduit la langue du navigateur, qui répond « en » sous jsdom.
Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true })

/*
 * `localStorage` n'existe pas sous jsdom ici, et c'est justement lui qui distingue une
 * première visite d'une visite suivante : sans stockage, tout test se déroulerait en
 * première visite et le cas « la question ne se repose pas » ne serait jamais éprouvé.
 * Un stockage en mémoire suffit, et laisse `src/lib/stockage.ts` s'exercer pour de vrai.
 */
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

const CLE_LANGUE = 'bus-beckerich.langue'

const monter = () =>
  render(
    <MemoryRouter>
      <FournisseurTraduction>
        <FournisseurRechargement>
          <FournisseurUrgences>
            <FournisseurFoyer>
              <PileBandeaux />
            </FournisseurFoyer>
          </FournisseurUrgences>
        </FournisseurRechargement>
      </FournisseurTraduction>
    </MemoryRouter>,
  )

const langues = () => screen.queryByRole('group', { name: fr.choixLangue.titre })
const avertissement = (dico: typeof fr | typeof pt = fr) =>
  screen.queryByRole('group', { name: dico.avertissement.titre })

describe('bandeaux bloquants du premier lancement', () => {
  beforeEach(() => localStorage.clear())

  it('demande la langue, et rien d’autre, au tout premier lancement', () => {
    monter()
    expect(langues()).not.toBeNull()
    expect(avertissement()).toBeNull()
  })

  it('propose les cinq langues, chacune écrite dans sa propre langue', () => {
    // Le parent qui ne lit pas la question doit pouvoir reconnaître sa langue.
    monter()
    const noms = screen.getAllByRole('button').map((b) => b.textContent)
    expect(noms).toEqual(['Français', 'Deutsch', 'Lëtzebuergesch', 'Português', 'English'])
  })

  it('signale la langue devinée sans la retenir pour autant', () => {
    monter()
    expect(screen.getByRole('button', { name: 'Français' }).className).toContain('choix--retenu')
    expect(localStorage.getItem(CLE_LANGUE)).toBeNull()
  })

  it('passe à l’avertissement une fois la langue choisie, et dans cette langue', () => {
    monter()
    act(() => screen.getByRole('button', { name: 'Português' }).click())
    expect(langues()).toBeNull()
    expect(avertissement(pt)).not.toBeNull()
    expect(localStorage.getItem(CLE_LANGUE)).toBe('"pt"')
  })

  it('ne repose pas la question à la visite suivante', () => {
    localStorage.setItem(CLE_LANGUE, '"de"')
    monter()
    expect(langues()).toBeNull()
    expect(screen.queryByRole('group', { name: 'Bevor Sie beginnen' })).not.toBeNull()
  })

  it('n’interroge pas un habitué qui a déjà passé le premier lancement', () => {
    // Une langue jamais choisie explicitement, mais un avertissement déjà accepté :
    // c'est quelqu'un qui utilise l'application depuis un moment. La question d'accueil
    // le renverrait à une case départ qu'il a franchie.
    localStorage.setItem('bus-beckerich.avertissement-accepte', 'true')
    monter()
    expect(langues()).toBeNull()
    expect(avertissement()).toBeNull()
  })

  it('repose la question si la langue enregistrée n’existe pas', () => {
    // Un dictionnaire retiré, ou un stockage bricolé : mieux vaut redemander que servir
    // un avertissement dans une langue de repli qui n'a jamais été choisie.
    localStorage.setItem(CLE_LANGUE, '"kl"')
    monter()
    expect(langues()).not.toBeNull()
  })
})
