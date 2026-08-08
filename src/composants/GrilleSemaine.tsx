import { useT } from '../i18n'
import {
  bornesDillendapp,
  coursApresMidi,
  deduireInscriptions,
  type BorneHeure,
  type ContexteEnfant,
} from '../lib/plan'
import { maisonRelais } from '../lib/donnees'
import { ChampAdresse } from './ChampAdresse'
import type { Adresse, Enfant, Jour, RepasMidi, SensAdresse, UsageBus } from '../lib/types'
import { JOURS, SENS_ADRESSE, USAGES_BUS } from '../lib/types'

/**
 * Réglages hebdomadaires d'un enfant, en sections indépendantes.
 *
 * Chaque section s'exporte séparément : `/configurer` les empile pour le réglage fin,
 * l'assistant (`/enfant/:id/assistant`) les présente une par écran. Une seule
 * définition, donc aucun risque qu'une case cochée d'un côté n'existe pas de l'autre.
 *
 * Toutes écrivent directement dans `etat.tsx` — pas de brouillon, pas de « valider ».
 */

/** L'enfant déjeune-t-il au Dillendapp ? Déduit si le réglage n'a pas été enregistré. */
export function estPeriscolaireMidi(enfant: Enfant): boolean {
  return deduireInscriptions(enfant).midi
}

/** Est-il au Dillendapp avant la classe ou après l'école ? */
export function estPeriscolaireHorsMidi(enfant: Enfant): boolean {
  return deduireInscriptions(enfant).horsMidi
}

/**
 * Bornes de repli quand aucun contexte n'est disponible — l'adresse du foyer n'est pas
 * encore saisie. On s'en tient alors à l'amplitude de la maison relais, sans rien
 * affirmer sur le plan de bus du cycle.
 */
function bornesDeRepli(): { depuis: BorneHeure; jusqua: BorneHeure } {
  const { ouverture, fermeture } = maisonRelais.horaires
  return {
    depuis: { min: ouverture, max: fermeture, defaut: ouverture },
    jusqua: { min: ouverture, max: fermeture, defaut: fermeture },
  }
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
 * Placé EN TÊTE de section : le régler après avoir vu la grille, c'est régler cinq
 * jours à la main avant de découvrir qu'un bouton faisait tout.
 *
 * Ce sont des actions et non un état — pas d'`aria-pressed` : la grille en dessous
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
  const periscolaire = estPeriscolaireMidi(enfant)

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
          <RaccourciSemaine
            id={`${enfant.id}-repas-semaine`}
            legende={t('repas.touteLaSemaine')}
            options={REPAS}
            libelle={(o) => t(`repas.${o}Court`)}
            onChoisir={onRepasSemaine}
          />

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

      <RaccourciSemaine
        id={`${enfant.id}-bus-semaine`}
        legende={t('bus.touteLaSemaine')}
        options={USAGES_BUS}
        libelle={(u) => t(`bus.${u}Court`)}
        onChoisir={onBusSemaine}
      />

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
    </section>
  )
}

/** Une case d'inscription, séparée de ce qu'elle commande. */
function CaseInscription({
  id,
  cochee,
  libelle,
  aide,
  onChange,
}: {
  id: string
  cochee: boolean
  libelle: string
  aide: string
  onChange: (coche: boolean) => void
}) {
  return (
    <label className="case" htmlFor={id}>
      <input id={id} type="checkbox" checked={cochee} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="texte-fort">{libelle}</span>
        <span className="champ__aide">{aide}</span>
      </span>
    </label>
  )
}

/**
 * Les deux inscriptions au Dillendapp.
 *
 * Elles étaient une seule case, qui commandait à la fois le repas de midi et la
 * présence de part et d'autre de la classe. Or les deux se décident séparément : un
 * enfant peut rentrer déjeuner chez lui et rejoindre la maison relais après l'école.
 */
