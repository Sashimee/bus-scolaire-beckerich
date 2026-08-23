/**
 * Le seul point d'envoi de courriel — vérification d'adresse et réinitialisation de
 * mot de passe. Isolé derrière une fonction, comme `push.js` isole le chiffrement :
 * c'est la seule brique qui parle à un service extérieur, et on ne veut pas que ses
 * détails SMTP se dispersent dans les routes.
 *
 * En production, un vrai relai SMTP (le conteneur de relai de la VPS). En test, un mode
 * CAPTURE : les messages s'empilent en mémoire au lieu de partir, ce qui permet de
 * vérifier de bout en bout — inscription, jeton, lien reçu — sans relai ni réseau.
 */
import nodemailer from 'nodemailer'

export interface Message {
  a: string
  sujet: string
  texte: string
}

/** Rempli en mode capture (tests). Vidé par les tests entre deux cas. */
export const courrielsCaptures: Message[] = []

const enCapture = () => process.env.COURRIEL_CAPTURE === '1'

/**
 * Le courriel peut-il partir ? Les routes de vérification et de réinitialisation le
 * consultent AVANT d'agir : sans relai configuré, elles refusent avec un motif clair
 * plutôt que de laisser un lien de vérification tomber dans le vide.
 */
export function courrielConfigure(): boolean {
  return enCapture() || Boolean(process.env.SMTP_HOTE && process.env.SMTP_EXPEDITEUR)
}

let transport: nodemailer.Transporter | null = null
function transportSmtp(): nodemailer.Transporter {
  if (transport) return transport
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOTE,
    port: Number(process.env.SMTP_PORT ?? 25),
    // Le relai interne n'impose en général ni TLS ni identifiant ; on ne les force donc
    // pas, mais on les emploie s'ils sont fournis.
    secure: process.env.SMTP_TLS === '1',
    ...(process.env.SMTP_UTILISATEUR
      ? { auth: { user: process.env.SMTP_UTILISATEUR, pass: process.env.SMTP_MOTDEPASSE ?? '' } }
      : {}),
  })
  return transport
}

export async function envoyerCourriel(message: Message): Promise<void> {
  if (enCapture()) {
    courrielsCaptures.push(message)
    return
  }
  await transportSmtp().sendMail({
    from: process.env.SMTP_EXPEDITEUR,
    to: message.a,
    subject: message.sujet,
    text: message.texte,
  })
}

/**
 * Le texte des deux courriels, dans la langue du compte. Court à dessein : un lien, une
 * durée de validité, et rien qui ressemble à du courriel officiel de la commune — le
 * site est indépendant, et ses courriels le disent aussi.
 */
type Modele = { sujet: string; corps: (nom: string, lien: string) => string }

const SIGNATURE: Record<string, string> = {
  fr: 'Bus scolaire Beckerich (site indépendant)',
  de: 'Schulbus Beckerich (unabhängige Website)',
  lb: 'Schoulbus Beckerich (onofhängege Site)',
  pt: 'Autocarro escolar Beckerich (site independente)',
  en: 'Beckerich school bus (independent site)',
}

const VERIFICATION: Record<string, Modele> = {
  fr: {
    sujet: 'Vérifiez votre adresse',
    corps: (nom, lien) =>
      `Bonjour ${nom},\n\nOuvrez ce lien pour activer votre compte (valable 24 h) :\n${lien}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
  },
  de: {
    sujet: 'Bestätigen Sie Ihre Adresse',
    corps: (nom, lien) =>
      `Hallo ${nom},\n\nÖffnen Sie diesen Link, um Ihr Konto zu aktivieren (24 Std. gültig):\n${lien}\n\nFalls Sie das nicht angefragt haben, ignorieren Sie diese Nachricht.`,
  },
  lb: {
    sujet: 'Confirméiert Är Adress',
    corps: (nom, lien) =>
      `Moien ${nom},\n\nMaacht dëse Link op fir Äre Kont z'aktivéieren (24 Std. gülteg):\n${lien}\n\nWann Dir dat net gefrot hutt, ignoréiert dës Noriicht.`,
  },
  pt: {
    sujet: 'Confirme o seu endereço',
    corps: (nom, lien) =>
      `Olá ${nom},\n\nAbra esta ligação para ativar a sua conta (válida 24 h):\n${lien}\n\nSe não fez este pedido, ignore esta mensagem.`,
  },
  en: {
    sujet: 'Verify your address',
    corps: (nom, lien) =>
      `Hello ${nom},\n\nOpen this link to activate your account (valid 24 h):\n${lien}\n\nIf you did not request this, ignore this message.`,
  },
}

const REINITIALISATION: Record<string, Modele> = {
  fr: {
    sujet: 'Réinitialiser votre mot de passe',
    corps: (nom, lien) =>
      `Bonjour ${nom},\n\nOuvrez ce lien pour choisir un nouveau mot de passe (valable 1 h) :\n${lien}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
  },
  de: {
    sujet: 'Passwort zurücksetzen',
    corps: (nom, lien) =>
      `Hallo ${nom},\n\nÖffnen Sie diesen Link, um ein neues Passwort zu wählen (1 Std. gültig):\n${lien}\n\nFalls Sie das nicht angefragt haben, ignorieren Sie diese Nachricht: Ihr Passwort bleibt unverändert.`,
  },
  lb: {
    sujet: 'Passwuert zrécksetzen',
    corps: (nom, lien) =>
      `Moien ${nom},\n\nMaacht dëse Link op fir en neit Passwuert ze wielen (1 Std. gülteg):\n${lien}\n\nWann Dir dat net gefrot hutt, ignoréiert dës Noriicht: Äert Passwuert bleift onverännert.`,
  },
  pt: {
    sujet: 'Repor a sua palavra-passe',
    corps: (nom, lien) =>
      `Olá ${nom},\n\nAbra esta ligação para escolher uma nova palavra-passe (válida 1 h):\n${lien}\n\nSe não fez este pedido, ignore esta mensagem: a sua palavra-passe permanece inalterada.`,
  },
  en: {
    sujet: 'Reset your password',
    corps: (nom, lien) =>
      `Hello ${nom},\n\nOpen this link to choose a new password (valid 1 h):\n${lien}\n\nIf you did not request this, ignore this message: your password stays unchanged.`,
  },
}

const modele = (table: Record<string, Modele>, langue: string) => table[langue] ?? table.fr

export function courrielVerification(a: string, nom: string, lien: string, langue: string): Message {
  const m = modele(VERIFICATION, langue)
  return { a, sujet: m.sujet, texte: `${m.corps(nom, lien)}\n\n— ${SIGNATURE[langue] ?? SIGNATURE.fr}` }
}

export function courrielReinitialisation(a: string, nom: string, lien: string, langue: string): Message {
  const m = modele(REINITIALISATION, langue)
  return { a, sujet: m.sujet, texte: `${m.corps(nom, lien)}\n\n— ${SIGNATURE[langue] ?? SIGNATURE.fr}` }
}
