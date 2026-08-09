import { describe, expect, it } from 'vitest'
import { appliquerModifications, motifRefus, relireSurcouche } from './traductions'
import fr from '../i18n/fr.json'

describe('ce qu’une correction de traduction a le droit de recouvrir', () => {
  it('accepte un texte qui remplace un texte existant', () => {
    expect(motifRefus('de', 'assistant.terminer', 'Fertig')).toBeNull()
  })

  it('refuse une langue inconnue', () => {
    expect(motifRefus('es', 'assistant.terminer', 'Hecho')).toBe('langue-inconnue')
  })

  it('refuse une clé qui n’existe pas en français', () => {
    // On corrige des textes, on n'en invente pas : une clé inconnue ne serait affichée
    // nulle part, et ouvrirait la porte à un fichier qui gonfle sans fin.
    expect(motifRefus('de', 'assistant.inexistant', 'Fertig')).toBe('cle-inconnue')
  })

  it('refuse un nœud intermédiaire, qui n’est pas un texte', () => {
    expect(motifRefus('de', 'dillendapp', 'Fertig')).toBe('cle-inconnue')
  })

  it('refuse un marqueur perdu', () => {
    // « À récupérer au Dillendapp à {heure}. » sans son {heure} afficherait une phrase
    // amputée, sans que personne ne s'en aperçoive à la relecture du code.
    expect(fr.dillendapp.recuperation).toContain('{heure}')
    expect(motifRefus('de', 'dillendapp.recuperation', 'Abzuholen.')).toBe('marqueurs')
  })

  it('refuse un marqueur inventé', () => {
    // Il s'afficherait tel quel, accolades comprises.
    expect(motifRefus('de', 'assistant.terminer', 'Fertig {jour}')).toBe('marqueurs')
  })

  it('accepte un marqueur déplacé dans la phrase', () => {
    expect(motifRefus('de', 'dillendapp.recuperation', 'Um {heure} abzuholen.')).toBeNull()
  })

  it('refuse une valeur vide', () => {
    expect(motifRefus('de', 'assistant.terminer', '   ')).toBe('vide')
  })

  it('refuse un texte démesuré', () => {
    expect(motifRefus('de', 'assistant.terminer', 'x'.repeat(401))).toBe('trop-long')
  })

  it('refuse une liste amputée d’une étape', () => {
    const reference = fr.agenda.iosEtapes
    expect(motifRefus('de', 'agenda.iosEtapes', reference.slice(1))).toBe('longueur-liste')
    expect(motifRefus('de', 'agenda.iosEtapes', reference.map((e) => e))).toBeNull()
  })

  it('refuse un type qui ne correspond pas à la référence', () => {
    expect(motifRefus('de', 'agenda.iosEtapes', 'une seule chaîne')).toBe('type-different')
    expect(motifRefus('de', 'assistant.terminer', ['une', 'liste'])).toBe('type-different')
  })
})

describe('deux traducteurs en même temps', () => {
  it('ne recouvre pas le travail publié dans une autre langue', () => {
    // A et B ouvrent la page au même moment. A publie une correction allemande, puis B
    // publie une correction portugaise. Publier la surcouche entière effaçait celle de
    // A ; en n'envoyant que ses modifications, B ne touche pas à l'allemand.
    const apresA = appliquerModifications({}, 'de', { 'assistant.terminer': 'Fertig' })
    const apresB = appliquerModifications(apresA, 'pt', { 'assistant.terminer': 'Terminado' })

    expect(apresB.de).toEqual({ 'assistant.terminer': 'Fertig' })
    expect(apresB.pt).toEqual({ 'assistant.terminer': 'Terminado' })
  })

  it('ne recouvre pas une autre clé de la même langue', () => {
    const apresA = appliquerModifications({}, 'de', { 'assistant.terminer': 'Fertig' })
    const apresB = appliquerModifications(apresA, 'de', { 'adresse.label': 'Wohnadresse' })

    expect(apresB.de).toEqual({
      'assistant.terminer': 'Fertig',
      'adresse.label': 'Wohnadresse',
    })
  })

  it('laisse le dernier trancher sur la MÊME clé', () => {
    // Là, c'est un vrai désaccord entre deux personnes, pas un accident de mécanique :
    // on ne peut pas garder les deux, et fusionner n'aurait aucun sens.
    const apresA = appliquerModifications({}, 'de', { 'assistant.terminer': 'Fertig' })
    const apresB = appliquerModifications(apresA, 'de', { 'assistant.terminer': 'Erledigt' })
    expect(apresB.de!['assistant.terminer']).toBe('Erledigt')
  })

  it('retire une correction sans toucher aux autres', () => {
    const depart = appliquerModifications({}, 'de', {
      'assistant.terminer': 'Fertig',
      'adresse.label': 'Wohnadresse',
    })
    const apres = appliquerModifications(depart, 'de', { 'assistant.terminer': null })
    expect(apres.de).toEqual({ 'adresse.label': 'Wohnadresse' })
  })

  it('efface la langue quand sa dernière correction est retirée', () => {
    // Une langue vide ne doit pas rester en creux dans le fichier publié.
    const depart = appliquerModifications({}, 'de', { 'assistant.terminer': 'Fertig' })
    expect(appliquerModifications(depart, 'de', { 'assistant.terminer': null })).toEqual({})
  })

  it('ignore une modification irrecevable sans perdre le reste', () => {
    const apres = appliquerModifications({}, 'de', {
      'assistant.terminer': 'Fertig',
      'cle.inexistante': 'ignorée',
      'dillendapp.recuperation': 'sans marqueur',
    })
    expect(apres.de).toEqual({ 'assistant.terminer': 'Fertig' })
  })
})

describe('relecture du fichier de surcouche', () => {
  it('applique les entrées valables et ignore les autres', () => {
    // Un fichier partiellement abîmé ne doit pas faire disparaître tout le travail
    // d'un traducteur — c'est la règle déjà en vigueur pour les perturbations.
    const propre = relireSurcouche({
      langues: {
        de: {
          'assistant.terminer': 'Fertig',
          'assistant.inexistant': 'Ignorée',
          'dillendapp.recuperation': 'Sans marqueur',
        },
      },
    })
    expect(propre.de).toEqual({ 'assistant.terminer': 'Fertig' })
  })

  it('ignore une langue inconnue sans rien casser', () => {
    const propre = relireSurcouche({
      langues: { es: { 'assistant.terminer': 'Hecho' }, de: { 'assistant.terminer': 'Fertig' } },
    })
    expect(Object.keys(propre)).toEqual(['de'])
  })

  it('ne rend rien d’exploitable d’un fichier absent ou corrompu', () => {
    expect(relireSurcouche(null)).toEqual({})
    expect(relireSurcouche('pas un objet')).toEqual({})
    expect(relireSurcouche({})).toEqual({})
    expect(relireSurcouche({ langues: [] })).toEqual({})
  })

  it('n’expose pas une langue dont aucune entrée n’a survécu', () => {
    expect(relireSurcouche({ langues: { de: { 'cle.absente': 'x' } } })).toEqual({})
  })
})
