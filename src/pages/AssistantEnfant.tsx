import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { Assistant, type Etape } from '../composants/Assistant'
import { CarteTrajet } from '../composants/CarteTrajet'
import { ChampAdresse } from '../composants/ChampAdresse'
import { ChoixSimple, type OptionChoix } from '../composants/ChoixSemaine'
import { SectionMatin, SectionMidi, SectionSoir } from '../composants/Moments'
import { JourneeTrajets } from '../composants/Trajets'
import { semaineEnfant } from '../lib/plan'
import { semaineReglee } from '../lib/moments'
import { distanceLisible, nomArret } from '../lib/affichage'
import { siteDuCycle } from '../lib/donnees'
import type { Cycle } from '../lib/types'

const CYCLES: Cycle[] = ['precoce', 'c1', 'c2', 'c3', 'c4']

/** Les trois moments, dans l'ordre où l'assistant les demande. */
const ETAPE_DU_MOMENT = { matin: 2, midi: 3, soir: 4 } as const

/**
 * Configuration d'un enfant, une question par écran.
 *
 * Vient en complément de `/configurer`, qui reste la vue dense pour corriger un
 * détail. L'assistant s'adresse au parent qui découvre l'application.
 *
 * Il suit la JOURNÉE de l'enfant, et non les champs du stockage : qui il est, où il
 * habite, puis son matin, son midi, sa fin de journée. Ce sont les quatre choses qu'un
 * parent sait dire sans y réfléchir. Les réglages qu'elles impliquent — usage du bus,
 * repas, heures de présence, adresses dérogatoires — sont déduits par
 * `src/lib/moments.ts` : c'était au parent de les accorder entre eux, et rien à
 * l'écran ne disait qu'ils décrivaient la même chose.
 *
 * Aucun brouillon : chaque réponse est écrite immédiatement. Il n'y a donc pas de
 * bouton « annuler », rien à valider, et quitter l'assistant en cours de route ne perd
 * rien. Les six étapes sont fixes : aucune ne se dérobe selon les réponses.
 */
