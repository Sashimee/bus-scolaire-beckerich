/**
 * Validation d'un plan de bus avant publication.
 *
 * C'est le garde-fou le plus important du projet : un plan corrompu casserait les
 * horaires de toutes les familles à la fois. On refuse donc de publier tant que la
 * structure n'est pas irréprochable, et on distingue ce qui bloque (une erreur) de
 * ce qui mérite un second regard (un avertissement).
 *
 * Deuxième filet, indépendant de celui-ci : les tests tournent en intégration
 * continue AVANT le déploiement. Un plan invalide fait échouer la construction, et le
 * site reste sur sa version précédente plutôt que de partir cassé.
 */
import { arrets, cycles } from './donnees'
import { JOURS } from './types'
import type { Jour } from './types'

export type Gravite = 'erreur' | 'avertissement'

export interface Probleme {
  gravite: Gravite
  /** Où se situe le problème, en clair : « aller-1 › matin › arrêt 3 ». */
  ou: string
  message: string
}

const PERIODES = ['matin', 'midi', 'apres-midi', 'soir']
const DIRECTIONS = ['vers-ecole', 'vers-domicile', 'vers-dillendapp']
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Convertit « 07:25 » en minutes, pour comparer des heures. */
const minutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))

/**
 * Vérifie un plan complet. Renvoie la liste des problèmes ; publication autorisée
 * seulement si aucun n'est de gravité « erreur ».
 */
