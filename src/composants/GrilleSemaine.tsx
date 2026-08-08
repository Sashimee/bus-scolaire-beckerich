import { useT } from '../i18n'
import { coursApresMidi } from '../lib/plan'
import { ChampAdresse } from './ChampAdresse'
import type { Adresse, Enfant, Jour, RepasMidi, UsageBus } from '../lib/types'
import { JOURS, USAGES_BUS } from '../lib/types'

/**
 * Réglages hebdomadaires d'un enfant, en quatre sections indépendantes.
 *
 * Chaque section s'exporte séparément : `/configurer` les empile pour le réglage fin,
 * l'assistant (`/enfant/:id/assistant`) les présente une par écran. Une seule
 * définition, donc aucun risque qu'une case cochée d'un côté n'existe pas de l'autre.
 *
 * Toutes écrivent directement dans `etat.tsx` — pas de brouillon, pas de « valider ».
 */

/** L'enfant est-il inscrit au périscolaire ? Déduit des repas si le réglage est absent. */
export function estPeriscolaire(enfant: Enfant): boolean {
  return enfant.periscolaire ?? JOURS.some((j) => enfant.repas[j] === 'dillendapp')
}

/** Un jour de la grille, avec la mention des jours sans cours l'après-midi. */
function NomDuJour({ jour, id }: { jour: Jour; id?: string }) {
  const { t } = useT()
  return (
    <span className="grille-semaine__nom" id={id}>
      {t(`jours.${jour}`)}
      {!coursApresMidi(jour) && <small>{t('repas.sansCoursApresMidi')}</small>}
    </span>
  )
}

/**
 * Raccourci « toute la semaine ».
 *
 * Ce sont des actions et non un état — pas d'`aria-pressed` : la grille au-dessus
 * reste la source de vérité. Le libellé occupe sa propre ligne, sans quoi il pousse
 * les boutons hors de l'écran sur un téléphone.
 */
