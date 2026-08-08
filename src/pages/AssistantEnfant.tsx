import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { Assistant, type Etape } from '../composants/Assistant'
import { CarteTrajet } from '../composants/CarteTrajet'
import { ChampAdresse } from '../composants/ChampAdresse'
import {
  CasesPeriscolaire,
  HorairesPeriscolaire,
  SectionAdresses,
  SectionBus,
  SectionRepas,
  estPeriscolaireHorsMidi,
  estPeriscolaireMidi,
} from '../composants/GrilleSemaine'
import { JourneeTrajets } from '../composants/Trajets'
import { semaineEnfant } from '../lib/plan'
import { distanceLisible, nomArret } from '../lib/affichage'
import { siteDuCycle } from '../lib/donnees'
import type { Cycle } from '../lib/types'

const CYCLES: Cycle[] = ['precoce', 'c1', 'c2', 'c3', 'c4']

/** Enfant, adresse, bus, Dillendapp, horaires, adresses, récapitulatif. */
const ETAPES_MAX = 7

/**
 * Configuration d'un enfant, une question par écran.
 *
 * Vient en complément de `/configurer`, qui reste la vue dense pour corriger un
 * détail. L'assistant s'adresse au parent qui découvre l'application : il ne montre
 * qu'une décision à la fois et affiche aussitôt ce qu'elle change — le site scolaire
 * déduit, l'arrêt calculé, la semaine obtenue.
 *
 * Aucun brouillon : chaque réponse est écrite immédiatement par les mêmes actions que
 * `/configurer`. Il n'y a donc pas de bouton « annuler », rien à valider, et quitter
 * l'assistant en cours de route ne perd rien.
 */
