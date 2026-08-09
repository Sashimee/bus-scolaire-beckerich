/**
 * Intégration Google Agenda, entièrement côté navigateur.
 *
 * Deux garanties, qui sont la raison d'être de ce choix technique :
 *
 *  1. **Le jeton ne quitte pas l'onglet.** Le flux est un OAuth PKCE public : rien ne
 *     transite par le Worker ni par GitHub Pages, qui n'ont donc aucun moyen de lire
 *     l'agenda de qui que ce soit. L'ID client est public par construction — il n'y a
 *     pas de secret à protéger.
 *  2. **La portée `calendar.app.created` ne donne accès QU'AUX agendas créés par cette
 *     application.** L'agenda personnel du parent reste hors de portée, y compris en
 *     lecture. C'est exactement la garantie recherchée, et elle est imposée par Google,
 *     pas seulement promise par nous.
 *
 * Sans `VITE_ID_CLIENT_GOOGLE`, tout ce module reste inerte et la fonctionnalité
 * disparaît de l'interface — même politique que les notifications.
 */
import { ID_CLIENT_GOOGLE, URL_WORKER } from '../../config'
import type { EvenementRecurrent } from './evenements'
import type { Jour } from '../types'

const API = 'https://www.googleapis.com/calendar/v3'
const AUTORISATION = 'https://accounts.google.com/o/oauth2/v2/auth'
const PORTEE = 'https://www.googleapis.com/auth/calendar.app.created'

const CLE_VERIFICATEUR = 'bus-beckerich.google-verificateur'
const CLE_JETON = 'bus-beckerich.google-jeton'

const JOUR_ICS: Record<Jour, string> = {
  lundi: 'MO',
  mardi: 'TU',
  mercredi: 'WE',
  jeudi: 'TH',
  vendredi: 'FR',
}

/**
 * L'intégration n'est active qu'avec un identifiant qui EN EST UN.
 *
 * `Boolean(ID_CLIENT_GOOGLE)` suffisait : une variable de dépôt posée avec une valeur
 * de remplacement — ce qui est vite arrivé en recopiant une consigne — faisait
 * apparaître le bouton « Connecter mon compte Google », qui envoyait vers une page
 * d'erreur de Google. Mieux vaut que la fonctionnalité reste absente que cassée.
 *
 * Un identifiant client Google se termine toujours par ce suffixe.
 */
const SUFFIXE_ID_GOOGLE = '.apps.googleusercontent.com'

export const googleConfigure = (): boolean => ID_CLIENT_GOOGLE.endsWith(SUFFIXE_ID_GOOGLE)

interface Session {
  jeton: string
  /** Secondes depuis l'époque. */
  expire: number
}

export function chargerJeton(): string | null {
  try {
    const brut = sessionStorage.getItem(CLE_JETON)
    if (!brut) return null
    const s = JSON.parse(brut) as Session
    // Le jeton d'accès Google vit une heure. Expiré, il vaut mieux redemander que
    // laisser le parent lancer une synchronisation qui échouera à mi-parcours.
    return s.expire * 1000 > Date.now() ? s.jeton : null
  } catch {
    return null
  }
}

export function oublierJeton(): void {
  try {
    sessionStorage.removeItem(CLE_JETON)
  } catch {
    /* rien à oublier */
  }
}

// — OAuth PKCE ————————————————————————————————————————————————

