/**
 * Empaquetage en un seul fichier, comme le faisait Wrangler.
 *
 * Deux raisons, et non l'habitude : le serveur importe `../src/lib/*.ts` du dépôt —
 * du TypeScript qui doit être transpilé — et `src/data/*.json` par des imports que
 * Node ne résout pas sans cérémonie. esbuild règle les deux, et l'image n'embarque
 * plus que le fichier produit.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/serveur.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  loader: { '.sql': 'text' },
  // `postgres` charge des modules natifs par chemin calculé : le laisser hors du
  // paquet évite qu'esbuild ne les manque en silence.
  external: ['postgres'],
  logLevel: 'info',
})