export function AssistantEnfant() {
  const { t } = useT()
  const { id } = useParams()
  const naviguer = useNavigate()
  const { foyer, contextes, definirAdresse, modifierEnfant } = useFoyer()
  const [indice, setIndice] = useState(0)

  const enfant = foyer.enfants.find((e) => e.id === id)
  if (!enfant) return <p>{t('enfant.aucun')}</p>

  const ctx = contextes.get(enfant.id) ?? null
  const site = siteDuCycle(enfant.cycle)
  const prenom = enfant.prenom.trim() || t('enfant.sansPrenom')
  // L'adresse est celle du FOYER : la modifier ici la déplacerait pour toute la
  // fratrie, sans que rien ne le dise. Dès le deuxième enfant, l'assistant la montre
  // sans permettre d'y toucher, et renvoie à l'écran qui la règle pour tout le monde.
  const adressePartagee = foyer.enfants.length > 1

  const cycles: OptionChoix<Cycle>[] = CYCLES.map((c) => ({
    valeur: c,
    libelle: t(`cycles.${c}`),
    court: t(`cycles.${c}`),
    aide: `${t(`cycles.${c}Ages`)} · ${siteDuCycle(c).nom}`,
  }))

  const etapes: Etape[] = [
    // 1. Qui est l'enfant. Le site scolaire se déduit du cycle : le montrer aussitôt
    //    évite au parent de se demander s'il a bien répondu.
    {
      cle: 'enfant',
      titre: t('assistant.titreEnfant'),
      pretePourLaSuite: enfant.prenom.trim().length > 0,
      obstacle: t('assistant.obstaclePrenom'),
      contenu: (
        <section className="carte pile">
          <div className="champ">
            <label htmlFor="assistant-prenom">{t('enfant.prenom')}</label>
            <input
              id="assistant-prenom"
              type="text"
              value={enfant.prenom}
              placeholder={t('enfant.prenomPlaceholder')}
              onChange={(e) => modifierEnfant(enfant.id, { prenom: e.target.value })}
            />
          </div>

          <fieldset className="fieldset-nu pile pile--serre">
            <legend className="legende legende--question">{t('enfant.cycleQuestion')}</legend>
            <p className="champ__aide">{t('enfant.cycleAide')}</p>
            <ChoixSimple
              id="assistant-cycle"
              options={cycles}
              valeur={enfant.cycle}
              onChoisir={(cycle) => modifierEnfant(enfant.id, { cycle })}
            />
          </fieldset>

          <div className="encart encart--info" aria-live="polite">
            <div className="encart__titre">{t('enfant.scolariseA', { site: site.nom })}</div>
            {t('assistant.enregistre')}
          </div>
        </section>
      ),
    },

    // 2. Le domicile, avec le résultat du calcul montré en direct : c'est la seule
    //    façon de faire vérifier une adresse par quelqu'un qui connaît son village.
    {
      cle: 'adresse',
      titre: t('assistant.titreAdresse', { prenom }),
      pretePourLaSuite: foyer.adresse !== null,
      obstacle: t('assistant.obstacleAdresse'),
      contenu: (
        <section className="carte pile">
          {adressePartagee ? (
            <div className="pile pile--serre">
              <span className="etiquette">{t('adresse.choisie')}</span>
              <strong className="titre-carte">
                {foyer.adresse
                  ? `${foyer.adresse.libelle}, ${foyer.adresse.localite}`
                  : t('adresse.placeholder')}
              </strong>
              <p className="champ__aide">{t('adresse.partageeFratrie')}</p>
              <Link to="/configurer">{t('adresse.modifierPourTous')}</Link>
            </div>
          ) : (
            <ChampAdresse valeur={foyer.adresse} onChoisir={definirAdresse} />
          )}

          {ctx && !ctx.marcheDirecte && (
            <div className="pile pile--serre" aria-live="polite">
              <span className="etiquette">{t('enfant.arretLePlusProche')}</span>
              <strong className="titre-carte">{nomArret(ctx.arretDomicile, t)}</strong>
              <p className="champ__aide">
                {t('enfant.tempsMarcheEstimation', { minutes: ctx.temps })} ·{' '}
                {distanceLisible(ctx.distance)}
              </p>
              {foyer.adresse && (
                <CarteTrajet depuis={foyer.adresse.coord} vers={ctx.arretDomicile} />
              )}
            </div>
          )}

          {ctx?.marcheDirecte && (
            <div className="encart encart--info" aria-live="polite">
              <div className="encart__titre">{t('enfant.aPied')}</div>
              {t('enfant.aPiedDetail', {
                minutes: ctx.temps,
                site: site.nom,
                prenom,
              })}
            </div>
          )}

          {foyer.adresse && !ctx && (
            <div className="encart encart--alerte">{t('enfant.aucunArret')}</div>
          )}
        </section>
      ),
    },

    // 3, 4, 5. La journée, dans l'ordre où elle se vit. Chaque écran pose une seule
    //    question et montre aussitôt les heures qu'elle produit.
    {
      cle: 'matin',
      titre: t('assistant.titreMatin'),
      contenu: (
        <div className="carte">
          <SectionMatin enfant={enfant} />
        </div>
      ),
    },
    {
      cle: 'midi',
      titre: t('assistant.titreMidi'),
      contenu: (
        <div className="carte">
          <SectionMidi enfant={enfant} />
        </div>
      ),
    },
    {
      cle: 'soir',
      titre: t('assistant.titreSoir'),
      contenu: (
        <div className="carte">
          <SectionSoir enfant={enfant} />
        </div>
      ),
    },

    // 6. Le résultat. La seule étape qui ne demande rien : elle rend compte de ce que
    //    le parent a répondu, PUIS de ce que l'application en tire. Le récapitulatif
    //    des réponses est le seul endroit où l'on peut vérifier « j'ai bien dit qu'il
    //    mange à la maison le mercredi » sans relire cinq écrans.
    {
      cle: 'recapitulatif',
      titre: t('assistant.titreRecapitulatif', { prenom }),
      contenu: (
        <div className="pile pile--large">
          <section className="pile pile--serre">
            <h3 className="titre-carte">{t('recapitulatif.reponses')}</h3>
            {semaineReglee(enfant).map((journee) => (
              <div className="carte pile pile--serre" key={journee.jour}>
                <h4 className="titre-carte">{t(`jours.${journee.jour}`)}</h4>
                <dl className="recapitulatif">
                  <dt>{t('moments.matin')}</dt>
                  <dd>
                    {t(`matin.${journee.matin}Court`)}
                    {journee.heureMatin && ` · ${journee.heureMatin}`}
                    {journee.adresses.matin && ` · ${journee.adresses.matin}`}
                  </dd>

                  {journee.midi && (
                    <>
                      <dt>{t('moments.midi')}</dt>
                      <dd>
                        {t(`midi.${journee.midi}Court`)}
                        {journee.adresses.midi && ` · ${journee.adresses.midi}`}
                      </dd>
                    </>
                  )}

                  <dt>{t('moments.soir')}</dt>
                  <dd>
                    {t(`soir.${journee.soir}Court`)}
                    {journee.heureSoir && ` · ${journee.heureSoir}`}
                    {journee.adresses.soir && ` · ${journee.adresses.soir}`}
                  </dd>
                </dl>
              </div>
            ))}

            <div className="rangee">
              {(['matin', 'midi', 'soir'] as const).map((moment) => (
                <button
                  key={moment}
                  type="button"
                  className="bouton bouton--discret"
                  onClick={() => setIndice(ETAPE_DU_MOMENT[moment])}
                >
                  {t('recapitulatif.modifier', { moment: t(`moments.${moment}`) })}
                </button>
              ))}
            </div>
          </section>

          <section className="pile pile--serre">
            <h3 className="titre-carte">{t('recapitulatif.semaine')}</h3>
            {ctx ? (
              semaineEnfant(ctx).map((journee) => (
                <div className="carte pile pile--serre" key={journee.jour}>
                  <h4 className="titre-carte">{t(`jours.${journee.jour}`)}</h4>
                  <JourneeTrajets journee={journee} />
                </div>
              ))
            ) : (
              <div className="encart encart--alerte">{t('enfant.aucunArret')}</div>
            )}
          </section>

          <p className="champ__aide">
            <Link to="/configurer">{t('assistant.reglageFin')}</Link>
          </p>
        </div>
      ),
    },
  ]

  return (
    <Assistant
      etapes={etapes}
      indice={Math.min(indice, etapes.length - 1)}
      onIndice={setIndice}
      fin={
        <button
          type="button"
          className="bouton bouton--primaire"
          onClick={() => naviguer(`/enfant/${enfant.id}`)}
        >
          {t('assistant.terminer')}
        </button>
      }
    />
  )
}
