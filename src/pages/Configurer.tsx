import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
    contextes,
    definirAdresse,
    ajouterEnfant,
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
    supprimerEnfant,
    configure,
  } = useFoyer()

  const naviguer = useNavigate()
  const [prenom, setPrenom] = useState('')
  const [cycle, setCycle] = useState<Cycle>('c1')

  // Un enfant qui vient d'être créé n'a que son prénom : l'assistant enchaîne sur les
  // questions qui manquent, plutôt que de laisser le parent chercher dans la page.
  const soumettre = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prenom.trim()) return
    const id = ajouterEnfant(prenom, cycle)
    setPrenom('')
    naviguer(`/enfant/${id}/assistant`)
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

        {/*
            Un enfant replié par défaut. Trois enfants dépliés donnaient une page de
            plusieurs écrans où il fallait faire défiler longtemps pour trouver le bon,
            et rien ne distinguait la fin d'une fiche du début de la suivante.
        */}
        {foyer.enfants.map((enfant) => (
          <details className="carte repli repli--enfant" key={enfant.id}>
            <summary>
              <span className="repli__resume">
                <span className="texte-fort">{enfant.prenom || t('enfant.sansPrenom')}</span>
                <span className="champ__aide">
                  {t(`cycles.${enfant.cycle}`)} · {siteDuCycle(enfant.cycle).nom}
                </span>
              </span>
            </summary>

            <div className="pile">
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
              ctx={contextes.get(enfant.id) ?? null}
              onRepas={(jour, repas) => definirRepas(enfant.id, jour, repas)}
              onRepasSemaine={(repas) => definirRepasSemaine(enfant.id, repas)}
              onBus={(jour, usage) => definirBus(enfant.id, jour, usage)}
              onBusSemaine={(usage) => definirBusSemaine(enfant.id, usage)}
              onPeriscolaireMidi={(inscrit) => definirPeriscolaireMidi(enfant.id, inscrit)}
              onPeriscolaireHorsMidi={(inscrit) => definirPeriscolaireHorsMidi(enfant.id, inscrit)}
              onDillendappDepuis={(jour, heure) =>
                definirDillendappDepuis(enfant.id, jour, heure)
              }
              onDillendappJusqua={(jour, heure) =>
                definirDillendappJusqua(enfant.id, jour, heure)
              }
              onAdresseJour={(jour, sens, adresse) =>
                definirAdresseJour(enfant.id, jour, sens, adresse)
              }
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
              <Link to={`/enfant/${enfant.id}/assistant`} className="bouton bouton--discret">
                {t('assistant.reprendre')}
              </Link>
            </div>
            </div>
          </details>
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
