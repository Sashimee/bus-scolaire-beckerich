import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { estAppareilIOS } from '../installation-contexte'
import { DemoAgenda } from '../composants/installation/DemoAgenda'
import { evenementsEnfant } from '../lib/agenda'
import {
  chargerJeton,
  demarrerConnexion,
  googleConfigure,
  oublierJeton,
  synchroniserEnfant,
  terminerConnexion,
} from '../lib/agenda/google'
import { nomArretParId } from '../lib/affichage'
import type { ContexteEnfant } from '../lib/plan'

type Plateforme = 'ios' | 'android' | 'google' | 'outlook'

const PLATEFORMES: Plateforme[] = ['ios', 'android', 'google', 'outlook']

/** Devine la plateforme la plus probable, sans masquer les autres. */
function detecter(): Plateforme {
  if (estAppareilIOS()) return 'ios'
  if (/Android/.test(navigator.userAgent)) return 'android'
  return 'google'
}

/**
 * Ce qu'il faut faire du fichier une fois téléchargé.
 *
 * Un `.ics` téléchargé ne sert à rien tant qu'il n'est pas importé, et chaque
 * plateforme s'y prend autrement. Sans cette page, le bouton « Télécharger pour mon
 * agenda » produisait un fichier que beaucoup de parents ne retrouvaient jamais.
 */
function Procedure({ cle, principal }: { cle: Plateforme; principal: boolean }) {
  const { t, tListe } = useT()
  return (
    <div className={principal ? 'carte carte--accent pile' : 'pile'}>
      <h3 className="titre-carte">{t(`agenda.${cle}`)}</h3>
      <DemoAgenda plateforme={cle} />
      <ol className="pile pile--serre liste-puces">
        {tListe(`agenda.${cle}Etapes`).map((etape) => (
          <li key={etape}>{etape}</li>
        ))}
      </ol>
    </div>
  )
}

/**
 * Écriture directe dans Google Agenda.
 *
 * N'apparaît que si un ID client est configuré à la construction. Le flux reste dans
 * l'onglet, et la portée demandée ne donne accès qu'aux agendas créés par cette
 * application : l'agenda personnel du parent reste hors d'atteinte.
 */
function BlocGoogle() {
  const { t } = useT()
  const { foyer, contextes } = useFoyer()
  const [jeton, setJeton] = useState<string | null>(chargerJeton)
  const [occupe, setOccupe] = useState(false)
  const [resultat, setResultat] = useState<string | null>(null)
  const [erreur, setErreur] = useState(false)

  // Le retour de Google porte un code dans l'URL : on l'échange puis on l'efface.
  useEffect(() => {
    terminerConnexion()
      .then((ok) => {
        if (ok) setJeton(chargerJeton())
      })
      .catch((e: unknown) => {
        // Sans cela, un échange refusé renvoyait sur le bouton de connexion sans un
        // mot : le parent recliquait indéfiniment sans savoir ce qui n'allait pas.
        setErreur(true)
        setResultat(e instanceof Error ? e.message : null)
      })
  }, [])

  const enfants = foyer.enfants
    .map((e) => contextes.get(e.id))
    .filter((c): c is ContexteEnfant => c !== null && c !== undefined && !c.marcheDirecte)

  const synchroniser = async () => {
    if (!jeton) return
    setOccupe(true)
    setErreur(false)
    setResultat(null)
    try {
      const options = {
        libelleTrajet: (trajet: { type: string }) => t(`trajets.${trajet.type}`),
        nomArret: (idArret: string) => nomArretParId(idArret, t),
        libelleRecuperation: t('dillendapp.aRecuperer'),
        libelleDepose: t('dillendapp.aDeposer'),
      }
      let total = 0
      for (const ctx of enfants) {
        const r = await synchroniserEnfant(jeton, ctx.enfant.prenom, evenementsEnfant(ctx, options))
        total += r.ecrits
      }
      setResultat(t('agenda.googleFait', { nombre: total, enfants: enfants.length }))
    } catch {
      setErreur(true)
      // Un jeton expiré est le cas le plus fréquent : on le jette pour que le parent
      // se reconnecte au lieu de réessayer indéfiniment.
      oublierJeton()
      setJeton(null)
    } finally {
      setOccupe(false)
    }
  }

  return (
    <section className="carte pile pile--serre">
      <h3 className="titre-carte">{t('agenda.googleTitre')}</h3>
      <p className="champ__aide">{t('agenda.googleAide')}</p>
      <p className="champ__aide">{t('agenda.googlePortee')}</p>

      {/* `resultat` porte soit un compte rendu de synchronisation, soit — en cas
          d'échec — le motif renvoyé par Google. Les deux ne se lisent pas pareil. */}
      {erreur && (
        <div className="encart encart--alerte">
          <div className="encart__titre">{t('agenda.googleConnexionEchec')}</div>
          {resultat && (
            <p className="champ__aide">
              <code>{resultat}</code>
            </p>
          )}
        </div>
      )}
      {!erreur && resultat && <div className="encart encart--info">{resultat}</div>}

      {jeton ? (
        <>
          <button
            type="button"
            className="bouton bouton--primaire"
            disabled={occupe || enfants.length === 0}
            onClick={() => void synchroniser()}
          >
            {occupe ? t('commun.chargement') : t('agenda.googleSynchroniser')}
          </button>
          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => {
              oublierJeton()
              setJeton(null)
            }}
          >
            {t('agenda.googleDeconnexion')}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="bouton bouton--primaire"
          onClick={() => void demarrerConnexion()}
        >
          {t('agenda.googleConnexion')}
        </button>
      )}
    </section>
  )
}

export function Agenda() {
  const { t } = useT()
  const [plateforme] = useState(detecter)
  const autres = PLATEFORMES.filter((p) => p !== plateforme)

  return (
    <div className="pile pile--large">
      <header className="pile pile--serre">
        <h2>{t('agenda.titre')}</h2>
        <p>{t('agenda.intro')}</p>
      </header>

      <section className="carte pile pile--serre">
        <h3 className="titre-carte">{t('agenda.pourquoiTitre')}</h3>
        <ul className="liste-puces pile pile--serre">
          <li>{t('agenda.atoutVacances')}</li>
          <li>{t('agenda.atoutRappel')}</li>
          <li>{t('agenda.atoutSupprimer')}</li>
        </ul>
        <p className="champ__aide">{t('agenda.remarqueMiseAJour')}</p>
      </section>

      <section className="pile pile--serre">
        <span className="etiquette">{t('installer.detecte')}</span>
        <Procedure cle={plateforme} principal />
      </section>

      {googleConfigure() && <BlocGoogle />}

      <details className="repli carte">
        <summary>{t('installer.autres')}</summary>
        <div className="pile pile--large">
          {autres.map((p) => (
            <Procedure key={p} cle={p} principal={false} />
          ))}
        </div>
      </details>

      <Link to="/reglages" className="bouton bouton--discret">
        {t('nav.reglages')}
      </Link>
    </div>
  )
}
