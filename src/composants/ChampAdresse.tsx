import { useId, useMemo, useState } from 'react'
import { chercherAdresses, type AdresseTrouvee } from '../lib/adresses'
import { useT } from '../i18n'
import type { Adresse } from '../lib/types'

interface Props {
  valeur: Adresse | null
  onChoisir: (a: Adresse) => void
}

/**
 * Saisie d'adresse avec autocomplétion locale.
 *
 * La recherche se fait dans le jeu embarqué : rien ne part sur le réseau, ce qui est
 * le point le plus sensible de l'application — une adresse de domicile d'enfant.
 */
export function ChampAdresse({ valeur, onChoisir }: Props) {
  const { t } = useT()
  const [saisie, setSaisie] = useState('')
  const [actif, setActif] = useState(-1)
  const idListe = useId()

  const suggestions = useMemo(() => chercherAdresses(saisie), [saisie])
  const afficheListe = saisie.trim().length >= 2

  const choisir = (a: AdresseTrouvee) => {
    onChoisir({ libelle: a.libelle, localite: a.localite, coord: a.coord })
    setSaisie('')
    setActif(-1)
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

  return (
    <div className="pile pile--serre">
      {valeur && (
        <div className="carte carte--accent">
          <div className="etiquette">{t('adresse.choisie')}</div>
          <div style={{ fontWeight: 600, marginBlockStart: '0.25rem' }}>{valeur.libelle}</div>
          <div className="localite" style={{ color: 'var(--muted)' }}>
            {valeur.localite}
          </div>
        </div>
      )}

      <div className="champ">
        <label htmlFor={idListe}>
          {valeur ? t('adresse.modifier') : t('adresse.label')}
        </label>
        <p className="champ__aide" id={`${idListe}-aide`}>
          {t('adresse.aide')}
        </p>
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
          aria-describedby={`${idListe}-aide`}
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

      {afficheListe && suggestions.length === 0 && (
        <div className="encart encart--attention">
          <div className="encart__titre">{t('adresse.aucunResultat')}</div>
          {t('adresse.aucunResultatAide')}
        </div>
      )}

      <p className="champ__aide">{t('adresse.confidentialite')}</p>
    </div>
  )
}
