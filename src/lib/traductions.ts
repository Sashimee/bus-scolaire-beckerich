/**
 * Surcouche de traduction, relue à chaque ouverture.
 *
 * Les cinq dictionnaires de `src/i18n/` sont compilés dans le bundle : corriger une
 * tournure allemande demandait un commit et un redéploiement. Ce fichier-ci recouvre
 * ces dictionnaires sans les remplacer, sur le même patron que `public/urgences.json` —
 * hors bundle, relu à chaque ouverture, et sans effet quand il est absent.
 *
 * Ce qu'on accepte de recouvrir est volontairement étroit : une clé qui existe déjà en
 * français, du même type, de la même forme. On corrige des textes ; on n'en invente pas.
 */
import fr from '../i18n/fr.json'
import { LANGUES, type Langue } from '../i18n/langues'

/** Corrections par langue, sous forme de chemins pointés (« assistant.terminer »). */
export type Surcouche = Partial<Record<Langue, Record<string, string | string[]>>>

export const SURCOUCHE_VIDE: Surcouche = {}

/** Plafonds : une correction reste une phrase, pas un roman collé dans un champ. */
const TEXTE_MAX = 400
const ENTREES_LISTE_MAX = 20
const ENTREES_MAX = 2000

/** Suit un chemin pointé dans un dictionnaire imbriqué. */
export function valeurDeReference(cle: string): unknown {
  return cle.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, fr as Record<string, unknown>)
}

/** Les marqueurs `{nom}` d'un texte, triés — deux textes équivalents ont les mêmes. */
const marqueurs = (texte: string) => (texte.match(/\{\w+\}/g) ?? []).sort().join(',')

export type MotifRefus =
  | 'langue-inconnue'
  | 'cle-inconnue'
  | 'type-different'
  | 'longueur-liste'
  | 'trop-long'
  | 'vide'
  | 'marqueurs'

/**
 * Pourquoi une correction est refusée, ou `null` si elle est acceptable.
 *
 * Renvoyer le motif plutôt qu'un booléen permet à l'éditeur de le dire au traducteur
 * pendant qu'il tape : un marqueur perdu doit se voir à la saisie, pas au retour d'un
 * 400 du Worker. La même fonction sert des deux côtés.
 */
export function motifRefus(langue: string, cle: string, valeur: unknown): MotifRefus | null {
  if (!(LANGUES as readonly string[]).includes(langue)) return 'langue-inconnue'

  const reference = valeurDeReference(cle)
  if (reference === undefined) return 'cle-inconnue'

  if (typeof reference === 'string') {
    if (typeof valeur !== 'string') return 'type-different'
    if (!valeur.trim()) return 'vide'
    if (valeur.length > TEXTE_MAX) return 'trop-long'
    // Un `{heure}` perdu afficherait une phrase amputée ; un `{heure}` inventé
    // s'afficherait tel quel, accolades comprises.
    if (marqueurs(valeur) !== marqueurs(reference)) return 'marqueurs'
    return null
  }

  if (Array.isArray(reference)) {
    if (!Array.isArray(valeur)) return 'type-different'
    // Une procédure d'installation amputée d'une étape serait invisible à la relecture
    // du code, mais bien réelle pour le parent qui la suit.
    if (valeur.length !== reference.length) return 'longueur-liste'
    if (valeur.length > ENTREES_LISTE_MAX) return 'longueur-liste'
    for (let i = 0; i < valeur.length; i++) {
      const v = valeur[i]
      if (typeof v !== 'string') return 'type-different'
      if (!v.trim()) return 'vide'
      if (v.length > TEXTE_MAX) return 'trop-long'
      if (marqueurs(v) !== marqueurs(String(reference[i]))) return 'marqueurs'
    }
    return null
  }

  // Un nœud intermédiaire (`dillendapp`) n'est pas un texte : on ne le recouvre pas.
  return 'cle-inconnue'
}

export const entreeValide = (langue: string, cle: string, valeur: unknown): boolean =>
  motifRefus(langue, cle, valeur) === null

/**
 * Ne garde que les corrections acceptables.
 *
 * Une entrée refusée est ignorée, les autres s'appliquent — comme une perturbation
 * cassée n'empêche pas les autres de s'afficher. Un fichier partiellement abîmé ne doit
 * pas faire disparaître tout le travail d'un traducteur.
 */
export function relireSurcouche(brut: unknown): Surcouche {
  if (!brut || typeof brut !== 'object') return SURCOUCHE_VIDE
  const langues = (brut as { langues?: unknown }).langues
  if (!langues || typeof langues !== 'object') return SURCOUCHE_VIDE

  const propre: Surcouche = {}
  let comptees = 0

  for (const langue of LANGUES) {
    const entrees = (langues as Record<string, unknown>)[langue]
    if (!entrees || typeof entrees !== 'object' || Array.isArray(entrees)) continue

    const retenues: Record<string, string | string[]> = {}
    for (const [cle, valeur] of Object.entries(entrees as Record<string, unknown>)) {
      if (comptees >= ENTREES_MAX) break
      if (!entreeValide(langue, cle, valeur)) continue
      retenues[cle] = valeur as string | string[]
      comptees++
    }
    if (Object.keys(retenues).length) propre[langue] = retenues
  }
  return propre
}

/**
 * Ce qu'un traducteur demande de changer : une clé vers sa nouvelle valeur, ou `null`
 * pour retirer la correction et revenir au dictionnaire compilé.
 */
export type Modifications = Record<string, string | string[] | null>

/**
 * Applique des modifications sur la surcouche EN LIGNE, langue par langue et clé par clé.
 *
 * Publier la surcouche entière télescopait le travail des autres : deux traducteurs
 * connectés en même temps partaient chacun de l'état chargé à l'ouverture de leur page,
 * et le second à publier réécrivait le fichier complet — les corrections du premier
 * disparaissaient sans un mot, y compris dans une autre langue.
 *
 * On raisonne donc comme `majUrgences` côté Worker : relire l'état courant, appliquer
 * une transformation, réécrire. Deux personnes qui corrigent deux clés différentes ne se
 * gênent plus. Deux personnes sur la MÊME clé restent en dernier-arrivé-gagnant, mais
 * c'est là un vrai désaccord, pas un accident de mécanique.
 */
export function appliquerModifications(
  actuelle: Surcouche,
  langue: Langue,
  modifications: Modifications,
): Surcouche {
  const entrees: Record<string, string | string[]> = { ...actuelle[langue] }

  for (const [cle, valeur] of Object.entries(modifications ?? {})) {
    if (valeur === null) delete entrees[cle]
    else if (entreeValide(langue, cle, valeur)) entrees[cle] = valeur
  }

  const suite: Surcouche = { ...actuelle }
  if (Object.keys(entrees).length) suite[langue] = entrees
  else delete suite[langue]
  return suite
}

// Le chargement du fichier vit dans `src/i18n/surcouche.ts` : ce module-ci est importé
// par le Worker, qui n'a ni `fetch` vers le site ni `import.meta.env`.
