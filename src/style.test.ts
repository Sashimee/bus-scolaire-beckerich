/**
 * La règle de style du dépôt, mise sous test.
 *
 * `CLAUDE.md` et l'en-tête d'`index.css` la posent depuis toujours : aucune valeur de
 * couleur en dehors de la couche `tokens`, aucun `style={{…}}` dans un composant. Elle
 * n'était gardée par rien — ni oxlint (deux règles React), ni la CI (qui ne lance même
 * pas le lint). Elle a tenu par relecture, ce qui suffit tant que personne ne refond la
 * palette ; le jour où on la refond, une seule couleur oubliée dans `composants` fige
 * l'ancienne charte à un endroit et on la cherche à l'œil, écran par écran.
 *
 * Deux exceptions, toutes deux dans `@layer impression` : elle REDÉCLARE les jetons en
 * noir sur blanc pour le papier, et pose quelques valeurs directement sur des
 * sélecteurs. C'est assumé et documenté sur place.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

function bornes(couche: string): [number, number] {
  const debut = css.indexOf(`@layer ${couche} {`)
  expect(debut, `couche introuvable : ${couche}`).toBeGreaterThan(-1)
  const suivante = css.indexOf('\n@layer ', debut + 1)
  return [debut, suivante === -1 ? css.length : suivante]
}

/** Tous les fichiers de `src` dont le nom finit par l'une des extensions données. */
function fichiers(racine: string, extensions: readonly string[]): string[] {
  const trouves: string[] = []
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree)
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin, extensions))
    else if (extensions.some((e) => entree.endsWith(e))) trouves.push(chemin)
  }
  return trouves
}

describe('la charte tient en un seul endroit', () => {
  it("aucune couleur brute hors des couches `tokens` et `impression`", () => {
    const [debutJetons, finJetons] = bornes('tokens')
    const [debutImpression] = bornes('impression')

    const fautes: string[] = []
    let position = 0
    for (const ligne of css.split('\n')) {
      const dedans = position >= debutJetons && position < finJetons
      const papier = position >= debutImpression
      position += ligne.length + 1
      if (dedans || papier) continue
      if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|color-mix\(in [a-z]+, #/.test(ligne)) {
        fautes.push(ligne.trim())
      }
    }
    expect(fautes, 'à déplacer dans la couche `tokens`').toEqual([])
  })

  it("aucun jeton employé n'est absent de la couche `tokens`", () => {
    const [debut, fin] = bornes('tokens')
    const declares = new Set(
      [...css.slice(debut, fin).matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]),
    )
    const employes = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
    const orphelins = [...employes].filter((j) => !declares.has(j))
    expect(orphelins, 'jetons employés mais jamais déclarés').toEqual([])
  })

  it("aucun composant ne porte de `style={{…}}`", () => {
    const fautifs = fichiers('src', ['.tsx']).filter((f) =>
      readFileSync(f, 'utf8').includes('style={{'),
    )
    expect(fautifs, 'un composant ne porte que des classes').toEqual([])
  })

  /*
   * La couleur de barre système et celle du manifeste sont hors CSS : elles ne peuvent
   * pas lire un jeton. Elles doivent donc être recopiées à la main, et c'est exactement
   * ce qu'on oublie — c'est ce qui était arrivé aux icônes lors de la refonte
   * précédente. Ce test les rattache aux jetons.
   */
  it('la couleur de barre système suit `--fond`', () => {
    const [debut, fin] = bornes('tokens')
    const jetons = css.slice(debut, fin)
    const sombre = /:root \{[\s\S]*?--fond: (#[0-9a-f]{6});/.exec(jetons)?.[1]
    const clair = /data-theme='clair'\]? \{[\s\S]*?--fond: (#[0-9a-f]{6});/.exec(jetons)?.[1]
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain(`content="${sombre}" media="(prefers-color-scheme: dark)"`)
    expect(html).toContain(`content="${clair}" media="(prefers-color-scheme: light)"`)
  })
})
