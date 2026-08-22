#!/usr/bin/env node
/**
 * Crée un code d'accès, pour l'espace commune ou pour l'espace traduction.
 *
 * Le code est engendré ici, affiché UNE SEULE FOIS, et seule son empreinte SHA-256
 * part en base. Personne — pas même le mainteneur — ne peut le retrouver ensuite : en
 * cas de perte, on en crée un nouveau et on retire l'ancien.
 *
 *   DATABASE_URL=… node serveur/creer-agent.mjs "Marie Weber" "service technique"
 *   DATABASE_URL=… node serveur/creer-agent.mjs "Jean Muller" "bénévole" traductions
 *   DATABASE_URL=… node serveur/creer-agent.mjs --lister
 *   DATABASE_URL=… node serveur/creer-agent.mjs --retirer <empreinte> [role]
 *
 * Le rôle choisit la TABLE, et c'est ce qui sépare vraiment les deux espaces : un
 * code de traduction n'existe pas dans `agent_commune`, donc la connexion à l'espace
 * commune ne peut pas le trouver, et réciproquement.
 *
 * Remplace `worker/creer-agent.sh`, qui passait par `wrangler kv key put`. Écrit en
 * Node plutôt qu'en shell parce qu'il fallait déjà appeler Python pour échapper le
 * JSON — trois langages pour créer un code, c'en était deux de trop.
 */
import { randomInt, createHash } from 'node:crypto'
import postgres from 'postgres'

const TABLES = { commune: 'agent_commune', traductions: 'agent_traduction' }

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL manquante.')
  process.exit(1)
}

const db = postgres(process.env.DATABASE_URL, { onnotice: () => {} })
const args = process.argv.slice(2)

const empreinte = (texte) => createHash('sha256').update(texte).digest('hex')

/**
 * Format `xxxx-xxxx` en base 32 sans caractères ambigus : ni 0/O, ni 1/l/I. Un code
 * se dicte au téléphone, et « zéro ou O ? » est exactement la question qu'on veut
 * éviter.
 *
 * `randomInt` et non `Math.random()` : le shell d'origine utilisait `$RANDOM`, dont
 * la graine est prévisible. Sur huit caractères, ce n'est pas un détail.
 */
function tirerCode() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'
  const bloc = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('')
  return `${bloc()}-${bloc()}`
}

try {
  if (args[0] === '--lister') {
    for (const [role, table] of Object.entries(TABLES)) {
      const lignes = await db`
        select nom, service, cree_le, dernier_acces, code_hash
        from ${db(table)} order by cree_le
      `
      console.log(`\n  Espace ${role} — ${lignes.length} accès`)
      for (const l of lignes) {
        const vu = l.dernier_acces ? l.dernier_acces.toISOString().slice(0, 10) : 'jamais'
        console.log(
          `    ${l.nom}${l.service ? ` (${l.service})` : ''} · créé ${l.cree_le
            .toISOString()
            .slice(0, 10)} · dernier accès ${vu}\n      ${l.code_hash}`,
        )
      }
    }
    console.log()
  } else if (args[0] === '--retirer') {
    const hash = args[1]
    const role = args[2] ?? 'commune'
    if (!hash || !TABLES[role]) {
      console.error('Usage : --retirer <empreinte> [commune|traductions]')
      process.exit(1)
    }
    const efface = await db`delete from ${db(TABLES[role])} where code_hash = ${hash}`
    console.log(efface.count ? `Accès retiré (${role}).` : 'Aucune empreinte de ce nom.')
  } else {
    const nom = args[0]
    const service = args[1] ?? ''
    const role = args[2] ?? 'commune'
    if (!nom || !TABLES[role]) {
      console.error('Usage : creer-agent.mjs "Nom Prénom" ["service"] [commune|traductions]')
      process.exit(1)
    }

    const code = tirerCode()
    // L'empreinte porte sur la forme NORMALISÉE, celle que le serveur recompose à la
    // connexion : minuscules, sans espaces autour. Une empreinte calculée sur autre
    // chose produirait un code qui n'ouvre rien, sans que rien ne le dise.
    const hash = empreinte(code.trim().toLowerCase())

    await db`
      insert into ${db(TABLES[role])} (code_hash, nom, service)
      values (${hash}, ${nom}, ${service})
    `

    console.log(`
  Accès créé : ${nom}${service ? ` (${service})` : ''} — espace ${role}

      Code d'accès :  ${code}

  Transmettez-le de vive voix ou par un canal séparé, jamais par le même courriel
  que le lien. Il ne sera plus jamais affiché.

  Pour retirer cet accès :
      node serveur/creer-agent.mjs --retirer ${hash} ${role}
`)
  }
} finally {
  await db.end()
}