function RaccourciSemaine<T extends string>({
  id,
  legende,
  options,
  libelle,
  onChoisir,
}: {
  id: string
  legende: string
  options: readonly T[]
  libelle: (o: T) => string
  onChoisir: (o: T) => void
}) {
  return (
    <fieldset className="fieldset-nu">
      <legend className="legende" id={id}>
        {legende}
      </legend>
      <div className="segments" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onChoisir(o)}>
            {libelle(o)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

const REPAS = ['maison', 'dillendapp'] as const

/** 1. Où l'enfant déjeune, jour par jour. Sans périscolaire, il n'y a rien à régler. */
export function SectionRepas({
  enfant,
  onRepas,
  onRepasSemaine,
}: {
  enfant: Enfant
  onRepas: (jour: Jour, repas: RepasMidi) => void
  onRepasSemaine: (repas: RepasMidi) => void
}) {
  const { t } = useT()
  const periscolaire = estPeriscolaire(enfant)

  return (
    <section className="pile pile--serre">
      <fieldset className="fieldset-nu">
        <legend className="legende">{t('repas.titre')}</legend>
        <p className="champ__aide">
          {periscolaire ? t('repas.aide') : t('repas.sansPeriscolaire')}
        </p>
      </fieldset>

      {periscolaire && (
        <>
          <div className="grille-semaine">
            {JOURS.map((jour) => (
              <div className="grille-semaine__jour grille-semaine__jour--simple" key={jour}>
                <NomDuJour jour={jour} id={`${enfant.id}-repas-${jour}`} />
                <div className="bascule" role="group" aria-labelledby={`${enfant.id}-repas-${jour}`}>
                  {REPAS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={enfant.repas[jour] === option}
                      onClick={() => onRepas(jour, option)}
                    >
                      {t(`repas.${option}Court`)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <RaccourciSemaine
            id={`${enfant.id}-repas-semaine`}
            legende={t('repas.touteLaSemaine')}
            options={REPAS}
            libelle={(o) => t(`repas.${o}Court`)}
            onChoisir={onRepasSemaine}
          />
        </>
      )}
    </section>
  )
}

/** 2. Dans quelle mesure l'enfant prend le bus, jour par jour. */
export function SectionBus({
  enfant,
  onBus,
  onBusSemaine,
}: {
  enfant: Enfant
  onBus: (jour: Jour, usage: UsageBus) => void
  onBusSemaine: (usage: UsageBus) => void
}) {
  const { t } = useT()

  return (
    <section className="pile pile--serre">
      <fieldset className="fieldset-nu">
        <legend className="legende">{t('bus.titre')}</legend>
        <p className="champ__aide">{t('bus.aide')}</p>
      </fieldset>

      <div className="grille-semaine">
        {JOURS.map((jour) => (
          <div className="grille-semaine__jour grille-semaine__jour--simple" key={jour}>
            <NomDuJour jour={jour} />
            <div className="champ">
              <label className="visuellement-cache" htmlFor={`${enfant.id}-bus-${jour}`}>
                {t('bus.pourJour', { jour: t(`jours.${jour}`) })}
              </label>
              <select
                id={`${enfant.id}-bus-${jour}`}
                value={enfant.bus?.[jour] ?? 'aller-retour'}
                onChange={(e) => onBus(jour, e.target.value as UsageBus)}
              >
                {USAGES_BUS.map((u) => (
                  <option key={u} value={u}>
                    {t(`bus.${u}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <RaccourciSemaine
        id={`${enfant.id}-bus-semaine`}
        legende={t('bus.touteLaSemaine')}
        options={USAGES_BUS}
        libelle={(u) => t(`bus.${u}Court`)}
        onChoisir={onBusSemaine}
      />
    </section>
  )
}

/**
 * La case d'inscription, séparée de ses horaires.
 *
 * C'est elle qui commande la grille des repas autant que celle des présences : elle
 * doit donc pouvoir être posée en tête de l'un ou l'autre écran de l'assistant.
 */
export function CasePeriscolaire({
  enfant,
  onPeriscolaire,
}: {
  enfant: Enfant
  onPeriscolaire: (inscrit: boolean) => void
}) {
  const { t } = useT()

  return (
    <label className="case" htmlFor={`${enfant.id}-periscolaire`}>
      <input
        id={`${enfant.id}-periscolaire`}
        type="checkbox"
        checked={estPeriscolaire(enfant)}
        onChange={(e) => onPeriscolaire(e.target.checked)}
      />
      <span>
        <span className="texte-fort">{t('dillendapp.inscription')}</span>
        <span className="champ__aide">{t('dillendapp.inscriptionAide')}</span>
      </span>
    </label>
  )
}

/** Les heures de présence de part et d'autre de la classe, jour par jour. */
export function HorairesPeriscolaire({
  enfant,
  onDillendappDepuis,
  onDillendappJusqua,
}: {
  enfant: Enfant
  onDillendappDepuis: (jour: Jour, heure: string | null) => void
  onDillendappJusqua: (jour: Jour, heure: string | null) => void
}) {
  const { t } = useT()

  return (
    <div className="pile pile--serre">
      <div className="grille-semaine">
        {JOURS.map((jour) => (
          <div className="grille-semaine__jour grille-semaine__jour--horaires" key={jour}>
            <NomDuJour jour={jour} />
            <div className="champ">
              <label htmlFor={`${enfant.id}-debut-${jour}`}>{t('dillendapp.depuis')}</label>
              <input
                id={`${enfant.id}-debut-${jour}`}
                type="time"
                step={300}
                value={enfant.dillendappDepuis?.[jour] ?? ''}
                onChange={(e) => onDillendappDepuis(jour, e.target.value || null)}
              />
            </div>
            <div className="champ">
              <label htmlFor={`${enfant.id}-fin-${jour}`}>{t('dillendapp.jusqua')}</label>
              <input
                id={`${enfant.id}-fin-${jour}`}
                type="time"
                step={300}
                value={enfant.dillendappJusqua?.[jour] ?? ''}
                onChange={(e) => onDillendappJusqua(jour, e.target.value || null)}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="champ__aide">{t('dillendapp.aideDepuis')}</p>
      <p className="champ__aide">{t('dillendapp.aide')}</p>
    </div>
  )
}

/** 3. L'inscription au périscolaire et ses horaires, d'un bloc. */
export function SectionPeriscolaire({
  enfant,
  onPeriscolaire,
  onDillendappDepuis,
  onDillendappJusqua,
}: {
  enfant: Enfant
  onPeriscolaire: (inscrit: boolean) => void
  onDillendappDepuis: (jour: Jour, heure: string | null) => void
  onDillendappJusqua: (jour: Jour, heure: string | null) => void
}) {
  return (
    <section className="pile pile--serre">
      <CasePeriscolaire enfant={enfant} onPeriscolaire={onPeriscolaire} />
      {estPeriscolaire(enfant) && (
        <HorairesPeriscolaire
          enfant={enfant}
          onDillendappDepuis={onDillendappDepuis}
          onDillendappJusqua={onDillendappJusqua}
        />
      )}
    </section>
  )
}

/**
 * 4. Adresses dérogatoires, jour par jour et sens par sens.
 *
 * Repliée par défaut sur `/configurer` : la quasi-totalité des familles n'a qu'un
 * domicile, et cette grille de dix champs n'a pas à se mettre en travers du réglage
 * courant. L'assistant, lui, l'affiche dépliée sur son propre écran.
 */
export function SectionAdresses({
  enfant,
  onAdresseJour,
  repliee = false,
}: {
  enfant: Enfant
  onAdresseJour: (jour: Jour, sens: 'matin' | 'soir', adresse: Adresse | null) => void
  repliee?: boolean
}) {
  const { t } = useT()

  const corps = (
    <div className="pile">
      <p className="champ__aide">{t('adresseJour.aide')}</p>

      {JOURS.map((jour) => {
        const duJour = enfant.adresses?.[jour]
        return (
          <fieldset className="fieldset-nu pile pile--serre" key={jour}>
            <legend className="legende rangee">
              <span>{t(`jours.${jour}`)}</span>
              {!duJour?.matin && !duJour?.soir && (
                <span className="etiquette">{t('adresseJour.domicile')}</span>
              )}
            </legend>

            {(['matin', 'soir'] as const).map((sens) => (
              <ChampAdresse
                key={sens}
                compact
                libelle={t(`adresseJour.${sens}`)}
                valeur={duJour?.[sens] ?? null}
                onChoisir={(a) => onAdresseJour(jour, sens, a)}
                onEffacer={duJour?.[sens] ? () => onAdresseJour(jour, sens, null) : undefined}
              />
            ))}
          </fieldset>
        )
      })}
    </div>
  )

  if (!repliee) return <section className="pile pile--serre">{corps}</section>

  return (
    <details className="repli carte">
      <summary>{t('adresseJour.titre')}</summary>
      {corps}
    </details>
  )
}

interface Props {
  enfant: Enfant
  onRepas: (jour: Jour, repas: RepasMidi) => void
  onRepasSemaine: (repas: RepasMidi) => void
  onBus: (jour: Jour, usage: UsageBus) => void
  onBusSemaine: (usage: UsageBus) => void
  onPeriscolaire: (inscrit: boolean) => void
  onDillendappDepuis: (jour: Jour, heure: string | null) => void
  onDillendappJusqua: (jour: Jour, heure: string | null) => void
  onAdresseJour: (jour: Jour, sens: 'matin' | 'soir', adresse: Adresse | null) => void
}

/** Les quatre sections empilées, pour le réglage fin depuis `/configurer`. */
export function GrilleSemaine(p: Props) {
  return (
    <div className="pile">
      <SectionRepas enfant={p.enfant} onRepas={p.onRepas} onRepasSemaine={p.onRepasSemaine} />
      <SectionBus enfant={p.enfant} onBus={p.onBus} onBusSemaine={p.onBusSemaine} />
      <SectionPeriscolaire
        enfant={p.enfant}
        onPeriscolaire={p.onPeriscolaire}
        onDillendappDepuis={p.onDillendappDepuis}
        onDillendappJusqua={p.onDillendappJusqua}
      />
      <SectionAdresses enfant={p.enfant} onAdresseJour={p.onAdresseJour} repliee />
    </div>
  )
}