export function AssistantEnfant() {
  const { t } = useT()
  const { id } = useParams()
  const naviguer = useNavigate()
  const {
    foyer,
    contextes,
    definirAdresse,
    modifierEnfant,
    definirRepas,
    definirRepasSemaine,
    definirBus,
    definirBusSemaine,
    definirPeriscolaireMidi,
    definirPeriscolaireHorsMidi,
    definirDillendappDepuis,
    definirDillendappJusqua,
    definirAdresseJour,
  } = useFoyer()
  const [indice, setIndice] = useState(0)

  const enfant = foyer.enfants.find((e) => e.id === id)
  if (!enfant) return <p>{t('enfant.aucun')}</p>

  const ctx = contextes.get(enfant.id) ?? null
  const site = siteDuCycle(enfant.cycle)
  const periscolaireMidi = estPeriscolaireMidi(enfant)
  const periscolaireHorsMidi = estPeriscolaireHorsMidi(enfant)
  // L'adresse est celle du FOYER : la modifier ici la déplacerait pour toute la
  // fratrie, sans que rien ne le dise. Dès le deuxième enfant, l'assistant la montre
  // sans permettre d'y toucher, et renvoie à l'écran qui la règle pour tout le monde.
  const adressePartagee = foyer.enfants.length > 1

  const etapes: Etape[] = [
    // 1. Qui est l'enfant. Le site scolaire se déduit du cycle : le montrer aussitôt
    //    évite au parent de se demander s'il a bien répondu.
    {
      cle: 'enfant',
      pretePourLaSuite: enfant.prenom.trim().length > 0,
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

          <div className="champ">
            <label htmlFor="assistant-cycle">{t('enfant.cycle')}</label>
            <select
              id="assistant-cycle"
              value={enfant.cycle}
              onChange={(e) => modifierEnfant(enfant.id, { cycle: e.target.value as Cycle })}
            >
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {t(`cycles.${c}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="encart encart--info" aria-live="polite">
            <div className="encart__titre">{t('enfant.scolariseA', { site: site.nom })}</div>
            {t('enfant.cycleAide')}
          </div>
        </section>
      ),
    },

    // 2. Le domicile, avec le résultat du calcul montré en direct : c'est la seule
    //    façon de faire vérifier une adresse par quelqu'un qui connaît son village.
    {
      cle: 'adresse',
      pretePourLaSuite: foyer.adresse !== null,
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
                prenom: enfant.prenom,
              })}
            </div>
          )}

          {foyer.adresse && !ctx && (
            <div className="encart encart--alerte">{t('enfant.aucunArret')}</div>
          )}
        </section>
      ),
    },

    // 3. Le bus.
    {
      cle: 'bus',
      contenu: (
        <div className="carte">
          <SectionBus
            enfant={enfant}
            onBus={(jour, usage) => definirBus(enfant.id, jour, usage)}
            onBusSemaine={(usage) => definirBusSemaine(enfant.id, usage)}
          />
        </div>
      ),
    },

    // 4. Le Dillendapp. Les deux cases sont posées ici, en tête de l'écran qu'elles
    //    commandent : celle du hors-midi doit rester atteignable même quand l'écran
    //    des horaires est masqué.
    {
      cle: 'midi',
      contenu: (
        <div className="carte pile">
          <CasesPeriscolaire
            enfant={enfant}
            onPeriscolaireMidi={(inscrit) => definirPeriscolaireMidi(enfant.id, inscrit)}
            onPeriscolaireHorsMidi={(inscrit) => definirPeriscolaireHorsMidi(enfant.id, inscrit)}
          />
          <SectionRepas
            enfant={enfant}
            onRepas={(jour, repas) => definirRepas(enfant.id, jour, repas)}
            onRepasSemaine={(repas) => definirRepasSemaine(enfant.id, repas)}
          />
        </div>
      ),
    },

    // 5. Les heures de présence. Sautée si la case hors-midi reste décochée : il n'y
    //    aurait rien à y régler.
    ...(periscolaireHorsMidi
      ? [
          {
            cle: 'periscolaire',
            contenu: (
              <div className="carte">
                <HorairesPeriscolaire
                  enfant={enfant}
                  ctx={ctx}
                  onDillendappDepuis={(jour, heure) =>
                    definirDillendappDepuis(enfant.id, jour, heure)
                  }
                  onDillendappJusqua={(jour, heure) =>
                    definirDillendappJusqua(enfant.id, jour, heure)
                  }
                />
              </div>
            ),
          } satisfies Etape,
        ]
      : []),

    // 6. Les adresses particulières. La question se pose pour bien des familles — un
    //    mardi chez les grands-parents, un jeudi chez la nounou — et l'assistant est le
    //    seul endroit où on la POSE ; ailleurs, il faut penser à aller la chercher.
    {
      cle: 'adresses',
      contenu: (
        <div className="carte">
          <SectionAdresses
            enfant={enfant}
            onAdresseJour={(jour, sens, adresse) =>
              definirAdresseJour(enfant.id, jour, sens, adresse)
            }
          />
        </div>
      ),
    },

    // 7. Le résultat. La seule étape qui ne demande rien : elle rend compte, trajets
    //    manquants compris. Agenda, impression et partage sont sur la fiche, au clic
    //    suivant : les répéter ici ferait doublon.
    {
      cle: 'recapitulatif',
      contenu: ctx ? (
        <div className="pile">
          {semaineEnfant(ctx).map((journee) => (
            <section className="carte pile pile--serre" key={journee.jour}>
              <div className="rangee rangee--espacee">
                <h3 className="titre-carte">{t(`jours.${journee.jour}`)}</h3>
                <span className="rangee">
                  {periscolaireMidi && (
                    <span className="etiquette">
                      {t(`repas.${enfant.repas[journee.jour]}Court`)}
                    </span>
                  )}
                  {(enfant.bus?.[journee.jour] ?? 'aller-retour') !== 'aller-retour' && (
                    <span className="etiquette">
                      {t(`bus.${enfant.bus?.[journee.jour] ?? 'aller-retour'}Court`)}
                    </span>
                  )}
                </span>
              </div>
              {(enfant.bus?.[journee.jour] ?? 'aller-retour') === 'aucun' ? (
                <p className="champ__aide">{t('bus.sansBus')}</p>
              ) : (
                <JourneeTrajets journee={journee} />
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="encart encart--alerte">{t('enfant.aucunArret')}</div>
      ),
    },
  ]

  return (
    <>
      <p className="champ__aide">
        <Link to="/configurer">{t('assistant.reglageFin')}</Link>
      </p>

      <Assistant
        etapes={etapes}
        // L'étape des horaires disparaît quand la case est décochée : l'indice courant
        // doit suivre, sinon le parent se retrouve devant un écran vide. Le total, lui,
        // reste celui de l'assistant complet : voir la prop `total`.
        indice={Math.min(indice, etapes.length - 1)}
        onIndice={setIndice}
        total={ETAPES_MAX}
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
    </>
  )
}
