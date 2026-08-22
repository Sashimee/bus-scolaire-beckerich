import { defineConfig } from 'vitest/config'

/**
 * Les migrations sont importées comme du texte. esbuild le fait par son `loader`
 * (voir `construire.mjs`) ; Vite, qui sert les tests, a besoin qu'on le lui dise
 * aussi — sinon il tente de lire le SQL comme du JavaScript.
 */
const sqlEnTexte = {
  name: 'sql-en-texte',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.endsWith('.sql')) return null
    return { code: `export default ${JSON.stringify(code)}`, map: null }
  },
}

export default defineConfig({
  plugins: [sqlEnTexte],
  test: {
    environment: 'node',
    // Les tests de stockage exigent une base ; ils se sautent d'eux-mêmes sans
    // `DATABASE_URL`. Voir `src/stockage/*.test.ts`.
    include: ['src/**/*.test.{ts,js}'],
  },
})
