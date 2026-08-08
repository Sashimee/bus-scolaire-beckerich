/**
 * Partage de la configuration familiale par lien.
 *
 * Tout est encodé dans le FRAGMENT de l'URL (après le `#`). Ce choix est délibéré :
 * un fragment n'est jamais transmis au serveur, donc l'adresse du domicile et les
 * prénoms des enfants ne quittent pas les appareils, même en passant par GitHub Pages.
 * Une chaîne de requête (`?c=...`) figurerait, elle, dans les journaux du serveur.
 */
import type { Adresse, AdresseJour, Cycle, Enfant, Foyer, Jour, RepasMidi, UsageBus } from './types'
import { JOURS } from './types'
import { coordValide, heureValide, texteSur } from './nettoyage'

/** 1 : sans l'usage du bus. 2 : avec. 3 : avec la présence au Dillendapp après la
 *  classe. 4 : avec l'inscription périscolaire, la présence avant la classe et les
 *  adresses par jour. Les liens plus anciens restent lisibles. */
const VERSION = 4

const CYCLES: Cycle[] = ['precoce', 'c1', 'c2', 'c3', 'c4']

/**
 * Bornes de ce qu'un lien peut porter.
 *
 * C'est l'entrée la plus exposée de l'application : n'importe qui peut faire ouvrir un
 * lien. Un foyer de dix mille enfants, ou un prénom de cinq mille caractères, ne sont
 * pas des configurations à importer — ce sont des tentatives de faire ramer l'appareil
 * de quelqu'un.
 */
const ENFANTS_MAX = 10
const PRENOM_MAX = 40
const LIBELLE_MAX = 80

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

/** Une adresse réduite à ce qu'il faut pour la recalculer : libellé et position. */
type AdresseCompacte = [libelle: string, localite: string, lat: number, lon: number]

/**
 * Adresses dérogatoires : cinq entrées, une par jour, chacune `[matin, soir]`.
 * `null` partout où il n'y a pas de dérogation — ce qui est le cas courant, et évite
 * d'alourdir le lien de la quasi-totalité des familles.
 */
type AdressesCompactes = ([AdresseCompacte | null, AdresseCompacte | null] | null)[]

/** Forme compacte : on encode des index et des lettres, pas des mots. */
type FoyerCompact = [
  version: number,
  libelle: string,
  localite: string,
  lat: number,
  lon: number,
  enfants: [
    prenom: string,
    cycle: number,
    repas: string,
    bus?: string,
    dillendapp?: (string | null)[],
    periscolaire?: number,
    dillendappDepuis?: (string | null)[],
    adresses?: AdressesCompactes | null,
  ][],
]

/** Cinq décimales : environ 1 m de précision, et un lien nettement plus court. */
const arrondi = (n: number) => Number(n.toFixed(5))

function compacterAdresse(a: Adresse | null | undefined): AdresseCompacte | null {
  return a ? [a.libelle, a.localite, arrondi(a.coord[0]), arrondi(a.coord[1])] : null
}

function relireAdresse(c: AdresseCompacte | null | undefined): Adresse | null {
  if (!Array.isArray(c)) return null
  const [libelle, localite, lat, lon] = c
  // `typeof === 'number'` laissait passer `NaN` : le foyer se retrouvait au large de
  // l'Afrique, et l'arrêt « le plus proche » était tiré au hasard.
  if (!coordValide([lat, lon])) return null
  return {
    libelle: texteSur(libelle, LIBELLE_MAX),
    localite: texteSur(localite, LIBELLE_MAX),
    coord: [lat, lon],
  }
}

function compacterAdressesJour(
  adresses: Partial<Record<Jour, AdresseJour>> | undefined,
): AdressesCompactes | null {
  if (!adresses) return null
  const compactes: AdressesCompactes = JOURS.map((j) => {
    const matin = compacterAdresse(adresses[j]?.matin)
    const soir = compacterAdresse(adresses[j]?.soir)
    return matin || soir ? [matin, soir] : null
  })
  return compactes.some(Boolean) ? compactes : null
}