export function validerPlan(brut: unknown): Probleme[] {
  const p: Probleme[] = []
  const erreur = (ou: string, message: string) => p.push({ gravite: 'erreur', ou, message })
  const avertir = (ou: string, message: string) =>
    p.push({ gravite: 'avertissement', ou, message })

  if (!estObjet(brut)) {
    erreur('racine', "Le contenu n'est pas un objet JSON.")
    return p
  }

  // — En-tête ————————————————————————————————————————————————
  for (const champ of ['anneeScolaire', 'valideDu', 'valideAu']) {
    if (typeof brut[champ] !== 'string' || !brut[champ]) {
      erreur('racine', `Le champ « ${champ} » est absent ou vide.`)
    }
  }
  for (const champ of ['valideDu', 'valideAu']) {
    const v = brut[champ]
    if (typeof v === 'string' && v && !DATE_ISO.test(v)) {
      erreur('racine', `« ${champ} » doit être une date AAAA-MM-JJ, reçu « ${v} ».`)
    }
  }
  if (
    typeof brut.valideDu === 'string' &&
    typeof brut.valideAu === 'string' &&
    brut.valideDu >= brut.valideAu
  ) {
    erreur('racine', 'La fin de validité doit être postérieure au début.')
  }

  // — Horaires de l'école ————————————————————————————————————
  const horaires = brut.horairesEcole
  if (!estObjet(horaires)) {
    erreur('horairesEcole', 'Bloc absent : sans lui, impossible de savoir quels jours ont cours.')
  } else {
    for (const demi of ['matin', 'apresMidi']) {
      const d = horaires[demi]
      if (!estObjet(d)) {
        erreur(`horairesEcole › ${demi}`, 'Bloc absent.')
        continue
      }
      for (const champ of ['debut', 'fin']) {
        if (typeof d[champ] !== 'string' || !HEURE.test(d[champ] as string)) {
          erreur(`horairesEcole › ${demi}`, `« ${champ} » doit être une heure HH:MM.`)
        }
      }
      if (!Array.isArray(d.jours) || d.jours.length === 0) {
        erreur(`horairesEcole › ${demi}`, 'Aucun jour de cours indiqué.')
      } else {
        for (const j of d.jours) {
          if (!JOURS.includes(j as Jour)) {
            erreur(`horairesEcole › ${demi}`, `Jour inconnu : « ${String(j)} ».`)
          }
        }
      }
    }
  }

  // — Lignes ——————————————————————————————————————————————
  if (!Array.isArray(brut.lignes) || brut.lignes.length === 0) {
    erreur('lignes', 'Aucune ligne : le plan serait vide.')
    return p
  }

  const idsArrets = new Set(arrets.map((a) => a.id))
  const idsCycles = new Set(cycles.map((c) => c.id))
  const idsLignes = new Set<string>()
  const idsServices = new Set<string>()
  const arretsUtilises = new Set<string>()

  for (const [iL, ligneBrute] of brut.lignes.entries()) {
    const ou0 = `ligne ${iL + 1}`
    if (!estObjet(ligneBrute)) {
      erreur(ou0, "Ce n'est pas un objet.")
      continue
    }
    const idLigne = typeof ligneBrute.id === 'string' ? ligneBrute.id : ''
    const ou1 = idLigne || ou0

    if (!idLigne) erreur(ou0, 'Identifiant de ligne absent.')
    else if (idsLignes.has(idLigne)) erreur(ou1, 'Identifiant de ligne en double.')
    else idsLignes.add(idLigne)

    if (typeof ligneBrute.nom !== 'string' || !ligneBrute.nom) {
      erreur(ou1, 'Nom de ligne absent : c’est ce que le parent lit.')
    }
    if (!DIRECTIONS.includes(ligneBrute.direction as string)) {
      erreur(ou1, `Direction inconnue : « ${String(ligneBrute.direction)} ».`)
    }

    if (estObjet(ligneBrute.reserve) && Array.isArray(ligneBrute.reserve.cycles)) {
      for (const c of ligneBrute.reserve.cycles) {
        if (!idsCycles.has(c as never)) erreur(ou1, `Cycle inconnu dans la réserve : « ${String(c)} ».`)
      }
    }

    if (!Array.isArray(ligneBrute.services) || ligneBrute.services.length === 0) {
      erreur(ou1, 'Aucune course : cette ligne ne circulerait jamais.')
      continue
    }

    for (const [iS, serviceBrut] of ligneBrute.services.entries()) {
      const ou2 = `${ou1} › course ${iS + 1}`
      if (!estObjet(serviceBrut)) {
        erreur(ou2, "Ce n'est pas un objet.")
        continue
      }
      const idService = typeof serviceBrut.id === 'string' ? serviceBrut.id : ''
      const ou = idService ? `${ou1} › ${idService}` : ou2

      if (!idService) erreur(ou2, 'Identifiant de course absent.')
      else if (idsServices.has(idService)) erreur(ou, 'Identifiant de course en double.')
      else idsServices.add(idService)

      if (!PERIODES.includes(serviceBrut.periode as string)) {
        erreur(ou, `Période inconnue : « ${String(serviceBrut.periode)} ».`)
      }

      if (!Array.isArray(serviceBrut.jours) || serviceBrut.jours.length === 0) {
        erreur(ou, 'Aucun jour de circulation.')
      } else {
        for (const j of serviceBrut.jours) {
          if (!JOURS.includes(j as Jour)) erreur(ou, `Jour inconnu : « ${String(j)} ».`)
        }
      }

      if (!Array.isArray(serviceBrut.arrets) || serviceBrut.arrets.length < 2) {
        erreur(ou, 'Une course doit desservir au moins deux arrêts.')
        continue
      }

      let precedente: number | null = null
      for (const [iA, arretBrut] of serviceBrut.arrets.entries()) {
        const ouA = `${ou} › arrêt ${iA + 1}`
        if (!estObjet(arretBrut)) {
          erreur(ouA, "Ce n'est pas un objet.")
          continue
        }

        const idArret = arretBrut.arret
        if (typeof idArret !== 'string' || !idsArrets.has(idArret)) {
          erreur(
            ouA,
            `Arrêt inconnu : « ${String(idArret)} ». Les arrêts doivent exister dans arrets.json.`,
          )
        } else {
          arretsUtilises.add(idArret)
        }

        const heure = arretBrut.heure
        if (heure !== null && (typeof heure !== 'string' || !HEURE.test(heure))) {
          erreur(ouA, `Heure invalide : « ${String(heure)} ». Attendu HH:MM, ou null.`)
        } else if (typeof heure === 'string') {
          const m = minutes(heure)
          if (precedente !== null && m < precedente) {
            erreur(
              ouA,
              `L'heure ${heure} précède celle de l'arrêt précédent : la course remonterait le temps.`,
            )
          }
          precedente = m
        }
      }
    }
  }

  // — Cohérence d'ensemble ——————————————————————————————————
  for (const c of cycles) {
    if (!arretsUtilises.has(c.arretEcole)) {
      erreur(
        'cohérence',
        `Aucune course ne dessert « ${c.arretEcole} », l'école du ${c.id}. Les enfants de ce cycle n'auraient aucun trajet.`,
      )
    }
  }

  const inutilises = arrets.filter((a) => !arretsUtilises.has(a.id))
  if (inutilises.length) {
    avertir(
      'cohérence',
      `${inutilises.length} arrêt(s) ne sont desservis par aucune course : ${inutilises
        .map((a) => a.id)
        .join(', ')}. Vérifiez que ce n'est pas un oubli.`,
    )
  }

  return p
}

/** Le plan est-il publiable ? */
export const planPubliable = (problemes: Probleme[]) =>
  !problemes.some((x) => x.gravite === 'erreur')
