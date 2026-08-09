/**
 * Ce que le runtime Cloudflare refuse, et que les tests ne peuvent pas voir.
 *
 * Les tests du Worker remplacent `fetch` par une fonction qui ignore ses options : une
 * option inexistante côté Workers y passe donc inaperçue. C'est ainsi que
 * `cache: 'no-store'` — parfaitement valable dans un navigateur — a vécu dans
 * `github.js` depuis le lot 8, faisant échouer TOUTE publication dès sa première
 * lecture avec « The 'cache' field on 'RequestInitializerDict' is not implemented ».
 *
 * On ne peut pas exécuter le runtime ici. On peut relire le code source.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

// `npm test` tourne à la racine du dépôt, `npm test` dans `worker/` tourne ici : le
// chemin doit valoir dans les deux cas, sinon la garde ne s'exécute qu'à moitié.
const racine = existsSync('worker/src') ? 'worker/src' : 'src'

const sources = readdirSync(racine)
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
  .map((f) => ({ nom: f, texte: readFileSync(`${racine}/${f}`, 'utf8') }))

describe('options de fetch acceptées par le runtime Workers', () => {
  it('lit bien les sources du Worker', () => {
    expect(sources.map((s) => s.nom)).toContain('github.js')
    expect(sources.map((s) => s.nom)).toContain('index.js')
  })

  for (const { nom, texte } of sources) {
    it(`${nom} n'utilise pas l'option \`cache\``, () => {
      // `cf: { cacheTtl }` est l'équivalent côté Workers. Le repérage ignore les
      // commentaires, qui parlent justement de cette interdiction.
      const code = texte
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n')
      expect(code).not.toMatch(/\bcache:\s*['"]/)
    })
  }
})
