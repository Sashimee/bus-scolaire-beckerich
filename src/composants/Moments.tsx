import { useState } from 'react'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { ChampAdresse } from './ChampAdresse'
import { ChoixSemaine, HeureSemaine, type OptionChoix } from './ChoixSemaine'
import { coursApresMidi, trajetsDuJour } from '../lib/plan'
import { nomArret, sensTrajet } from '../lib/affichage'
import { maisonRelais, plan } from '../lib/donnees'
import {
  JOURS_MIDI,
  adresseProposable,
  borneMatin,
  borneSoir,
  heureMatin,
  heureSoir,
  matinDuJour,
  midiDuJour,
  optionsMatin,
  optionsSoir,
  soirDuJour,
  type ChoixMatin,
  type ChoixMidi,
  type ChoixSoir,
  type Moment,
} from '../lib/moments'
import type { Enfant, SensAdresse, TypeTrajet } from '../lib/types'
import { JOURS } from '../lib/types'

/**
 * Les réglages d'un enfant, en trois moments de sa journée.
 *
 * Ils étaient organisés par champ — une grille pour le repas, une pour le bus, deux
 * pour les heures de présence, une dernière pour les adresses — soit cinq grilles de
 * cinq jours qu'il fallait accorder entre elles de tête. Un parent qui dépose son
 * enfant à la maison relais le lundi devait le dire à trois endroits différents, sans
 * que rien ne l'annonce.
 *
 * Chaque section pose maintenant UNE question — le matin, le midi, la fin de journée —
 * et écrit d'un seul geste tout ce que la réponse implique (voir `src/lib/moments.ts`).
 * `/configurer` les empile pour le réglage fin, l'assistant les présente une par écran.
 * Une seule définition, donc aucune dérive possible entre les deux.
 */

/** Les trajets que chaque moment produit, pour l'aperçu de ce qui a été réglé. */
const TRAJETS_DU_MOMENT: Record<Moment, readonly TypeTrajet[]> = {
  matin: ['aller-matin', 'navette-dillendapp-matin'],
  midi: [
    'retour-midi',
    'navette-dillendapp-midi',
    'aller-apres-midi',
    'navette-dillendapp-retour',
  ],
  soir: ['retour-soir', 'retour-soir-dillendapp'],
}

/**
 * Ce que la réponse produit, jour par jour, en heures réelles.
 *
 * C'est la pièce qui manquait : le parent réglait à l'aveugle et n'apprenait qu'au
 * bout de l'assistant si son enfant avait un bus. Ici l'heure apparaît sous la
 * question, à la seconde où l'on répond, et un déplacement que le plan ne couvre pas
 * se dit à l'endroit où on vient de le décrire.
 */
