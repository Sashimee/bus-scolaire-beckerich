import { describe, expect, it } from 'vitest'
import { ADRESSE_CONTACT, lienContact } from './contact'
import { LANGUES } from '../i18n/langues'

describe('lienContact', () => {
  it('met le français à la racine et les autres langues sous leur segment', () => {
    expect(lienContact('fr')).toBe('https://www.schoulbus.lu/contact/')
    expect(lienContact('de')).toBe('https://www.schoulbus.lu/de/contact/')
    expect(lienContact('lb')).toBe('https://www.schoulbus.lu/lb/contact/')
    expect(lienContact('pt')).toBe('https://www.schoulbus.lu/pt/contact/')
    expect(lienContact('en')).toBe('https://www.schoulbus.lu/en/contact/')
  })

  it('donne une adresse à chaque langue de l’application', () => {
    for (const langue of LANGUES) {
      expect(lienContact(langue)).toMatch(/^https:\/\/www\.schoulbus\.lu\/[a-z/]*contact\/$/)
    }
  })
})

describe('ADRESSE_CONTACT', () => {
  it('est sur le domaine de la vitrine', () => {
    expect(ADRESSE_CONTACT.endsWith('@schoulbus.lu')).toBe(true)
  })
})
