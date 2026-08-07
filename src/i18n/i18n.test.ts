import { describe, expect, it } from 'vitest'
import fr from './fr.json'
import de from './de.json'
import lb from './lb.json'
import pt from './pt.json'
import en from './en.json'

const AUTRES = { de, lb, pt, en } as Record<string, unknown>

/** Aplatit un dictionnaire en chemins pointés, en notant le type de chaque feuille. */
function chemins(objet: unknown, prefixe = ''): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof objet !== 'object' || objet === null) return out
  for (const [cle, valeur] of Object.entries(objet)) {
    // Les clés de commentaire ne sont pas destinées à l'affichage.
    if (cle.startsWith('$')) continue
    const chemin = prefixe ? `${prefixe}.${cle}` : cle
    if (Array.isArray(valeur)) out.set(chemin, `liste:${valeur.length}`)
    else if (typeof valeur === 'object' && valeur !== null) {
      for (const [k, v] of chemins(valeur, chemin)) out.set(k, v)
    } else out.set(chemin, typeof valeur)
  }
  return out
}

const reference = chemins(fr)

describe('dictionnaires de traduction', () => {
  it('le français sert de référence et est complet', () => {
    expect(reference.size).toBeGreaterThan(150)
  })

  for (const [langue, dico] of Object.entries(AUTRES)) {
    describe(langue, () => {
      const traduits = chemins(dico)

      it("ne laisse aucune clé sans traduction", () => {
        const manquantes = [...reference.keys()].filter((c) => !traduits.has(c))
        expect(manquantes, `clés absentes de ${langue}.json`).toEqual([])
      })

      it("n'invente pas de clé absente du français", () => {
        const superflues = [...traduits.keys()].filter((c) => !reference.has(c))
        expect(superflues, `clés en trop dans ${langue}.json`).toEqual([])
      })

      it('respecte le type et la longueur des listes', () => {
        // Une procédure d'installation amputée d'une étape serait invisible à la
        // lecture du code mais bien réelle pour le parent qui la suit.
        const divergents = [...reference.entries()]
          .filter(([c, t]) => traduits.has(c) && traduits.get(c) !== t)
          .map(([c, t]) => `${c} : attendu ${t}, trouvé ${traduits.get(c)}`)
        expect(divergents).toEqual([])
      })

      it('ne laisse aucune chaîne vide', () => {
        const vides = [...Object.entries(chemins(dico))]
        expect(vides.filter(([, v]) => v === '')).toEqual([])
      })
    })
  }

  it('conserve les mêmes marqueurs de substitution dans toutes les langues', () => {
    // Un {prenom} oublié en traduction afficherait une phrase amputée.
    const marqueurs = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    const plat = (o: unknown, p = ''): [string, string][] => {
      if (typeof o !== 'object' || o === null) return []
      return Object.entries(o).flatMap(([k, v]) => {
        if (k.startsWith('$')) return []
        const c = p ? `${p}.${k}` : k
        if (typeof v === 'string') return [[c, v] as [string, string]]
        return plat(v, c)
      })
    }
    const refs = new Map(plat(fr).map(([c, v]) => [c, marqueurs(v)]))

    for (const [langue, dico] of Object.entries(AUTRES)) {
      for (const [chemin, texte] of plat(dico)) {
        const attendu = refs.get(chemin)
        if (attendu === undefined) continue
        expect(marqueurs(texte), `${langue}.json → ${chemin}`).toBe(attendu)
      }
    }
  })
})
