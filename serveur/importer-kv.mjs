#!/usr/bin/env node
/**
 * Importe l'export du clé-valeur dans PostgreSQL.
 *
 * Répartit les huit préfixes de clés dans les cinq tables. Ce qui était éphémère et
 * l'est resté — états OAuth de dix minutes, verrous d'essai d'une minute, compteurs
 * de tentatives — n'est **délibérément pas repris** : ces valeurs auront expiré avant
 * la fin de la bascule, et les reprendre ne ferait que transporter du bruit.
 *
 *   node serveur/importer-kv.mjs /tmp/kv.json
 *
 * Idempotent : relancer l'import ne crée pas de doublon. À rejouer une fois à blanc
 * sur la préproduction avant de le jouer pour de bon (réserve R39).
 */
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

const fichier = process.argv[2]
if (!fichier) {
  console.error('Usage : node serveur/importer-kv.mjs <export.json>')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL manquante.')
  process.exit(1)
}

const { entrees } = JSON.parse(await readFile(fichier, 'utf8'))
const db = postgres(process.env.DATABASE_URL, { onnotice: () => {} })

const lireJson = (texte) => {
  try {
    return JSON.parse(texte)
  } catch {
    return null
  }
}

const compte = { abonnement: 0, agent: 0, traducteur: 0, journal: 0, rappel: 0, ignore: 0, illisible: 0 }

for (const { cle, valeur } of entrees) {
  const separateur = cle.indexOf(':')
  const prefixe = separateur === -1 ? '' : cle.slice(0, separateur)
  const reste = cle.slice(separateur + 1)

  // Les éphémères de courte vie ne se reprennent pas : voir l'en-tête.
  if (prefixe === 'oauth' || prefixe === 'essai' || prefixe === 'debit') {
    compte.ignore++
    continue
  }

  const donnees = lireJson(valeur)
  if (donnees === null && prefixe !== 'rappel') {
    console.error(`  illisible, ignorée : ${cle}`)
    compte.illisible++
    continue
  }

  try {
    if (prefixe === 'abonnement') {
      // Le clé-valeur rangeait l'abonnement complet ; `endpoint` et `keys` en sont
      // extraits, la préférence retombe sur le défaut si elle manque — c'était déjà
      // la règle à la lecture.
      if (!donnees?.endpoint) throw new Error('endpoint manquant')
      await db`
        insert into abonnement (endpoint_hash, endpoint, cles, preference)
        values (${reste}, ${donnees.endpoint}, ${db.json(donnees.keys ?? {})},
                ${donnees.preference ?? 'urgences-rappels'})
        on conflict (endpoint_hash) do update
          set endpoint = excluded.endpoint, cles = excluded.cles,
              preference = excluded.preference
      `
      compte.abonnement++
    } else if (prefixe === 'agent' || prefixe === 'traducteur') {
      // Les espaces à code personnel ont été retirés : ces codes n'authentifient plus
      // rien (leurs tables sont supprimées par la migration 004). On les compte pour le
      // rapport, mais on ne les reprend pas — il faut recréer chaque agent en COMPTE à
      // capacités (`creer-utilisateur.mjs`).
      console.error(`  code d'agent retiré, non repris : ${cle} (${donnees.nom ?? '?'})`)
      compte[prefixe]++
    } else if (prefixe === 'journal') {
      // Le journal était clé par horodatage : on le reprend tel quel plutôt que de
      // lui donner la date d'import, qui écraserait toute la chronologie.
      await db`
        insert into journal (quand, qui, service, action, detail)
        values (${donnees.quand ? new Date(donnees.quand) : new Date()},
                ${donnees.qui ?? '?'}, ${donnees.service ?? ''},
                ${donnees.action ?? 'inconnue'}, ${donnees.detail ?? ''})
      `
      compte.journal++
    } else if (prefixe === 'rappel') {
      // Les états de rappel comptent : sans eux, une alerte en cours repartirait
      // depuis le premier créneau et les parents seraient re-notifiés.
      await db`
        insert into ephemere (cle, valeur, expire_le)
        values (${cle}, ${db.json(donnees ?? {})}, now() + interval '30 days')
        on conflict (cle) do update set valeur = excluded.valeur
      `
      compte.rappel++
    } else {
      console.error(`  préfixe inconnu, ignorée : ${cle}`)
      compte.ignore++
    }
  } catch (e) {
    console.error(`  échec sur ${cle} : ${e.message}`)
    compte.illisible++
  }
}

await db.end()

console.log(`
  Import terminé.

    abonnements ....... ${compte.abonnement}
    codes retirés ..... ${compte.agent + compte.traducteur}   (agents commune + traduction : à RECRÉER en comptes)
    journal ........... ${compte.journal}
    états de rappel ... ${compte.rappel}
    non repris ........ ${compte.ignore}   (états OAuth, essais, compteurs de débit)
    en échec .......... ${compte.illisible}

  Les codes d'agent ne sont PAS repris : les espaces à code personnel ont été retirés.
  Recréer chaque agent en COMPTE à capacités avec creer-utilisateur.mjs, puis vérifier
  la reprise des ABONNÉS (réserve R39) en s'assurant qu'un envoi d'essai les atteint.
  Compter les lignes ne suffit pas.
`)
if (compte.illisible) process.exitCode = 1