export function CasesPeriscolaire({
  enfant,
  onPeriscolaireMidi,
  onPeriscolaireHorsMidi,
}: {
  enfant: Enfant
  onPeriscolaireMidi: (inscrit: boolean) => void
  onPeriscolaireHorsMidi: (inscrit: boolean) => void
}) {
  const { t } = useT()

  return (
    <div className="pile pile--serre">
      <CaseInscription
        id={`${enfant.id}-periscolaire-midi`}
        cochee={estPeriscolaireMidi(enfant)}
        libelle={t('dillendapp.inscriptionMidi')}
        aide={t('dillendapp.inscriptionMidiAide')}
        onChange={onPeriscolaireMidi}
      />
      <CaseInscription
        id={`${enfant.id}-periscolaire-hors-midi`}
        cochee={estPeriscolaireHorsMidi(enfant)}
        libelle={t('dillendapp.inscriptionHorsMidi')}
        aide={t('dillendapp.inscriptionHorsMidiAide')}
        onChange={onPeriscolaireHorsMidi}
      />
    </div>
  )
}

/**
 * Un bloc de présence : son explication en tête, puis un jour par ligne.
 *
 * Une case par jour plutôt qu'un champ d'heure vide : sur iPhone, un `input[type=time]`
 * sans valeur n'annonce rien du tout, et deux de ces champs côte à côte se réduisaient
 * à deux rectangles illisibles. Cocher écrit l'heure par défaut, décocher l'efface.
 */
