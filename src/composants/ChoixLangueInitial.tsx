import { LANGUES, NOMS_LANGUES, useT, type Langue } from '../i18n'

/**
 * Choix de la langue, au tout premier lancement.
 *
 * Il passe avant l'avertissement d'indépendance, et donc avant tout le reste : cet
 * avertissement est le texte le plus important du site, et un parent lusophone à qui on
 * le sert en français ne l'a pas lu, il l'a cliqué.
 *
 * Le titre s'affiche dans la langue devinée d'après le navigateur — la devinette est
 * bonne la plupart du temps, et quand elle est mauvaise, les noms des langues sont
 * chacun écrits dans leur propre langue : le parent y retrouve la sienne sans avoir à
 * comprendre la question.
 */
export function ChoixLangueInitial() {
  const { t, langue, changerLangue } = useT()

  return (
    <div className="carte carte--accent carte--surelevee pile" role="group" aria-labelledby="langue-titre">
      <h2 id="langue-titre" className="titre-carte">
        {t('choixLangue.titre')}
      </h2>

      <ul className="choix-langues liste-nue">
        {LANGUES.map((l: Langue) => (
          <li key={l}>
            {/*
                La langue devinée est signalée, pas présélectionnée : rien n'est retenu
                tant que le parent n'a pas cliqué, sans quoi on ne saurait plus
                distinguer une devinette d'un choix.
            */}
            <button
              type="button"
              lang={l}
              className={`choix${l === langue ? ' choix--retenu' : ''}`}
              onClick={() => changerLangue(l)}
            >
              <span className="choix__titre">{NOMS_LANGUES[l]}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="champ__aide">{t('choixLangue.aide')}</p>
    </div>
  )
}
