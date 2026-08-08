import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { ChampAdresse } from '../composants/ChampAdresse'
import { GrilleSemaine } from '../composants/GrilleSemaine'
import { siteDuCycle } from '../lib/donnees'
import type { Cycle } from '../lib/types'

const CYCLES: Cycle[] = ['precoce', 'c1', 'c2', 'c3', 'c4']

/** Saisie et modification de l'adresse et des enfants. Sert d'accueil au premier lancement. */
export function Configurer() {
  const { t } = useT()
  const {
    foyer,
    definirAdresse,
    ajouterEnfant,
    modifierEnfant,
    definirRepas,
    definirRepasSemaine,
    definirBus,
    definirBusSemaine,
    definirDillendappJusqua,
    supprimerEnfant,
    configure,
  } = useFoyer()

  const [prenom, setPrenom] = useState('')
  const [cycle, setCycle] = useState<Cycle>('c1')

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prenom.trim()) return
    ajouterEnfant(prenom, cycle)
    setPrenom('')
  }

  return (
    <div className="pile pile--large">
      <section className="pile">
        <h2>{t('onboarding.etapeAdresse')}</h2>
        <ChampAdresse valeur={foyer.adresse} onChoisir={definirAdresse} />
      </section>

      <section className="pile">
        <h2>{t('onboarding.etapeEnfants')}</h2>

        {foyer.enfants.length === 0 && <p className="champ__aide">{t('enfant.aucun')}</p>}

        {foyer.enfants.map((enfant) => (
          <article className="carte pile" key={enfant.id}>
            <div className="rangee rangee--espacee">
              <div className="champ champ--flexible">
                <label htmlFor={`prenom-${enfant.id}`}>{t('enfant.prenom')}</label>
                <input
                  id={`prenom-${enfant.id}`}
                  type="text"
                  value={enfant.prenom}
                  onChange={(e) => modifierEnfant(enfant.id, { prenom: e.target.value })}
                />
              </div>

              <div className="champ champ--flexible">
                <label htmlFor={`cycle-${enfant.id}`}>{t('enfant.cycle')}</label>
                <select
                  id={`cycle-${enfant.id}`}
                  value={enfant.cycle}
                  onChange={(e) =>
                    modifierEnfant(enfant.id, { cycle: e.target.value as Cycle })
                  }
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {t(`cycles.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="champ__aide">
              {t('enfant.scolariseA', { site: siteDuCycle(enfant.cycle).nom })} —{' '}
              {t('enfant.cycleAide')}
            </p>

            <GrilleSemaine
              enfant={enfant}
              onRepas={(jour, repas) => definirRepas(enfant.id, jour, repas)}
              onRepasSemaine={(repas) => definirRepasSemaine(enfant.id, repas)}
              onBus={(jour, usage) => definirBus(enfant.id, jour, usage)}
              onBusSemaine={(usage) => definirBusSemaine(enfant.id, usage)}
              onDillendapp={(jour, heure) => definirDillendappJusqua(enfant.id, jour, heure)}
            />

            <div className="rangee">
              <button
                type="button"
                className="bouton bouton--danger"
                onClick={() => {
                  if (confirm(t('enfant.supprimerConfirmation', { prenom: enfant.prenom }))) {
                    supprimerEnfant(enfant.id)
                  }
                }}
              >
                {t('enfant.supprimer')}
              </button>
            </div>
          </article>
        ))}

        <form className="carte pile pile--serre" onSubmit={soumettre}>
          <div className="champ">
            <label htmlFor="nouveau-prenom">{t('enfant.ajouter')}</label>
            <input
              id="nouveau-prenom"
              type="text"
              value={prenom}
              placeholder={t('enfant.prenomPlaceholder')}
              onChange={(e) => setPrenom(e.target.value)}
            />
          </div>
          <div className="champ">
            <label htmlFor="nouveau-cycle">{t('enfant.cycle')}</label>
            <select
              id="nouveau-cycle"
              value={cycle}
              onChange={(e) => setCycle(e.target.value as Cycle)}
            >
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {t(`cycles.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="bouton" disabled={!prenom.trim()}>
            {t('enfant.ajouter')}
          </button>
        </form>
      </section>

      {configure && (
        <Link to="/" className="bouton bouton--primaire">
          {t('onboarding.terminer')}
        </Link>
      )}
    </div>
  )
}
