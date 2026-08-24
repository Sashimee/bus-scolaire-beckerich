import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { avecBase, fermerSchema, ouvrirSchema } from './aide-tests.ts'
import type { Sql } from './client.ts'
import * as abonnements from './abonnements.ts'
import * as journal from './journal.ts'
import { balayerEphemeres, ecrireEphemere, lireEphemere, supprimerEphemere } from './ephemeres.ts'
import { debitDepasse, reussite, TENTATIVES_MAX } from './debit.ts'
import { empreinte } from '../crypto.ts'

const SCHEMA = 'essai_stockage'
let db: Sql

beforeAll(async () => {
  if (!avecBase) return
  db = await ouvrirSchema(SCHEMA)
}, 30_000)

afterAll(async () => {
  if (!avecBase || !db) return
  await fermerSchema(db, SCHEMA)
})

describe.skipIf(!avecBase)('migrations', () => {
  it('crée les tables attendues et ne rejoue pas ce qui est déjà passé', async () => {
    const tables = (
      await db`select tablename from pg_tables where schemaname = ${SCHEMA} order by tablename`
    ).map((l) => l.tablename)
    expect(tables).toEqual([
      'abonnement',
      'correction_arret',
      'debit',
      'document',
      'ephemere',
      'journal',
      'mesure',
      'migration',
      'perturbation',
      'utilisateur',
    ])
  })
})

describe.skipIf(!avecBase)('abonnements', () => {
  it('se réabonner ne crée pas de doublon', async () => {
    await abonnements.enregistrer('https://push.example/a', { p256dh: 'x' }, 'tout', db)
    await abonnements.enregistrer('https://push.example/a', { p256dh: 'y' }, 'urgences', db)
    expect(await abonnements.compter(db)).toBe(1)
    const lu = await abonnements.lireParEndpoint('https://push.example/a', db)
    expect(lu?.preference).toBe('urgences')
    expect(lu?.keys).toEqual({ p256dh: 'y' })
  })

  it('se supprime par endpoint comme par empreinte', async () => {
    await abonnements.enregistrer('https://push.example/b', {}, 'tout', db)
    await abonnements.supprimerParEndpoint('https://push.example/b', db)
    expect(await abonnements.lireParEndpoint('https://push.example/b', db)).toBeNull()

    await abonnements.enregistrer('https://push.example/c', {}, 'tout', db)
    await abonnements.supprimerParHash(await empreinte('https://push.example/c'), db)
    expect(await abonnements.lireParEndpoint('https://push.example/c', db)).toBeNull()
  })
})

/**
 * La séparation des deux espaces est la propriété de sécurité la plus facile à perdre
 * en changeant de stockage : sur le clé-valeur, elle tenait à ce qu'un code de l'un
 * n'existe LITTÉRALEMENT PAS là où l'autre le cherchait.
 */

describe.skipIf(!avecBase)('éphémères', () => {
  it('une valeur périmée ne ressort pas, même avant le balayage', async () => {
    await ecrireEphemere('essai:perime', { a: 1 }, -1, db)
    expect(await lireEphemere('essai:perime', db)).toBeNull()
    // Le balayage ne fait que récupérer la place : la lecture filtrait déjà.
    expect(await balayerEphemeres(db)).toBeGreaterThan(0)
  })

  it('relit ce qui est encore valide, et se laisse remplacer puis supprimer', async () => {
    await ecrireEphemere('oauth:x', 'https://retour.example', 600, db)
    expect(await lireEphemere('oauth:x', db)).toBe('https://retour.example')
    await ecrireEphemere('oauth:x', 'https://autre.example', 600, db)
    expect(await lireEphemere('oauth:x', db)).toBe('https://autre.example')
    await supprimerEphemere('oauth:x', db)
    expect(await lireEphemere('oauth:x', db)).toBeNull()
  })
})

/**
 * Réserve R4, levée. Sur le clé-valeur, le compteur se lisait puis se réécrivait, et
 * la cohérence différée laissait passer des tentatives supplémentaires. Le test qui
 * compte est celui des requêtes CONCURRENTES : c'est là que l'ancien mécanisme cédait.
 */
describe.skipIf(!avecBase)('limitation de débit', () => {
  it('bloque à la sixième tentative', async () => {
    const ip = '203.0.113.1'
    for (let i = 0; i < TENTATIVES_MAX; i++) {
      expect(await debitDepasse(ip, db)).toBe(false)
    }
    expect(await debitDepasse(ip, db)).toBe(true)
  })

  it('ne laisse rien passer en plus sous concurrence — c’est R4', async () => {
    const ip = '203.0.113.2'
    // Vingt tentatives lancées ensemble. Exactement cinq doivent passer.
    const resultats = await Promise.all(
      Array.from({ length: 20 }, () => debitDepasse(ip, db)),
    )
    expect(resultats.filter((bloque) => !bloque)).toHaveLength(TENTATIVES_MAX)
  })

  it('une connexion réussie remet le compteur à zéro', async () => {
    const ip = '203.0.113.3'
    for (let i = 0; i < TENTATIVES_MAX; i++) await debitDepasse(ip, db)
    expect(await debitDepasse(ip, db)).toBe(true)
    await reussite(ip, db)
    expect(await debitDepasse(ip, db)).toBe(false)
  })

  it("une fenêtre expirée rouvre, sinon une adresse bloquée le resterait à jamais", async () => {
    const ip = '203.0.113.4'
    const hash = await empreinte(ip)
    for (let i = 0; i <= TENTATIVES_MAX; i++) await debitDepasse(ip, db)
    expect(await debitDepasse(ip, db)).toBe(true)
    await db`update debit set fenetre_fin = now() - interval '1 second' where ip_hash = ${hash}`
    expect(await debitDepasse(ip, db)).toBe(false)
  })
})

describe.skipIf(!avecBase)('journal', () => {
  it('rend les entrées les plus récentes en premier', async () => {
    await journal.journaliser({ nom: 'A', service: 's' }, 'publication', 'un', db)
    await journal.journaliser({ nom: 'B', service: 's' }, 'retrait', 'deux', db)
    const entrees = await journal.lireJournal(db)
    expect(entrees[0].qui).toBe('B')
    expect(entrees[0].action).toBe('retrait')
  })

  it('tronque un détail trop long au lieu de refuser la ligne', async () => {
    await journal.journaliser({ nom: 'C' }, 'publication', 'x'.repeat(500), db)
    const entrees = await journal.lireJournal(db)
    expect(entrees[0].detail).toHaveLength(200)
  })

  it('purge ce qui dépasse 90 jours', async () => {
    await journal.journaliser({ nom: 'vieux' }, 'publication', 'ancien', db)
    await db`update journal set quand = now() - interval '91 days' where qui = 'vieux'`
    expect(await journal.purgerJournal(db)).toBeGreaterThan(0)
    const entrees = await journal.lireJournal(db)
    expect(entrees.some((e) => e.qui === 'vieux')).toBe(false)
  })
})
