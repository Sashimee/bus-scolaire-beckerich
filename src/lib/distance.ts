import type { Coord } from './types'

const RAYON_TERRE_M = 6_371_000

/**
 * Les rues ne suivent pas la ligne droite. 1,35 est le facteur de détour couramment
 * retenu pour de l'habitat rural diffus comme celui de la commune.
 */
export const FACTEUR_DETOUR = 1.35

/**
 * Vitesse de marche retenue, en km/h. Volontairement prudente : un parent qui
 * accompagne un enfant de cycle 1 ne marche pas à 5 km/h.
 */
export const VITESSE_MARCHE_KMH = 4.5

const rad = (deg: number) => (deg * Math.PI) / 180

/** Distance à vol d'oiseau entre deux points, en mètres. */
export function distanceVolOiseau(a: Coord, b: Coord): number {
  const [lat1, lon1] = a
  const [lat2, lon2] = b
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * RAYON_TERRE_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Distance à pied estimée, en mètres : vol d'oiseau corrigé du détour des rues. */
export function distanceMarche(a: Coord, b: Coord): number {
  return distanceVolOiseau(a, b) * FACTEUR_DETOUR
}

/**
 * Temps de marche estimé, en minutes entières (minimum 1).
 * C'est une ESTIMATION : l'application doit toujours l'annoncer comme telle,
 * elle ne connaît ni les trottoirs, ni les dénivelés, ni les traversées.
 */
export function tempsMarche(a: Coord, b: Coord): number {
  const metres = distanceMarche(a, b)
  const minutes = (metres / 1000 / VITESSE_MARCHE_KMH) * 60
  return Math.max(1, Math.round(minutes))
}