const base64url = (octets: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(octets)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/**
 * PKCE : on engendre un secret éphémère, on n'en envoie que l'empreinte à
 * l'autorisation, et on ne révèle le secret qu'à l'échange. Un tiers qui intercepterait
 * le code de retour ne pourrait rien en faire.
 */
async function verificateur(): Promise<{ verificateur: string; defi: string }> {
  const octets = crypto.getRandomValues(new Uint8Array(32))
  const v = base64url(octets.buffer as ArrayBuffer)
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
  return { verificateur: v, defi: base64url(empreinte) }
}

const urlRetour = () => `${window.location.origin}${import.meta.env.BASE_URL}agenda`

/** Ouvre l'écran de consentement Google. Le parent revient sur `/agenda`. */
export async function demarrerConnexion(): Promise<void> {
  const { verificateur: v, defi } = await verificateur()
  sessionStorage.setItem(CLE_VERIFICATEUR, v)

  const url = new URL(AUTORISATION)
  url.searchParams.set('client_id', ID_CLIENT_GOOGLE)
  url.searchParams.set('redirect_uri', urlRetour())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', PORTEE)
  url.searchParams.set('code_challenge', defi)
  url.searchParams.set('code_challenge_method', 'S256')
  // Sans cela, Google renvoie parfois un écran vide au second passage.
  url.searchParams.set('prompt', 'consent')
  window.location.href = url.toString()
}

/**
 * Termine la connexion si l'URL porte un code de retour.
 *
 * Renvoie `true` quand un jeton a été obtenu. Le code est retiré de l'URL dans tous les
 * cas : le laisser dans l'historique du navigateur n'apporte rien et l'expose.
 */
export async function terminerConnexion(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  // Google renvoie `error=access_denied` quand le parent refuse l'autorisation.
  const refus = params.get('error')
  if (!code) {
    if (refus) {
      history.replaceState(null, '', window.location.pathname)
      throw new Error(refus)
    }
    return false
  }

  const v = sessionStorage.getItem(CLE_VERIFICATEUR)
  sessionStorage.removeItem(CLE_VERIFICATEUR)
  history.replaceState(null, '', window.location.pathname)
  if (!v) throw new Error('verificateur-perdu')

  // L'échange passe par le Worker et non par Google directement : Google l'exige avec
  // le `client_secret` pour un client « Application Web », et ce secret n'a rien à
  // faire dans du code servi aux parents. Même mécanique que la connexion GitHub.
  const rep = await fetch(`${URL_WORKER}/google/jeton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, verificateur: v, redirection: urlRetour() }),
  })

  const donnees = (await rep.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    erreur?: string
    detail?: unknown
  }
  // Un échec muet renvoyait le parent sur le bouton de connexion sans un mot, comme si
  // rien ne s'était passé. On lève : l'écran dira quoi.
  if (!rep.ok || !donnees.access_token) {
    throw new Error(String(donnees.detail ?? donnees.erreur ?? rep.status))
  }

  sessionStorage.setItem(
    CLE_JETON,
    JSON.stringify({
      jeton: donnees.access_token,
      expire: Math.floor(Date.now() / 1000) + (donnees.expires_in ?? 3600) - 60,
    }),
  )
  return true
}

// — Agendas ———————————————————————————————————————————————————

async function appeler<T>(jeton: string, chemin: string, options: RequestInit = {}): Promise<T> {
  const rep = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!rep.ok) throw new Error(`google-${rep.status}`)
  return (await rep.json()) as T
}

/**
 * L'agenda dédié à un enfant, créé au besoin.
 *
 * Un agenda PAR ENFANT, et non une poignée d'événements dans l'agenda principal :
 * c'est ce qui permet au parent de masquer, de renommer ou de **supprimer d'un geste**
 * tout ce que l'application a écrit, sans toucher au sien.
 */
async function agendaDeLEnfant(jeton: string, nom: string): Promise<string> {
  const { items } = await appeler<{ items?: { id: string; summary: string }[] }>(
    jeton,
    '/users/me/calendarList',
  )
  const existant = items?.find((c) => c.summary === nom)
  if (existant) return existant.id

  const cree = await appeler<{ id: string }>(jeton, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: nom, timeZone: 'Europe/Luxembourg' }),
  })
  return cree.id
}

/** Convertit un `EvenementRecurrent` en événement Google. */
function versEvenementGoogle(e: EvenementRecurrent) {
  const [h, m] = e.heure.split(':')
  const debut = `${e.debut}T${h}:${m}:00`
  const finMinutes = Number(h) * 60 + Number(m) + e.duree
  const fin =
    `${e.debut}T${String(Math.floor(finMinutes / 60) % 24).padStart(2, '0')}` +
    `:${String(finMinutes % 60).padStart(2, '0')}:00`

  return {
    // Identifiant stable, dérivé de l'enfant et du trajet : une resynchronisation
    // remplace l'événement au lieu d'en créer un second.
    id: e.id.toLowerCase().replace(/[^a-v0-9]/g, '0'),
    summary: e.titre,
    location: e.lieu,
    description: e.description,
    start: { dateTime: debut, timeZone: 'Europe/Luxembourg' },
    end: { dateTime: fin, timeZone: 'Europe/Luxembourg' },
    recurrence: [
      `RRULE:FREQ=WEEKLY;BYDAY=${e.jours.map((j) => JOUR_ICS[j]).join(',')};UNTIL=${e.fin.replace(/-/g, '')}T235959Z`,
      ...(e.exclusions.length
        ? [`EXDATE;TZID=Europe/Luxembourg:${e.exclusions.map((iso) => `${iso.replace(/-/g, '')}T${h}${m}00`).join(',')}`]
        : []),
    ],
    reminders:
      e.rappel !== null
        ? { useDefault: false, overrides: [{ method: 'popup', minutes: e.rappel }] }
        : { useDefault: false, overrides: [] },
  }
}

export interface ResultatSynchronisation {
  agenda: string
  ecrits: number
  echecs: number
}

/**
 * Écrit les rendez-vous d'un enfant dans son agenda dédié.
 *
 * Les identifiants étant stables, une seconde synchronisation met à jour au lieu de
 * dupliquer — c'est ce qui rend le bouton « mettre à jour l'agenda » utilisable après
 * un changement de cycle ou de plan.
 */
export async function synchroniserEnfant(
  jeton: string,
  prenom: string,
  evenements: EvenementRecurrent[],
): Promise<ResultatSynchronisation> {
  const nom = `Bus scolaire — ${prenom}`
  const agenda = await agendaDeLEnfant(jeton, nom)

  let ecrits = 0
  let echecs = 0
  for (const e of evenements) {
    const corps = versEvenementGoogle(e)
    try {
      // `PUT` sur l'identifiant : crée s'il n'existe pas, remplace sinon. Un `POST`
      // aurait créé un doublon à chaque resynchronisation.
      await appeler(jeton, `/calendars/${encodeURIComponent(agenda)}/events/${corps.id}`, {
        method: 'PUT',
        body: JSON.stringify(corps),
      })
      ecrits++
    } catch {
      echecs++
    }
  }

  return { agenda: nom, ecrits, echecs }
}
