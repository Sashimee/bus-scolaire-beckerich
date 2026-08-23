/**
 * Hachage des mots de passe (argon2id).
 *
 * Isolé derrière deux fonctions, comme `push.js` isole le chiffrement : c'est la seule
 * brique cryptographique du lot, et on ne veut pas que ses paramètres se dispersent.
 * Les valeurs par défaut de `@node-rs/argon2` (argon2id, 19 Mio, 2 passes) sont la
 * ligne de base recommandée par l'OWASP ; l'algorithme est nommé explicitement pour
 * qu'un changement de défaut du paquet ne le fasse pas glisser en silence vers argon2i.
 */
import { Algorithm, hash, verify } from '@node-rs/argon2'

const OPTIONS = { algorithm: Algorithm.Argon2id } as const

export function hacherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse, OPTIONS)
}

/**
 * Vérifie un mot de passe contre son empreinte. Toute empreinte illisible (tronquée,
 * d'un autre algorithme) rend `false` plutôt que de lever : un compte au hachage
 * corrompu ne doit pas ouvrir une exception qui, non capturée, révélerait qu'il existe.
 */
export async function verifierMotDePasse(empreinte: string, motDePasse: string): Promise<boolean> {
  try {
    return await verify(empreinte, motDePasse, OPTIONS)
  } catch {
    return false
  }
}

/** Longueur minimale exigée. La longueur, et non la composition : voir le plan, lot 24. */
export const LONGUEUR_MDP_MIN = 10