function BlocPresence({
  enfant,
  cle,
  heures,
  borne,
  onHeure,
}: {
  enfant: Enfant
  /** `matin` ou `soir` : sert de titre, d'aide et de préfixe d'identifiant. */
  cle: 'matin' | 'soir'
  heures: Record<Jour, string | null> | undefined
  borne: (jour: Jour) => BorneHeure | null
  onHeure: (jour: Jour, heure: string | null) => void
}) {
  const { t } = useT()
  const titre = cle === 'matin' ? 'dillendapp.blocMatin' : 'dillendapp.blocSoir'
  const aide = cle === 'matin' ? 'dillendapp.blocMatinAide' : 'dillendapp.blocSoirAide'
  const caseLibelle = cle === 'matin' ? 'dillendapp.deposeCase' : 'dillendapp.recupereCase'

  return (
    // Un `fieldset` autour de tout le bloc, et non de son seul titre : les cinq cases
    // forment un groupe, et le lecteur d'écran doit annoncer laquelle des deux
    // présences on règle avant d'énumérer les jours.
    <fieldset className="fieldset-nu pile pile--serre">
      <legend className="legende">{t(titre)}</legend>
      <p className="champ__aide">{t(aide)}</p>

      <div className="grille-semaine">
        {JOURS.map((jour) => {
          const bornes = borne(jour)
          const heure = heures?.[jour] ?? null
          const idCase = `${enfant.id}-${cle}-case-${jour}`
          const idHeure = `${enfant.id}-${cle}-heure-${jour}`

          return (
            <div className="grille-semaine__jour grille-semaine__jour--presence" key={jour}>
              <NomDuJour jour={jour} />
              <label className="case case--compacte" htmlFor={idCase}>
                <input
                  id={idCase}
                  type="checkbox"
                  checked={heure !== null}
                  disabled={!bornes}
                  onChange={(e) => onHeure(jour, e.target.checked ? (bornes?.defaut ?? null) : null)}
                />
                <span className="champ__aide">{t(caseLibelle)}</span>
              </label>

              {heure !== null && bornes && (
                <div className="champ">
                  <label className="visuellement-cache" htmlFor={idHeure}>
                    {t(cle === 'matin' ? 'dillendapp.depuis' : 'dillendapp.jusqua')}
                  </label>
                  <input
                    id={idHeure}
                    type="time"
                    step={300}
                    min={bornes.min}
                    max={bornes.max}
                    value={heure}
                    onChange={(e) => onHeure(jour, e.target.value || null)}
                  />
                  <p className="champ__aide">
                    {t('dillendapp.bornes', { min: bornes.min, max: bornes.max })}
                  </p>
                  {/* La règle a déjà été appliquée par `etat.tsx` : reste à dire
                      pourquoi le repas de midi a changé tout seul. */}
                  {cle === 'soir' && !coursApresMidi(jour) && (
                    <p className="champ__aide">{t('dillendapp.midiObligatoire')}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Les heures de présence de part et d'autre de la classe.
 *
 * En deux blocs distincts, chacun avec sa propre explication en tête : les deux
 * phrases se lisaient auparavant à la suite, sous une grille de dix champs, et rien ne
 * disait laquelle décrivait quelle colonne.
 *
 * Les bornes viennent du plan de bus du cycle. Sans contexte — l'adresse du foyer n'est
 * pas encore saisie — on s'en tient à l'amplitude de la maison relais.
 */
export function HorairesPeriscolaire({
  enfant,
  ctx,
  onDillendappDepuis,
  onDillendappJusqua,
}: {
  enfant: Enfant
  ctx: ContexteEnfant | null
  onDillendappDepuis: (jour: Jour, heure: string | null) => void
  onDillendappJusqua: (jour: Jour, heure: string | null) => void
}) {
  const repli = bornesDeRepli()
  const bornes = (jour: Jour) => (ctx ? bornesDillendapp(ctx, jour) : null)

  return (
    <div className="pile">
      <BlocPresence
        enfant={enfant}
        cle="matin"
        heures={enfant.dillendappDepuis}
        borne={(jour) => (ctx ? bornes(jour)!.depuis : repli.depuis)}
        onHeure={onDillendappDepuis}
      />
      <BlocPresence
        enfant={enfant}
        cle="soir"
        heures={enfant.dillendappJusqua}
        borne={(jour) => (ctx ? bornes(jour)!.jusqua : repli.jusqua)}
        onHeure={onDillendappJusqua}
      />
    </div>
  )
}

/** 3. Les inscriptions au périscolaire et leurs horaires, d'un bloc. */
export function SectionPeriscolaire({
  enfant,
  ctx,
  onPeriscolaireMidi,
  onPeriscolaireHorsMidi,
  onDillendappDepuis,
  onDillendappJusqua,
}: {
  enfant: Enfant
  ctx: ContexteEnfant | null
  onPeriscolaireMidi: (inscrit: boolean) => void
  onPeriscolaireHorsMidi: (inscrit: boolean) => void
  onDillendappDepuis: (jour: Jour, heure: string | null) => void
  onDillendappJusqua: (jour: Jour, heure: string | null) => void
}) {
  return (
    <section className="pile pile--serre">
      <CasesPeriscolaire
        enfant={enfant}
        onPeriscolaireMidi={onPeriscolaireMidi}
        onPeriscolaireHorsMidi={onPeriscolaireHorsMidi}
      />
      {estPeriscolaireHorsMidi(enfant) && (
        <HorairesPeriscolaire
          enfant={enfant}
          ctx={ctx}
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
  onAdresseJour: (jour: Jour, sens: SensAdresse, adresse: Adresse | null) => void
  repliee?: boolean
}) {
  const { t } = useT()
  const midi = estPeriscolaireMidi(enfant)
  const horsMidi = estPeriscolaireHorsMidi(enfant)

  /**
   * Ce qu'il advient d'un sens ce jour-là. Un sens que la présence au Dillendapp
   * contredit ne se règle pas : il s'annonce. Laisser le champ ouvert reviendrait à
   * proposer deux réponses inconciliables à la même question.
   */
  const etatDuSens = (jour: Jour, sens: SensAdresse): 'saisissable' | 'dillendapp' | 'sansObjet' => {
    if (sens === 'matin') {
      return horsMidi && enfant.dillendappDepuis?.[jour] ? 'dillendapp' : 'saisissable'
    }
    if (sens === 'soir') {
      return horsMidi && enfant.dillendappJusqua?.[jour] ? 'dillendapp' : 'saisissable'
    }
    // Le déjeuner ailleurs ne se pose que s'il y a cours l'après-midi — sinon le
    // retour de midi est le retour de la journée — et que l'enfant ne mange pas au
    // Dillendapp.
    if (!coursApresMidi(jour)) return 'sansObjet'
    return midi && enfant.repas[jour] === 'dillendapp' ? 'dillendapp' : 'saisissable'
  }

  const joursDerogatoires = JOURS.filter((j) => {
    const duJour = enfant.adresses?.[j]
    return Boolean(duJour?.matin || duJour?.midi || duJour?.soir)
  }).length

  const corps = (
    <div className="pile">
      <p className="champ__aide">{t('adresseJour.aide')}</p>

      {JOURS.map((jour) => {
        const duJour = enfant.adresses?.[jour]
        const sansDerogation = !duJour?.matin && !duJour?.midi && !duJour?.soir
        return (
          <fieldset className="fieldset-nu pile pile--serre" key={jour}>
            <legend className="legende rangee">
              <span>{t(`jours.${jour}`)}</span>
              {sansDerogation && <span className="etiquette">{t('adresseJour.domicile')}</span>}
            </legend>

            {SENS_ADRESSE.map((sens) => {
              const etat = etatDuSens(jour, sens)
              if (etat === 'sansObjet') return null
              if (etat === 'dillendapp') {
                return (
                  <p className="champ__aide" key={sens}>
                    {t(`adresseJour.auDillendapp.${sens}`)}
                  </p>
                )
              }
              return (
                <ChampAdresse
                  key={sens}
                  compact
                  libelle={t(`adresseJour.${sens}`)}
                  valeur={duJour?.[sens] ?? null}
                  onChoisir={(a) => onAdresseJour(jour, sens, a)}
                  onEffacer={duJour?.[sens] ? () => onAdresseJour(jour, sens, null) : undefined}
                />
              )
            })}
          </fieldset>
        )
      })}
    </div>
  )

  if (!repliee) return <section className="pile pile--serre">{corps}</section>

  return (
    <details className="repli carte">
      {/* Replié, rien ne disait qu'il y avait trois jours dérogatoires là-dedans. */}
      <summary>
        <span className="repli__resume rangee">
          <span>{t('adresseJour.titre')}</span>
          {joursDerogatoires > 0 && (
            <span className="etiquette">
              {t('adresseJour.joursDerogatoires', { nombre: joursDerogatoires })}
            </span>
          )}
        </span>
      </summary>
      {corps}
    </details>
  )
}

interface Props {
  enfant: Enfant
  ctx: ContexteEnfant | null
  onRepas: (jour: Jour, repas: RepasMidi) => void
  onRepasSemaine: (repas: RepasMidi) => void
  onBus: (jour: Jour, usage: UsageBus) => void
  onBusSemaine: (usage: UsageBus) => void
  onPeriscolaireMidi: (inscrit: boolean) => void
  onPeriscolaireHorsMidi: (inscrit: boolean) => void
  onDillendappDepuis: (jour: Jour, heure: string | null) => void
  onDillendappJusqua: (jour: Jour, heure: string | null) => void
  onAdresseJour: (jour: Jour, sens: SensAdresse, adresse: Adresse | null) => void
}

/** Les quatre sections empilées, pour le réglage fin depuis `/configurer`. */
export function GrilleSemaine(p: Props) {
  return (
    <div className="pile">
      <SectionRepas enfant={p.enfant} onRepas={p.onRepas} onRepasSemaine={p.onRepasSemaine} />
      <SectionBus enfant={p.enfant} onBus={p.onBus} onBusSemaine={p.onBusSemaine} />
      <SectionPeriscolaire
        enfant={p.enfant}
        ctx={p.ctx}
        onPeriscolaireMidi={p.onPeriscolaireMidi}
        onPeriscolaireHorsMidi={p.onPeriscolaireHorsMidi}
        onDillendappDepuis={p.onDillendappDepuis}
        onDillendappJusqua={p.onDillendappJusqua}
      />
      <SectionAdresses enfant={p.enfant} onAdresseJour={p.onAdresseJour} repliee />
    </div>
  )
}
