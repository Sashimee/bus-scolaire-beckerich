/**
 * Partage de la configuration familiale par lien.
 *
 * Tout est encodé dans le FRAGMENT de l'URL (après le `#`). Ce choix est délibéré :
 * un fragment n'est jamais transmis au serveur, donc l'adresse du domicile et les
 * prénoms des enfants ne quittent pas les appareils, même en passant par GitHub Pages.
 * Une chaîne de requête (`?c=...`) figurerait, elle, dans les journaux du serveur.
 */
import type { Cycle, Enfant, Foyer, Jour, RepasMidi, UsageBus } from './types'
import { JOURS } from './types'

/** 1 : sans l'usage du bus. 2 : avec. 3 : avec la présence au Dillendapp.
 *  Les liens plus anciens restent lisibles. */
const VERSION = 3

const CYCLES: Cycle[] = ['precoce', 'c1', 'c2', 'c3', 'c4']

const LETTRE_BUS: Record<UsageBus, string> = {
  'aller-retour': 'b',
  aller: 'a',
  retour: 'r',
  aucun: 'n',
}
const BUS_PAR_LETTRE: Record<string, UsageBus> = {
  b: 'aller-retour',
  a: 'aller',
  r: 'retour',
  n: 'aucun',
}

/** Forme compacte : on encode des index et des lettres, pas des mots. */
type FoyerCompact = [
  version: number,
  libelle: string,
  localite: string,
  lat: number,
  lon: number,
  enfants: [prenom: string, cycle: number, repas: string, bus?: string, dillendapp?: (string | null)[]][],
]

function versBase64Url(texte: string): string {
  const octets = new TextEncoder().encode(texte)
  let binaire = ''
  for (const o of octets) binaire += String.fromCharCode(o)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function depuisBase64Url(code: string): string {
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const binaire = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(octets)
}

/** Encode un foyer en une chaîne courte, utilisable dans un lien ou un QR code. */
export function encoderFoyer(foyer: Foyer): string {
  const compact: FoyerCompact = [
    VERSION,
    foyer.adresse?.libelle ?? '',
    foyer.adresse?.localite ?? '',
    // Cinq décimales suffisent (précision ~1 m) et raccourcissent nettement le lien.
    Number((foyer.adresse?.coord[0] ?? 0).toFixed(5)),
    Number((foyer.adresse?.coord[1] ?? 0).toFixed(5)),
    foyer.enfants.map((e) => [
      e.prenom,
      CYCLES.indexOf(e.cycle),
      JOURS.map((j) => (e.repas[j] === 'dillendapp' ? 'd' : 'm')).join(''),
      JOURS.map((j) => LETTRE_BUS[e.bus?.[j] ?? 'aller-retour']).join(''),
      JOURS.map((j) => e.dillendappJusqua?.[j] ?? null),
    ]),
  ]
  return versBase64Url(JSON.stringify(compact))
}

/** Relit un foyer encodé. Renvoie `null` si le lien est illisible ou corrompu. */
export function decoderFoyer(code: string): Foyer | null {
  try {
    const brut = JSON.parse(depuisBase64Url(code)) as FoyerCompact
    if (!Array.isArray(brut) || brut[0] > VERSION || brut[0] < 1) return null

    const [, libelle, localite, lat, lon, enfantsBruts] = brut
    if (typeof lat !== 'number' || typeof lon !== 'number') return null

    const enfants: Enfant[] = enfantsBruts.map(([prenom, iCycle, repasBrut, busBrut, dillendappBrut], i) => {
      const repas = Object.fromEntries(
        JOURS.map((j, k) => [j, (repasBrut[k] === 'd' ? 'dillendapp' : 'maison') as RepasMidi]),
      ) as Record<Jour, RepasMidi>
      // Un lien de version 1 ne porte pas l'usage du bus : on suppose aller-retour.
      const bus = Object.fromEntries(
        JOURS.map((j, k) => [j, BUS_PAR_LETTRE[busBrut?.[k] ?? 'b'] ?? 'aller-retour']),
      ) as Record<Jour, UsageBus>
      // Les liens antérieurs à la version 3 ne portent pas la présence au Dillendapp.
      const dillendappJusqua = Object.fromEntries(
        JOURS.map((j, k) => [j, dillendappBrut?.[k] ?? null]),
      ) as Record<Jour, string | null>

      return {
        id: `partage-${i}`,
        prenom: String(prenom),
        cycle: CYCLES[iCycle] ?? 'c1',
        repas,
        bus,
        dillendappJusqua,
      }
    })

    return {
      adresse: libelle ? { libelle, localite, coord: [lat, lon] } : null,
      enfants,
    }
  } catch {
    return null
  }
}

/** Construit le lien de partage complet à partir de l'URL courante. */
export function lienPartage(foyer: Foyer, base = window.location.href): string {
  const url = new URL(base)
  url.hash = `partage=${encoderFoyer(foyer)}`
  return url.toString()
}

/** Extrait un foyer partagé du fragment de l'URL, s'il y en a un. */
export function foyerDepuisUrl(hash = window.location.hash): Foyer | null {
  const m = /(?:^#|&)partage=([A-Za-z0-9\-_]+)/.exec(hash)
  return m ? decoderFoyer(m[1]) : null
}