function ApercuMoment({ enfant, moment }: { enfant: Enfant; moment: Moment }) {
  const { t } = useT()
  const { contextes } = useFoyer()
  const ctx = contextes.get(enfant.id) ?? null
  if (!ctx || ctx.marcheDirecte) return null

  const lignes = JOURS.map((jour) => {
    const journee = trajetsDuJour(ctx, jour)
    const types = TRAJETS_DU_MOMENT[moment]
    return {
      jour,
      trajets: journee.trajets.filter((tr) => types.includes(tr.type)),
      manquants: journee.manquants.filter((m) => types.includes(m)),
      depose: moment === 'matin' ? (journee.depose?.heure ?? null) : null,
      recuperation: moment === 'soir' ? (journee.recuperation?.heure ?? null) : null,
    }
  })

  return (
    <section className="carte carte--accent pile pile--serre">
      <h3 className="titre-carte">{t('apercu.titre')}</h3>
      <ul className="liste-nue pile pile--serre">
        {lignes.map((l) => (
          <li key={l.jour} className="rangee rangee--espacee">
            <span className="texte-fort">{t(`jours.${l.jour}`)}</span>
            <span className="rangee">
              {l.depose && (
                <span className="etiquette etiquette--souple">
                  {t('dillendapp.aDeposer')} · {l.depose}
                </span>
              )}
              {l.trajets.map((tr) => (
                <span className="etiquette etiquette--heure" key={tr.type + tr.serviceId}>
                  {(sensTrajet(tr.type) === 'retour' ? tr.arrivee.heure : tr.depart.heure) ?? '—'}
                </span>
              ))}
              {l.recuperation && (
                <span className="etiquette etiquette--souple">
                  {t('dillendapp.aRecuperer')} · {l.recuperation}
                </span>
              )}
              {l.manquants.length > 0 && (
                <span className="etiquette etiquette--danger">{t('apercu.manquant')}</span>
              )}
              {!l.depose &&
                !l.recuperation &&
                !l.trajets.length &&
                !l.manquants.length && <span className="champ__aide">{t('apercu.rien')}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="champ__aide">{t('apercu.aide')}</p>
    </section>
  )
}

/**
 * Les jours où l'enfant part — ou revient — ailleurs qu'au domicile.
 *
 * Les quinze champs d'adresse formaient autrefois un écran à eux seuls, posé après
 * toutes les autres questions et sans rapport visible avec elles. Chaque moment porte
 * désormais les siens, et seulement pour les jours où ils veulent dire quelque chose :
 * un enfant déposé à la maison relais le lundi matin ne part de nulle part ailleurs ce
 * matin-là, la question ne lui est donc pas posée.
 */
function AdressesMoment({ enfant, sens }: { enfant: Enfant; sens: SensAdresse }) {
  const { t } = useT()
  const { definirAdresseJour } = useFoyer()
  const [ouvert, setOuvert] = useState(false)

  const jours = JOURS.filter((j) => adresseProposable(enfant, j, sens))
  const declarees = JOURS.filter((j) => enfant.adresses?.[j]?.[sens])
  if (!jours.length && !declarees.length) return null

  // Une adresse déjà déclarée rouvre le bloc d'elle-même : repliée, elle serait un
  // réglage actif que rien n'annonce.
  if (!ouvert && !declarees.length) {
    return (
      <div className="pile pile--serre">
        <p className="champ__aide">{t(`adresseMoment.${sens}Defaut`)}</p>
        <div>
          <button type="button" className="bouton bouton--discret" onClick={() => setOuvert(true)}>
            {t(`adresseMoment.${sens}Ouvrir`)}
          </button>
        </div>
      </div>
    )
  }

  return (
    <fieldset className="fieldset-nu pile pile--serre">
      <legend className="legende">{t(`adresseMoment.${sens}Titre`)}</legend>
      <p className="champ__aide">{t(`adresseMoment.${sens}Aide`)}</p>
      {jours.map((jour) => (
        <ChampAdresse
          key={jour}
          compact
          libelle={t(`jours.${jour}`)}
          valeur={enfant.adresses?.[jour]?.[sens] ?? null}
          onChoisir={(a) => definirAdresseJour(enfant.id, jour, sens, a)}
          onEffacer={
            enfant.adresses?.[jour]?.[sens]
              ? () => definirAdresseJour(enfant.id, jour, sens, null)
              : undefined
          }
        />
      ))}
    </fieldset>
  )
}

/** L'école est l'arrêt le plus proche : il n'y a aucun bus à régler. */
function APied({ enfant }: { enfant: Enfant }) {
  const { t } = useT()
  const { contextes } = useFoyer()
  const ctx = contextes.get(enfant.id) ?? null
  if (!ctx?.marcheDirecte) return null
  return (
    <div className="encart encart--info">
      <div className="encart__titre">{t('enfant.aPied')}</div>
      {t('moments.aPiedAide')}
    </div>
  )
}

/* ------------------------------------------------------------------- le matin */

export function SectionMatin({ enfant }: { enfant: Enfant }) {
  const { t } = useT()
  const { contextes, definirMatin, definirHeureMatin } = useFoyer()
  const ctx = contextes.get(enfant.id) ?? null
  const prenom = enfant.prenom.trim() || t('enfant.sansPrenom')

  if (ctx?.marcheDirecte) return <APied enfant={enfant} />

  const arret = ctx ? nomArret(ctx.arretDomicile, t) : null
  const options: OptionChoix<ChoixMatin>[] = [
    {
      valeur: 'bus',
      libelle: t('matin.bus'),
      court: t('matin.busCourt'),
      aide: arret ? t('matin.busAideArret', { arret }) : t('matin.busAide'),
    },
    {
      valeur: 'voiture',
      libelle: t('matin.voiture'),
      court: t('matin.voitureCourt'),
      aide: t('matin.voitureAide'),
    },
    {
      valeur: 'relais',
      libelle: t('matin.relais'),
      court: t('matin.relaisCourt'),
      aide: t('matin.relaisAide', { relais: maisonRelais.nom }),
    },
  ]

  const deposes = JOURS.filter((j) => heureMatin(enfant, j))

  return (
    <section className="pile">
      <ChoixSemaine
        id={`${enfant.id}-matin`}
        legende={t('matin.question', { prenom })}
        jours={JOURS}
        options={options}
        optionsDuJour={(jour) => optionsMatin(ctx, jour)}
        valeurDuJour={(jour) => matinDuJour(enfant, jour)}
        onRepondre={(jours, choix) => definirMatin(enfant.id, jours, choix)}
      />

      <HeureSemaine
        id={`${enfant.id}-heure-matin`}
        legende={t('heure.matin')}
        jours={deposes}
        heureDuJour={(jour) => heureMatin(enfant, jour)}
        borneDuJour={(jour) => borneMatin(ctx, jour)}
        onHeure={(jours, heure) => definirHeureMatin(enfant.id, jours, heure)}
      />

      <AdressesMoment enfant={enfant} sens="matin" />
      <ApercuMoment enfant={enfant} moment="matin" />
    </section>
  )
}

/* -------------------------------------------------------------------- le midi */

export function SectionMidi({ enfant }: { enfant: Enfant }) {
  const { t } = useT()
  const { contextes, definirMidi } = useFoyer()
  const ctx = contextes.get(enfant.id) ?? null
  const prenom = enfant.prenom.trim() || t('enfant.sansPrenom')

  if (ctx?.marcheDirecte) return <APied enfant={enfant} />

  const options: OptionChoix<ChoixMidi>[] = [
    {
      valeur: 'maison',
      libelle: t('midi.maison'),
      court: t('midi.maisonCourt'),
      aide: t('midi.maisonAide', { heure: plan.horairesEcole.apresMidi.debut }),
    },
    {
      valeur: 'relais',
      libelle: t('midi.relais'),
      court: t('midi.relaisCourt'),
      aide: t('midi.relaisAide', { relais: maisonRelais.nom }),
    },
  ]

  // Les jours sans cours l'après-midi ne sont pas dans la grille : la classe s'y
  // arrête à 11:45 et c'est la question suivante qui décide du repas. Le dire, plutôt
  // que de laisser croire à un oubli.
  const sansApresMidi = JOURS.filter((j) => !coursApresMidi(j))

  return (
    <section className="pile">
      <ChoixSemaine
        id={`${enfant.id}-midi`}
        legende={t('midi.question', { prenom })}
        jours={JOURS_MIDI}
        options={options}
        valeurDuJour={(jour) => midiDuJour(enfant, jour)}
        onRepondre={(jours, choix) => definirMidi(enfant.id, jours, choix)}
      />

      <p className="champ__aide">
        {t('midi.sansApresMidi', {
          jours: sansApresMidi.map((j) => t(`jours.${j}`)).join(' · '),
          heure: plan.horairesEcole.matin.fin,
        })}
      </p>

      <AdressesMoment enfant={enfant} sens="midi" />
      <ApercuMoment enfant={enfant} moment="midi" />
    </section>
  )
}

/* -------------------------------------------------------------------- le soir */

export function SectionSoir({ enfant }: { enfant: Enfant }) {
  const { t } = useT()
  const { contextes, definirSoir, definirHeureSoir } = useFoyer()
  const ctx = contextes.get(enfant.id) ?? null
  const prenom = enfant.prenom.trim() || t('enfant.sansPrenom')

  if (ctx?.marcheDirecte) return <APied enfant={enfant} />

  const options: OptionChoix<ChoixSoir>[] = [
    { valeur: 'bus', libelle: t('soir.bus'), court: t('soir.busCourt'), aide: t('soir.busAide') },
    {
      valeur: 'voiture',
      libelle: t('soir.voiture'),
      court: t('soir.voitureCourt'),
      aide: t('soir.voitureAide'),
    },
    {
      valeur: 'relais',
      libelle: t('soir.relais'),
      court: t('soir.relaisCourt'),
      aide: t('soir.relaisAide', { relais: maisonRelais.nom }),
    },
  ]

  const recuperes = JOURS.filter((j) => heureSoir(enfant, j))

  return (
    <section className="pile">
      <ChoixSemaine
        id={`${enfant.id}-soir`}
        legende={t('soir.question', { prenom })}
        jours={JOURS}
        options={options}
        optionsDuJour={(jour) => optionsSoir(ctx, jour)}
        valeurDuJour={(jour) => soirDuJour(enfant, jour)}
        onRepondre={(jours, choix) => definirSoir(enfant.id, jours, choix)}
        // La règle a déjà été appliquée : reste à dire pourquoi le repas de midi a
        // changé tout seul ce jour-là.
        noteDuJour={(jour) =>
          !coursApresMidi(jour) && soirDuJour(enfant, jour) === 'relais'
            ? t('dillendapp.midiObligatoire')
            : null
        }
      />

      <HeureSemaine
        id={`${enfant.id}-heure-soir`}
        legende={t('heure.soir')}
        jours={recuperes}
        heureDuJour={(jour) => heureSoir(enfant, jour)}
        borneDuJour={(jour) => borneSoir(ctx, jour)}
        onHeure={(jours, heure) => definirHeureSoir(enfant.id, jours, heure)}
      />

      <AdressesMoment enfant={enfant} sens="soir" />
      <ApercuMoment enfant={enfant} moment="soir" />
    </section>
  )
}

/** Les trois moments empilés, pour le réglage fin depuis `/configurer`. */
export function MomentsSemaine({ enfant }: { enfant: Enfant }) {
  const { t } = useT()
  return (
    <div className="pile pile--large">
      {(['matin', 'midi', 'soir'] as const).map((moment) => (
        <div className="pile pile--serre" key={moment}>
          <h4 className="titre-carte">{t(`moments.${moment}`)}</h4>
          {moment === 'matin' && <SectionMatin enfant={enfant} />}
          {moment === 'midi' && <SectionMidi enfant={enfant} />}
          {moment === 'soir' && <SectionSoir enfant={enfant} />}
        </div>
      ))}
    </div>
  )
}
