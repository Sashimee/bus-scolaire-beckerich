#!/usr/bin/env node
/**
 * Crée un compte utilisateur, ou en gère un — l'amorce du système de comptes (lot 24).
 *
 * Le premier administrateur ne peut pas être créé depuis l'application, puisqu'il n'y a
 * encore personne pour le créer : cette CLI l'amorce. Le compte naît DÉJÀ VÉRIFIÉ —
 * l'opérateur qui lance la commande répond de l'adresse — avec un mot de passe tiré au
 * hasard, affiché UNE SEULE FOIS. Ensuite, toute personne portant la capacité `comptes`
 * crée et gère les autres depuis l'application.
 *
 *   DATABASE_URL=… node serveur/creer-utilisateur.mjs "agent@ville.lu" "Marie Weber" comptes
 *   DATABASE_URL=… node serveur/creer-utilisateur.mjs "chauffeur@ville.lu" "Jean" perturbations,horaires
 *   DATABASE_URL=… node serveur/creer-utilisateur.mjs --lister
 *   DATABASE_URL=… node serveur/creer-utilisateur.mjs --mot-de-passe "agent@ville.lu"
 *   DATABASE_URL=… node serveur/creer-utilisateur.mjs --desactiver "agent@ville.lu"
 *   DATABASE_URL=… node serveur/creer-utilisateur.mjs --activer "agent@ville.lu"
 *
 * `--mot-de-passe` est le filet de secours : réinitialiser un mot de passe sans passer
 * par le courriel, quand le relai est indisponible ou qu'une personne est verrouillée
 * dehors. Le nouveau mot de passe s'affiche une fois.
 */
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { hash } from '@node-rs/argon2'

// La liste fermée, la même que `src/comptes/capacites.ts`. Dupliquée à dessein : une
// CLI en .mjs n'importe pas un module .ts sans cérémonie, et la liste bouge rarement.
const CAPACITES = ['perturbations', 'arrets', 'horaires', 'traductions', 'credits', 'comptes']

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL manquante.')
  process.exit(1)
}

const db = postgres(process.env.DATABASE_URL, { onnotice: () => {} })
const args = process.argv.slice(2)

const normaliser = (c) => (typeof c === 'string' ? c.trim().toLowerCase() : '')
const courrielValide = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) && c.length <= 254

/** Un mot de passe fort et lisible : 18 caractères base64url, sans ambiguïté d'alphabet. */
const tirerMotDePasse = () => randomBytes(14).toString('base64url')

const hacher = (mdp) => hash(mdp, { algorithm: 2 /* Argon2id */ })

try {
  if (args[0] === '--lister') {
    const lignes = await db`
      select courriel, nom, capacites, service, courriel_verifie, desactive, cree_le, dernier_acces
      from utilisateur order by cree_le
    `
    console.log(`\n  ${lignes.length} compte(s)\n`)
    for (const l of lignes) {
      const etat = l.desactive ? 'désactivé' : l.courriel_verifie ? 'actif' : 'à activer'
      const vu = l.dernier_acces ? l.dernier_acces.toISOString().slice(0, 10) : 'jamais'
      console.log(
        `    ${l.courriel} — ${l.nom}${l.service ? ` (${l.service})` : ''}\n` +
          `      [${(l.capacites ?? []).join(', ') || 'aucune capacité'}] · ${etat} · dernier accès ${vu}`,
      )
    }
    console.log()
  } else if (args[0] === '--desactiver' || args[0] === '--activer') {
    const courriel = normaliser(args[1])
    const desactive = args[0] === '--desactiver'
    const r = await db`update utilisateur set desactive = ${desactive} where courriel = ${courriel}`
    console.log(r.count ? `Compte ${desactive ? 'désactivé' : 'réactivé'} : ${courriel}` : 'Aucun compte de ce courriel.')
  } else if (args[0] === '--mot-de-passe') {
    const courriel = normaliser(args[1])
    const exist = await db`select 1 from utilisateur where courriel = ${courriel}`
    if (!exist.length) {
      console.error('Aucun compte de ce courriel.')
      process.exit(1)
    }
    const mdp = tirerMotDePasse()
    await db`update utilisateur set mot_de_passe_hash = ${await hacher(mdp)}, courriel_verifie = true where courriel = ${courriel}`
    console.log(`\n  Mot de passe réinitialisé : ${courriel}\n\n      Nouveau mot de passe :  ${mdp}\n\n  À transmettre par un canal séparé. Il ne sera plus affiché.\n`)
  } else {
    const courriel = normaliser(args[0])
    const nom = args[1]
    const capacites = (args[2] ?? 'comptes')
      .split(/[,\s]+/)
      .map((c) => c.trim())
      .filter(Boolean)
    const inconnues = capacites.filter((c) => !CAPACITES.includes(c))

    if (!courrielValide(courriel) || !nom || inconnues.length) {
      if (inconnues.length) console.error(`Capacité(s) inconnue(s) : ${inconnues.join(', ')}`)
      console.error('Usage : creer-utilisateur.mjs "courriel" "Nom Prénom" [capacités séparées par virgules]')
      console.error(`Capacités : ${CAPACITES.join(', ')}`)
      process.exit(1)
    }

    const mdp = tirerMotDePasse()
    const r = await db`
      insert into utilisateur (courriel, mot_de_passe_hash, nom, capacites, courriel_verifie)
      values (${courriel}, ${await hacher(mdp)}, ${nom}, ${db.json(capacites)}, true)
      on conflict (courriel) do nothing
    `
    if (!r.count) {
      console.error(`Un compte existe déjà pour ${courriel}. Pour son mot de passe : --mot-de-passe "${courriel}"`)
      process.exit(1)
    }

    console.log(`
  Compte créé (déjà vérifié) : ${nom} — ${courriel}
      Capacités :  ${capacites.join(', ')}

      Mot de passe :  ${mdp}

  À transmettre par un canal séparé, jamais par le même courriel que le lien de
  connexion. Il ne sera plus jamais affiché. La personne le changera après connexion.
`)
  }
} finally {
  await db.end()
}
