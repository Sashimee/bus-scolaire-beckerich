/**
 * Le dernier filet : ce qui s'affiche quand le rendu s'effondre.
 *
 * Sans elle, une exception au rendu laisse un écran BLANC. Dans un navigateur c'est
 * fâcheux ; dans une application installée sur l'écran d'accueil, c'est une panne sans
 * issue — ni message, ni bouton, ni moyen de comprendre. Le parent qui voulait savoir
 * à quelle heure passe le bus n'a plus que la désinstallation.
 *
 * Elle est doublée à dessein : une autour de tout (le fournisseur de traduction ou de
 * foyer peut lui-même échouer), une autour du contenu de page seulement, pour que la
 * navigation survive à la panne d'un seul écran.
 *
 * React n'offre ce mécanisme qu'aux composants de classe : c'est la seule de tout le
 * dépôt, et elle le reste.
 */
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { langueInitiale } from '../i18n'
import { chercher, dictionnaire } from '../i18n/dictionnaires'
import { toutEffacer } from '../lib/stockage'

/**
 * Traduire sans le contexte React.
 *
 * `useT()` est hors d'atteinte ici — le fournisseur est peut-être la cause de la panne.
 * On lit donc le dictionnaire compilé directement ; la surcouche publiée, elle, est
 * perdue, ce qui est sans conséquence pour cinq phrases de secours.
 */
function traduire(cle: string): string {
  const valeur = chercher(dictionnaire(langueInitiale()), cle)
  return typeof valeur === 'string' ? valeur : cle
}

interface Props {
  children: ReactNode
  /** Vrai pour la barrière extérieure, celle qui remplace la page entière. */
  page?: boolean
}

interface Etat {
  panne: Error | null
}

function Secours({ panne, page }: { panne: Error; page: boolean }) {
  const racine = import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <div className={page ? 'page pile pile--large' : 'pile pile--large'}>
      <section className="carte pile pile--serre">
        <div className="encart encart--alerte">
          <div className="encart__titre">{traduire('panne.titre')}</div>
          {traduire('panne.explication')}
        </div>

        <button type="button" className="bouton bouton--primaire" onClick={() => location.reload()}>
          {traduire('panne.recharger')}
        </button>

        {/*
            Un lien ordinaire, et non un lien de routage : le routeur fait partie de ce
            qui vient de tomber. Une navigation complète repart d'un état neuf.
        */}
        <a className="bouton" href={`${racine}/plan`}>
          {traduire('panne.horaires')}
        </a>

        <Effacement />

        <details className="repli">
          <summary>
            <span className="repli__resume">{traduire('panne.detail')}</span>
          </summary>
          <p className="champ__aide tabulaire">{panne.message || panne.name}</p>
        </details>
      </section>
    </div>
  )
}

/**
 * L'issue de secours quand ce sont les données locales qui sont en cause.
 *
 * `/reglages` porte déjà ce bouton, mais cette page se rend à partir du foyer : si
 * c'est lui qui fait tomber le rendu, elle tombe avec. D'où le même geste ici, où il
 * ne dépend de rien — et en deux temps, parce qu'il ne se rattrape pas.
 */
function Effacement() {
  return (
    <details className="repli">
      <summary>
        <span className="repli__resume">{traduire('panne.effacer')}</span>
      </summary>
      <p className="champ__aide">{traduire('panne.effacerConfirmation')}</p>
      <button
        type="button"
        className="bouton bouton--danger"
        onClick={() => {
          toutEffacer()
          location.reload()
        }}
      >
        {traduire('panne.effacerConfirmer')}
      </button>
    </details>
  )
}

export class BarriereErreur extends Component<Props, Etat> {
  state: Etat = { panne: null }

  static getDerivedStateFromError(erreur: Error): Etat {
    return { panne: erreur }
  }

  componentDidCatch(erreur: Error, infos: ErrorInfo) {
    // Rien n'est envoyé nulle part : la trace reste sur l'appareil, comme le reste.
    // Elle sert au parent qui signale la panne, et à l'auteur qui la reproduit.
    console.error('Rendu interrompu', erreur, infos.componentStack)
  }

  render() {
    if (this.state.panne) return <Secours panne={this.state.panne} page={this.props.page ?? false} />
    return this.props.children
  }
}
