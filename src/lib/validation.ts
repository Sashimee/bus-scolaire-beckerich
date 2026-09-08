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
// Mêmes expressions que la relecture des entrées : deux copies finiraient par
// diverger, et l'une laisserait passer ce que l'autre refuse.
import { DATE_ISO, HEURE } from './nettoyage'
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

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Convertit « 07:25 » en minutes, pour comparer des heures. */
const minutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))

/**
 * Au-delà, un car scolaire de village a presque sûrement une minute mal recopiée.
 *
 * Le plan en vigueur en compte six — Huttange → Noerdange en 1 min pour 1,9 km, soit
 * 114 km/h — hérités de l'arrondi à la minute de la brochure communale. Ce sont des
 * AVERTISSEMENTS : refuser de publier pour cela bloquerait une rentrée entière, et ces
 * six-là sont dans la brochure. Mais personne ne les avait vus. R70.
 */
const VITESSE_MAX_KMH = 90

/** Distance à vol d'oiseau entre deux arrêts connus, en km. `null` si l'un est inconnu. */
function distanceKm(a: string, b: string): number | null {
  const x = arrets.find((s) => s.id === a)
  const y = arrets.find((s) => s.id === b)
  if (!x || !y) return null
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(y.coord[0] - x.coord[0])
  const dLon = rad(y.coord[1] - x.coord[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(x.coord[0])) * Math.cos(rad(y.coord[0])) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

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
    const jours = horaires.jours
    if (!estObjet(jours)) {
      erreur(
        'horairesEcole › jours',
        'Bloc absent : sans lui, impossible de savoir quels jours ont cours.',
      )
    } else {
      for (const demi of ['matin', 'apresMidi']) {
        const liste = jours[demi]
        if (!Array.isArray(liste) || liste.length === 0) {
          erreur(`horairesEcole › jours › ${demi}`, 'Aucun jour de cours indiqué.')
          continue
        }
        for (const j of liste) {
          if (!JOURS.includes(j as Jour)) {
            erreur(`horairesEcole › jours › ${demi}`, `Jour inconnu : « ${String(j)} ».`)
          }
        }
      }
    }

    // Les heures de sortie décident de l'heure proposée par défaut à la maison relais :
    // un cycle sans horaire laisserait un parent déclarer une présence qui n'existe pas.
    const parCycle = horaires.parCycle
    if (!estObjet(parCycle)) {
      erreur('horairesEcole › parCycle', 'Bloc absent : chaque cycle a ses propres heures.')
    } else {
      for (const c of cycles) {
        const h = parCycle[c.id]
        if (!estObjet(h)) {
          erreur(`horairesEcole › parCycle › ${c.id}`, 'Heures de cours absentes pour ce cycle.')
          continue
        }
        for (const demi of ['matin', 'apresMidi']) {
          const creneau = h[demi]
          if (!estObjet(creneau)) {
            erreur(`horairesEcole › parCycle › ${c.id} › ${demi}`, 'Bloc absent.')
            continue
          }
          const ou = `horairesEcole › parCycle › ${c.id} › ${demi}`
          let bornes = 0
          for (const champ of ['debut', 'fin']) {
            if (typeof creneau[champ] === 'string' && HEURE.test(creneau[champ] as string)) {
              bornes++
            } else {
              erreur(ou, `« ${champ} » doit être une heure HH:MM.`)
            }
          }
          if (bornes === 2 && minutes(creneau.debut as string) >= minutes(creneau.fin as string)) {
            erreur(ou, 'La fin des cours doit suivre leur début.')
          }
        }
      }
    }
  }

  // — Incertitudes ————————————————————————————————————————
  // Une course peut renvoyer à une incertitude par son identifiant. Un renvoi qui ne
  // désigne rien ne se voit pas : l'application affiche alors la CLÉ de traduction à
  // la place de la phrase, sous un titre « Ce que nous ne savons pas ».
  const idsIncertitudes = new Set<string>()
  if (brut.incertitudes !== undefined && !Array.isArray(brut.incertitudes)) {
    erreur('incertitudes', "Ce n'est pas une liste.")
  } else {
    for (const [i, brute] of ((brut.incertitudes as unknown[]) ?? []).entries()) {
      const ou = `incertitude ${i + 1}`
      if (!estObjet(brute)) {
        erreur(ou, "Ce n'est pas un objet.")
        continue
      }
      const id = typeof brute.id === 'string' ? brute.id : ''
      if (!id) erreur(ou, 'Identifiant absent.')
      else if (idsIncertitudes.has(id)) erreur(id, 'Identifiant en double.')
      else idsIncertitudes.add(id)

      for (const champ of ['question', 'hypothese']) {
        if (typeof brute[champ] !== 'string' || !brute[champ]) {
          erreur(id || ou, `Le champ « ${champ} » est absent ou vide.`)
        }
      }
      // `jours` restreint l'incertitude aux jours qu'elle concerne réellement. Une
      // liste vide la rendrait invisible partout, ce qui n'est jamais l'intention.
      if (brute.jours !== undefined) {
        if (!Array.isArray(brute.jours) || brute.jours.length === 0) {
          erreur(id || ou, '« jours » doit être une liste non vide, ou être absent.')
        } else {
          for (const j of brute.jours) {
            if (!JOURS.includes(j as Jour)) erreur(id || ou, `Jour inconnu : « ${String(j)} ».`)
          }
        }
      }
    }
  }

  // — Notes ————————————————————————————————————————————————
  // Même piège que les incertitudes : un arrêt porte des identifiants de note, dont le
  // texte vit dans les dictionnaires. Une note qui n'est pas déclarée ici affiche sa
  // CLÉ au parent, à côté d'une heure de bus. R70.
  const idsNotes = new Set<string>()
  if (brut.notes !== undefined && !estObjet(brut.notes)) {
    erreur('notes', "Ce n'est pas un objet.")
  } else {
    for (const cle of Object.keys((brut.notes as Record<string, unknown>) ?? {})) {
      if (!cle.startsWith('$')) idsNotes.add(cle)
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

    // Les arrêts que CETTE ligne dessert réellement, pour confronter son champ
    // `dessert` : il annonce au parent où la ligne le mène, et `aller-3` y écrivait
    // « beckerich-ecole » alors qu'il passe à la maison relais. Rien ne l'avait vu,
    // aucun code ne lisant ce champ. R70.
    const desservisParLaLigne = new Set<string>()

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

      if (serviceBrut.incertitude !== undefined) {
        const renvoi = serviceBrut.incertitude
        if (typeof renvoi !== 'string' || !idsIncertitudes.has(renvoi)) {
          erreur(ou, `Incertitude inconnue : « ${String(renvoi)} ». Aucune ne porte cet identifiant.`)
        }
      }

      if (!Array.isArray(serviceBrut.arrets) || serviceBrut.arrets.length < 2) {
        erreur(ou, 'Une course doit desservir au moins deux arrêts.')
        continue
      }

      let precedente: number | null = null
      let arretPrecedent: string | null = null
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
          if (arretBrut.desservi !== false) desservisParLaLigne.add(idArret)
          // Une boucle qui repasse au même arrêt est normale — l'Aller 3 dessert le
          // Dillendapp deux fois. Deux fois D'AFFILÉE ne l'est jamais : c'est une
          // ligne recopiée en trop, et elle ferait un trajet de zéro minute.
          if (idArret === arretPrecedent) {
            erreur(ouA, `L'arrêt « ${idArret} » est répété deux fois de suite.`)
          }
        }

        if (arretBrut.notes !== undefined) {
          if (!Array.isArray(arretBrut.notes)) {
            erreur(ouA, '« notes » doit être une liste d’identifiants.')
          } else {
            for (const n of arretBrut.notes) {
              if (!idsNotes.has(n as string)) {
                erreur(ouA, `Note inconnue : « ${String(n)} ». Déclarez-la dans « notes ».`)
              }
            }
          }
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
          // Une vitesse impossible signale presque toujours une minute mal recopiée.
          // Avertissement et non erreur : le plan en vigueur en compte six, hérités de
          // l'arrondi à la minute de la brochure, et refuser de publier pour cela
          // bloquerait une rentrée entière. R70.
          if (precedente !== null && typeof idArret === 'string' && arretPrecedent) {
            const km = distanceKm(arretPrecedent, idArret)
            const minutesEcoulees = m - precedente
            if (km !== null && minutesEcoulees > 0 && km / (minutesEcoulees / 60) > VITESSE_MAX_KMH) {
              avertir(
                ouA,
                `${km.toFixed(1)} km en ${minutesEcoulees} min depuis « ${arretPrecedent} » : ` +
                  `plus de ${VITESSE_MAX_KMH} km/h. Vérifiez l'heure.`,
              )
            }
          }
          precedente = m
        }
        if (typeof idArret === 'string') arretPrecedent = idArret
      }
    }

    if (ligneBrute.dessert !== undefined) {
      if (!Array.isArray(ligneBrute.dessert)) {
        erreur(ou1, '« dessert » doit être une liste d’identifiants d’arrêts.')
      } else {
        for (const id of ligneBrute.dessert) {
          if (!desservisParLaLigne.has(id as string)) {
            erreur(
              ou1,
              `« dessert » annonce « ${String(id)} », qu'aucune course de cette ligne ne dessert.`,
            )
          }
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
