/**
 * Garde-fous de la feuille papier.
 *
 * La mise en page d'impression est le seul écran que ni les tests de composant ni le
 * navigateur automatisé ne voient : `@media print` ne s'applique nulle part ailleurs
 * que sur du papier. Deux défauts y ont vécu longtemps sans que rien ne les signale —
 * un conteneur oublié dans la liste des éléments masqués, et deux lignes d'en-tête
 * collées faute de `display: block`.
 *
 * On ne peut pas mesurer une page ici. On peut au moins vérifier que les règles qui
 * l'ont cassée sont toujours là.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Sous jsdom, `import.meta.url` est une URL http servie par Vite, pas un fichier :
// on lit depuis la racine du projet, où Vitest se place.
const css = readFileSync('src/index.css', 'utf8')

/** Le contenu du bloc `@media print`, accolades équilibrées. */
const blocImpression = (() => {
  const debut = css.indexOf('@media print')
  const ouvrante = css.indexOf('{', debut) + 1
  let profondeur = 1
  let i = ouvrante
  while (profondeur > 0 && i < css.length) {
    if (css[i] === '{') profondeur++
    else if (css[i] === '}') profondeur--
    i++
  }
  return css.slice(ouvrante, i - 1)
})()

/** Les propriétés déclarées pour un sélecteur donné, dans le bloc d'impression. */
function regle(selecteur: string): string {
  const motif = new RegExp(`(^|[,{}])\\s*${selecteur.replace('.', '\\.')}\\s*[,{]`, 'm')
  const trouve = motif.exec(blocImpression)
  if (!trouve) return ''
  const ouvrante = blocImpression.indexOf('{', trouve.index + trouve[0].length - 1)
  return blocImpression.slice(ouvrante + 1, blocImpression.indexOf('}', ouvrante))
}

describe('mise en page papier', () => {
  it('masque tout ce qui n’est pas la fiche', () => {
    // `.bandeaux` au pluriel manquait : le bandeau des perturbations s'imprimait en
    // tête de feuille et poussait la semaine sur une deuxième page. Une annulation
    // valable deux jours n'a rien à faire sur une feuille qu'on garde sur le frigo.
    for (const classe of ['.entete', '.pied', '.bandeau', '.bandeaux', '.nav-basse']) {
      expect(blocImpression, `${classe} doit être masqué à l'impression`).toMatch(
        new RegExp(`\\${classe}[,\\s]`),
      )
    }
  })

  it('sépare les lignes de détail sous un nom d’enfant', () => {
    // Sans `display: block`, deux `fiche__ligne` consécutives se suivaient sur la même
    // ligne : « École primaire de BeckerichElvange · Schoul », qui se lit comme un nom
    // de lieu inventé.
    expect(regle('.fiche__ligne')).toMatch(/display:\s*block/)
  })

  it('garde la destination sur la ligne des heures', () => {
    // L'inverse du précédent : c'est en la passant à la ligne que la feuille était
    // passée à 285 mm pour 273 disponibles.
    expect(regle('.fiche__destination')).toMatch(/display:\s*inline/)
  })

  it('tient le format A4 et une marge', () => {
    expect(blocImpression).toMatch(/size:\s*A4/)
    expect(blocImpression).toMatch(/margin:\s*\d+mm/)
  })
})
