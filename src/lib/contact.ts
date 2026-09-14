/**
 * Le contact passe par la vitrine, jamais par un second formulaire.
 *
 * Deux formulaires, ce seraient deux destinations, deux protections anti-spam à tenir,
 * et deux endroits où une personne peut écrire sans que l'autre le sache. La vitrine en
 * a un ; l'application y renvoie.
 */
import { LANGUES, type Langue } from '../i18n/langues'

/**
 * Posée en clair à côté du lien : l'application fonctionne hors ligne, le formulaire
 * non. Une adresse reste lisible et copiable sans réseau.
 */
export const ADRESSE_CONTACT = 'admin@schoulbus.lu'

const VITRINE = 'https://www.schoulbus.lu'

/** Le français est à la racine de la vitrine, les autres langues sous leur segment. */
export function lienContact(langue: Langue): string {
  return langue === LANGUES[0] ? `${VITRINE}/contact/` : `${VITRINE}/${langue}/contact/`
}
