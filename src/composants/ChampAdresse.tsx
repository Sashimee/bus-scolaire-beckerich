import { useId, useMemo, useState } from 'react'
import { chercherAdresses, type AdresseTrouvee } from '../lib/adresses'
import { arrets } from '../lib/donnees'
import { nomArret } from '../lib/affichage'
import { useT } from '../i18n'
import type { Adresse } from '../lib/types'

interface Props {
  valeur: Adresse | null
  onChoisir: (a: Adresse) => void
  /**
   * Proposé quand l'adresse peut être retirée pour revenir au domicile du foyer.
   * Absent sur l'adresse du foyer elle-même, qui n'a pas de repli.
   */
  onEffacer?: () => void
  /** Libellé du champ. Par défaut, celui de l'adresse du domicile. */
  libelle?: string
  /** Version resserrée, pour la grille des adresses particulières. */
  compact?: boolean
}

/**
 * Saisie d'adresse avec autocomplétion locale.
 *
 * La recherche se fait dans le jeu embarqué : rien ne part sur le réseau, ce qui est
 * le point le plus sensible de l'application — une adresse de domicile d'enfant.
 *
 * Ce jeu ne couvre que la commune de Beckerich. Une adresse hors commune est donc
 * introuvable, et le restera : plutôt que de laisser le parent buter sur un champ
 * vide, on lui propose alors de désigner directement l'arrêt utilisé. C'est moins
 * précis — le temps de marche devient inconnu — mais c'est honnête, et cela couvre le
 * cas réel des grands-parents habitant le village voisin.
 */
export function ChampAdresse({ valeur, onChoisir, onEffacer, libelle, compact }: Props) {
  const { t } = useT()
  const [saisie, setSaisie] = useState('')
  const [actif, setActif] = useState(-1)
  const [choixArret, setChoixArret] = useState(false)
  const idListe = useId()

  const suggestions = useMemo(() => chercherAdresses(saisie), [saisie])
  const afficheListe = saisie.trim().length >= 2
  const aucunResultat = afficheListe && suggestions.length === 0

  const choisir = (a: AdresseTrouvee) => {
    onChoisir({ libelle: a.libelle, localite: a.localite, coord: a.coord })
    setSaisie('')
    setActif(-1)
    setChoixArret(false)
  }

  const choisirArret = (id: string) => {
    const a = arrets.find((x) => x.id === id)
    if (!a) return
    // L'arrêt devient l'adresse : le calcul n'a besoin que d'un point de départ, et
    // celui-ci a le mérite d'être exactement celui où l'enfant monte.
    onChoisir({ libelle: nomArret(a, t), localite: a.village, coord: a.coord })
    setSaisie('')
    setChoixArret(false)
  }

  const auClavier = (e: React.KeyboardEvent) => {
    if (!afficheListe || !suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActif((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActif((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choisir(suggestions[Math.max(0, actif)])
    } else if (e.key === 'Escape') {
      setSaisie('')
    }
  }

  /**
   * L'adresse retenue. En mode compact elle se glisse SOUS son libellé : au-dessus,
   * coincée entre deux champs empilés, elle se lisait comme la valeur du champ
   * précédent — un retour du soir affiché sous « Part le matin de ».
   */
  const retenue = valeur && (
    <div className={compact ? 'adresse-retenue' : 'carte carte--accent pile pile--serre'}>
      {!compact && (
        <div>
          <span className="etiquette">{t('adresse.choisie')}</span>
        </div>
      )}
      <div className="rangee rangee--espacee">
        <span>
          <span className="texte-fort">{valeur.libelle}</span>{' '}
          <span className="localite texte-doux">{valeur.localite}</span>
        </span>
        {onEffacer && (
          <button type="button" className="bouton bouton--discret" onClick={onEffacer}>
            {t('adresse.revenirDomicile')}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="pile pile--serre">
      {!compact && retenue}

      <div className="champ">
        <label htmlFor={idListe}>
          {libelle ?? (valeur ? t('adresse.modifier') : t('adresse.label'))}
        </label>
        {compact && retenue}
        {!compact && (
          <p className="champ__aide" id={`${idListe}-aide`}>
            {t('adresse.aide')}
          </p>
        )}
        <input
          id={idListe}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('adresse.placeholder')}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value)
            setActif(-1)
          }}
          onKeyDown={auClavier}
          role="combobox"
          aria-expanded={afficheListe && suggestions.length > 0}
          aria-controls={`${idListe}-suggestions`}
          {...(compact ? {} : { 'aria-describedby': `${idListe}-aide` })}
        />
      </div>

      {afficheListe && suggestions.length > 0 && (
        <ul className="suggestions" id={`${idListe}-suggestions`} role="listbox">
          {suggestions.map((a, i) => (
            <li key={`${a.libelle}-${a.localite}`} role="option" aria-selected={i === actif}>
              <button type="button" onClick={() => choisir(a)} aria-selected={i === actif}>
                <span>{a.libelle}</span> <span className="localite">{a.localite}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {aucunResultat && (
        <div className="encart encart--attention pile pile--serre">
          <div>
            <div className="encart__titre">{t('adresse.aucunResultat')}</div>
            {t('adresse.aucunResultatAide')}
          </div>
          {choixArret ? (
            <div className="champ">
              <label htmlFor={`${idListe}-arret`}>{t('adresse.arretLabel')}</label>
              <p className="champ__aide">{t('adresse.arretAide')}</p>
              <select
                id={`${idListe}-arret`}
                defaultValue=""
                onChange={(e) => choisirArret(e.target.value)}
              >
                <option value="" disabled>
                  {t('adresse.arretPlaceholder')}
                </option>
                {arrets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {nomArret(a, t)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button type="button" className="bouton" onClick={() => setChoixArret(true)}>
              {t('adresse.choisirArret')}
            </button>
          )}
        </div>
      )}

      {!compact && <p className="champ__aide">{t('adresse.confidentialite')}</p>}
    </div>
  )
}
