/**
 * Les comptes utilisateurs.
 *
 * Le mot de passe n'est jamais ici en clair : `mot_de_passe_hash` porte une empreinte
 * argon2id, et `lister` ne le renvoie jamais. Le courriel est la clé, normalisé une
 * fois pour toutes — sinon « Agent@Ville.lu » et « agent@ville.lu » seraient deux
 * comptes.
 */
import { base, type Sql } from './client.ts'
import { capacitesPropres, type Capacite } from '../comptes/capacites.ts'

export interface Utilisateur {
  courriel: string
  motDePasseHash: string
  nom: string
  capacites: Capacite[]
  service: string
  langue: string
  courrielVerifie: boolean
  desactive: boolean
}

/** Une seule forme de courriel fait foi : minuscules, sans espace autour. */
export function normaliserCourriel(brut: unknown): string {
  return typeof brut === 'string' ? brut.trim().toLowerCase() : ''
}

function versUtilisateur(l: postgresRow): Utilisateur {
  return {
    courriel: l.courriel as string,
    motDePasseHash: l.mot_de_passe_hash as string,
    nom: l.nom as string,
    capacites: capacitesPropres(l.capacites),
    service: l.service as string,
    langue: l.langue as string,
    courrielVerifie: l.courriel_verifie as boolean,
    desactive: l.desactive as boolean,
  }
}
type postgresRow = Record<string, unknown>

export async function lireUtilisateur(courriel: string, db: Sql = base()): Promise<Utilisateur | null> {
  const lignes = await db`select * from utilisateur where courriel = ${courriel}`
  return lignes.length ? versUtilisateur(lignes[0] as postgresRow) : null
}

export interface NouveauCompte {
  courriel: string
  motDePasseHash: string
  nom: string
  capacites: Capacite[]
  service?: string
  langue?: string
  courrielVerifie?: boolean
}

/** Crée un compte. Renvoie `false` si le courriel existe déjà — jamais d'écrasement. */
export async function creerUtilisateur(c: NouveauCompte, db: Sql = base()): Promise<boolean> {
  const r = await db`
    insert into utilisateur
      (courriel, mot_de_passe_hash, nom, capacites, service, langue, courriel_verifie)
    values
      (${c.courriel}, ${c.motDePasseHash}, ${c.nom}, ${db.json(c.capacites)},
       ${c.service ?? ''}, ${c.langue ?? 'fr'}, ${c.courrielVerifie ?? false})
    on conflict (courriel) do nothing
  `
  return r.count > 0
}

/** Met à jour les champs modifiables (jamais le mot de passe : voir `changerMotDePasse`). */
export async function majUtilisateur(
  courriel: string,
  champs: { nom: string; capacites: Capacite[]; service: string; langue: string; desactive: boolean },
  db: Sql = base(),
): Promise<boolean> {
  const r = await db`
    update utilisateur set
      nom = ${champs.nom},
      capacites = ${db.json(champs.capacites)},
      service = ${champs.service},
      langue = ${champs.langue},
      desactive = ${champs.desactive}
    where courriel = ${courriel}
  `
  return r.count > 0
}

export async function changerMotDePasse(courriel: string, hash: string, db: Sql = base()): Promise<boolean> {
  const r = await db`update utilisateur set mot_de_passe_hash = ${hash} where courriel = ${courriel}`
  return r.count > 0
}

export async function marquerVerifie(courriel: string, db: Sql = base()): Promise<void> {
  await db`update utilisateur set courriel_verifie = true where courriel = ${courriel}`
}

export async function noterAccesUtilisateur(courriel: string, db: Sql = base()): Promise<void> {
  await db`update utilisateur set dernier_acces = now() where courriel = ${courriel}`
}

/** La liste, sans jamais l'empreinte du mot de passe. */
export async function listerUtilisateurs(
  db: Sql = base(),
): Promise<
  {
    courriel: string
    nom: string
    capacites: Capacite[]
    service: string
    langue: string
    courrielVerifie: boolean
    desactive: boolean
    creeLe: Date
    dernierAcces: Date | null
  }[]
> {
  const lignes = await db`
    select courriel, nom, capacites, service, langue, courriel_verifie, desactive,
           cree_le, dernier_acces
    from utilisateur order by cree_le
  `
  return lignes.map((l) => ({
    courriel: l.courriel as string,
    nom: l.nom as string,
    capacites: capacitesPropres(l.capacites),
    service: l.service as string,
    langue: l.langue as string,
    courrielVerifie: l.courriel_verifie as boolean,
    desactive: l.desactive as boolean,
    creeLe: l.cree_le as Date,
    dernierAcces: l.dernier_acces as Date | null,
  }))
}
