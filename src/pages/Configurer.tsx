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
  /**
   * Sur qui calquer le nouvel enfant, `'zero'` pour repartir d'une page blanche.
   *
   * Vide tant que rien n'est choisi : on retombe alors sur l'aîné. C'est le défaut
   * voulu — dans une même famille le rythme se ressemble, et retaper la même grille
   * pour le deuxième enfant est le meilleur moyen de s'y tromper.
   */
  const [modele, setModele] = useState<string>('')
  const modeleChoisi = modele || foyer.enfants[0]?.id || 'zero'

  /**
   * Où atterrir après la création.
   *
   * Un enfant parti de zéro n'a que son prénom : l'assistant enchaîne sur les questions
   * qui manquent. Un enfant calqué sur son aîné, lui, est déjà complet — lui faire
   * reparcourir sept écrans qui ne demandent rien de nouveau ferait perdre du temps
   * pour rien. On l'envoie donc sur sa fiche, qui montre aussitôt sa semaine ; la
   * fiche porte déjà un lien vers l'assistant pour qui veut ajuster.
   */
  const soumettre = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prenom.trim()) return
    const modele = modeleChoisi === 'zero' ? undefined : modeleChoisi
    const source = foyer.enfants.find((x) => x.id === modele)
    const id = ajouterEnfant(prenom, cycle, modele)
    setPrenom('')
    naviguer(source ? `/enfant/${id}` : `/enfant/${id}/assistant`, {
      state: source ? { repriseDe: source.prenom } : undefined,
    })
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

            {/* La semaine de l'enfant, depuis sa fiche de réglage : c'est là qu'on
                vérifie ce qu'un changement de cycle ou de repas a produit, et c'est le
                seul endroit qui donne l'horaire calculé. */}
            <div className="rangee">
              <Link to={`/enfant/${enfant.id}`} className="bouton bouton--primaire">
                {t('enfant.voirSemaine')}
              </Link>
              <Link to={`/enfant/${enfant.id}/assistant`} className="bouton bouton--discret">
                {t('assistant.reprendre')}
              </Link>
            </div>

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
          {foyer.enfants.length > 0 && (
            <div className="champ">
              <label htmlFor="nouveau-modele">{t('enfant.calquerSur')}</label>
              <select
                id="nouveau-modele"
                value={modeleChoisi}
                onChange={(e) => setModele(e.target.value)}
              >
                {foyer.enfants.map((e) => (
                  <option key={e.id} value={e.id}>
                    {t('enfant.commeLui', { prenom: e.prenom || t('enfant.sansPrenom') })}
                  </option>
                ))}
                <option value="zero">{t('enfant.depuisZero')}</option>
              </select>
              <p className="champ__aide">{t('enfant.calquerSurAide')}</p>
            </div>
          )}

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