function relireAdressesJour(
  compactes: AdressesCompactes | null | undefined,
): Partial<Record<Jour, AdresseJour>> {
  if (!Array.isArray(compactes)) return {}
  const adresses: Partial<Record<Jour, AdresseJour>> = {}
  JOURS.forEach((j, k) => {
    const paire = compactes[k]
    if (!Array.isArray(paire)) return
    const matin = relireAdresse(paire[0])
    const soir = relireAdresse(paire[1])
    if (matin || soir) adresses[j] = { ...(matin ? { matin } : {}), ...(soir ? { soir } : {}) }
  })
  return adresses
}

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
    arrondi(foyer.adresse?.coord[0] ?? 0),
    arrondi(foyer.adresse?.coord[1] ?? 0),
    foyer.enfants.map((e) => [
      e.prenom,
      CYCLES.indexOf(e.cycle),
      JOURS.map((j) => (e.repas[j] === 'dillendapp' ? 'd' : 'm')).join(''),
      JOURS.map((j) => LETTRE_BUS[e.bus?.[j] ?? 'aller-retour']).join(''),
      JOURS.map((j) => e.dillendappJusqua?.[j] ?? null),
      // Absent, on le déduit des repas à la relecture — même règle que le stockage.
      (e.periscolaire ?? JOURS.some((j) => e.repas[j] === 'dillendapp')) ? 1 : 0,
      JOURS.map((j) => e.dillendappDepuis?.[j] ?? null),
      compacterAdressesJour(e.adresses),
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
    // Le foyer sans adresse valable est refusé en bloc plutôt qu'importé à moitié :
    // une configuration sans domicile ne calcule aucun trajet, et le parent croirait
    // que l'application est en panne.
    if (!coordValide([lat, lon])) return null
    if (!Array.isArray(enfantsBruts) || enfantsBruts.length > ENFANTS_MAX) return null

    const enfants: Enfant[] = enfantsBruts.map(
      (
        [
          prenom,
          iCycle,
          repasBrut,
          busBrut,
          dillendappBrut,
          periscolaireBrut,
          depuisBrut,
          adressesBrutes,
        ],
        i,
      ) => {
        const repas = Object.fromEntries(
          JOURS.map((j, k) => [j, (repasBrut[k] === 'd' ? 'dillendapp' : 'maison') as RepasMidi]),
        ) as Record<Jour, RepasMidi>
        // Un lien de version 1 ne porte pas l'usage du bus : on suppose aller-retour.
        const bus = Object.fromEntries(
          JOURS.map((j, k) => [j, BUS_PAR_LETTRE[busBrut?.[k] ?? 'b'] ?? 'aller-retour']),
        ) as Record<Jour, UsageBus>
        // Les liens antérieurs à la version 3 ne portent pas la présence au Dillendapp.
        // Une « heure » qui n'en est pas se lirait telle quelle dans la fiche et dans
        // l'agenda : on la remplace par une absence, pas par une valeur inventée.
        const heureOuRien = (v: unknown) => (heureValide(v) ? v : null)
        const dillendappJusqua = Object.fromEntries(
          JOURS.map((j, k) => [j, heureOuRien(dillendappBrut?.[k])]),
        ) as Record<Jour, string | null>
        // Ni, avant la version 4, la présence du matin.
        const dillendappDepuis = Object.fromEntries(
          JOURS.map((j, k) => [j, heureOuRien(depuisBrut?.[k])]),
        ) as Record<Jour, string | null>

        return {
          id: `partage-${i}`,
          prenom: texteSur(prenom, PRENOM_MAX),
          cycle: CYCLES[iCycle] ?? 'c1',
          repas,
          bus,
          periscolaire:
            periscolaireBrut === undefined
              ? JOURS.some((j) => repas[j] === 'dillendapp')
              : periscolaireBrut === 1,
          dillendappDepuis,
          dillendappJusqua,
          adresses: relireAdressesJour(adressesBrutes),
        }
      },
    )

    const libelleFoyer = texteSur(libelle, LIBELLE_MAX)
    return {
      adresse: libelleFoyer
        ? { libelle: libelleFoyer, localite: texteSur(localite, LIBELLE_MAX), coord: [lat, lon] }
        : null,
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
