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
  // Laissés hors du paquet, et installés dans l'image d'exécution par `npm ci` :
  //  — `postgres` charge des modules par chemin calculé ;
  //  — `@node-rs/argon2` charge un binaire natif `.node` propre à la plateforme, qu'un
  //    paquet ne peut pas embarquer ;
  //  — `nodemailer` résout des transports par nom à l'exécution.
  // Les empaqueter les ferait manquer en silence, à l'exécution seulement.
  external: ['postgres', '@node-rs/argon2', 'nodemailer'],
  logLevel: 'info',
})
