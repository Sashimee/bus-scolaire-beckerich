#!/usr/bin/env node
/**
 * Exporte tout l'espace clé-valeur Cloudflare vers un fichier JSON.
 *
 * **C'est la moitié de l'étape la plus facile à oublier de toute la bascule.** Sans
 * elle, le jour du passage : tous les codes d'agents communaux sont invalidés, et
 * tous les parents abonnés aux notifications sont désabonnés sans le savoir. Rien ne
 * le signalerait — l'espace commune répondrait simplement « code inconnu », et les
 * notifications ne partiraient plus.
 *
 *   node serveur/exporter-kv.mjs > /tmp/kv.json
 *
 * Exige `wrangler` et une session Cloudflare active (`npx wrangler login`), depuis un
 * dossier où `wrangler.toml` déclare le lien `ABONNEMENTS`.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const executer = promisify(execFile)

const LIEN = 'ABONNEMENTS'
/** Wrangler n'accepte pas des milliers de clés d'un coup. */
const TAILLE_PAQUET = 100

async function wrangler(...args) {
  // `maxBuffer` relevé : la liste complète des abonnements dépasse le défaut de 1 Mo
  // dès quelques centaines d'inscrits, et l'échec se présente comme un plantage nu.
  const { stdout } = await executer('npx', ['wrangler', ...args], {
    maxBuffer: 64 * 1024 * 1024,
    cwd: process.env.DOSSIER_WRANGLER ?? 'worker',
  })
  return stdout
}

const cles = JSON.parse(await wrangler('kv', 'key', 'list', '--binding', LIEN, '--remote'))
process.stderr.write(`${cles.length} clé(s) à exporter\n`)

const entrees = []
for (let i = 0; i < cles.length; i += TAILLE_PAQUET) {
  const paquet = cles.slice(i, i + TAILLE_PAQUET)
  for (const { name } of paquet) {
    const valeur = await wrangler('kv', 'key', 'get', '--binding', LIEN, '--remote', name)
    entrees.push({ cle: name, valeur })
  }
  process.stderr.write(`  ${Math.min(i + TAILLE_PAQUET, cles.length)}/${cles.length}\n`)
}

process.stdout.write(JSON.stringify({ exporteLe: new Date().toISOString(), entrees }, null, 2))
process.stderr.write(`\nExport terminé : ${entrees.length} entrée(s).\n`)
