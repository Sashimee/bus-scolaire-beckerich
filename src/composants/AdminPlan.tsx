import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { plan } from '../lib/donnees'
import { planPubliable, validerPlan, type Probleme } from '../lib/validation'
import { CHEMIN_PLAN } from '../config'
import { ecrireFichier, lireFichier } from '../lib/github'

interface Props {
  jeton: string
  onErreur: (e: string | null) => void
}

/** Compte les lignes, courses et arrêts d'un plan, pour comparer avant/après. */
function mesurer(p: unknown): { lignes: number; courses: number; arrets: number } {
  const lignes = (p as { lignes?: unknown[] })?.lignes ?? []
  let courses = 0
  let arrets = 0
  for (const l of lignes as { services?: { arrets?: unknown[] }[] }[]) {
    for (const s of l.services ?? []) {
      courses++
      arrets += s.arrets?.length ?? 0
    }
  }
  return { lignes: lignes.length, courses, arrets }
}

/**
 * Remplacement du plan de référence.
 *
 * C'est l'opération la plus risquée de l'application : un plan corrompu casserait les
 * horaires de toutes les familles d'un coup. D'où trois garde-fous successifs — la
 * validation ci-dessous, qui refuse de publier tant qu'une erreur subsiste ; le
 * récapitulatif chiffré, qui rend visible un plan amputé de moitié ; et les tests
 * d'intégration continue, qui s'exécutent avant le déploiement et laissent le site
 * sur sa version précédente plutôt que d'en mettre une cassée en ligne.
 */
export function AdminPlan({ jeton, onErreur }: Props) {
  const { t } = useT()
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [publie, setPublie] = useState(false)

  const analyse = useMemo(() => {
    if (!texte.trim()) return null
    try {
      const contenu = JSON.parse(texte) as unknown
      return { contenu, problemes: validerPlan(contenu) }
    } catch (e) {
      return {
        contenu: null,
        problemes: [
          {
            gravite: 'erreur' as const,
            ou: 'JSON',
            message: `${t('adminPlan.jsonInvalide')} ${e instanceof Error ? e.message : ''}`,
          },
        ] satisfies Probleme[],
      }
    }
  }, [texte, t])

  const publiable = analyse?.contenu != null && planPubliable(analyse.problemes)
  const avant = mesurer(plan)
  const apres = analyse?.contenu ? mesurer(analyse.contenu) : null

  async function publier() {
    if (!analyse?.contenu || !publiable) return
    setOccupe(true)
    onErreur(null)
    try {
      const { sha } = await lireFichier<unknown>(jeton, CHEMIN_PLAN)
      await ecrireFichier(
        jeton,
        CHEMIN_PLAN,
        analyse.contenu,
        sha,
        `Mise à jour du plan de bus (${(analyse.contenu as { anneeScolaire?: string }).anneeScolaire ?? '—'})`,
      )
      setPublie(true)
      setTexte('')
    } catch (e) {
      onErreur(e instanceof Error ? e.message : 'publication-impossible')
    } finally {
      setOccupe(false)
    }
  }

  const lireFichierLocal = (f: File | undefined) => {
    if (!f) return
    const lecteur = new FileReader()
    lecteur.onload = () => setTexte(String(lecteur.result))
    lecteur.readAsText(f)
  }

  return (
    <section className="pile pile--serre">
      <h3 className="titre-carte">{t('adminPlan.titre')}</h3>
      <p className="champ__aide">{t('adminPlan.aide')}</p>

      <div className="encart encart--attention">
        <div className="encart__titre">{t('adminPlan.prudence')}</div>
        {t('adminPlan.prudenceDetail')}
      </div>

      <p className="champ__aide">
        {t('adminPlan.actuel', {
          annee: plan.anneeScolaire,
          lignes: avant.lignes,
          courses: avant.courses,
          arrets: avant.arrets,
        })}
      </p>

      {publie && <div className="encart encart--info">{t('adminPlan.publie')}</div>}

      <div className="champ">
        <label htmlFor="fichier-plan">{t('adminPlan.fichier')}</label>
        <input
          id="fichier-plan"
          type="file"
          accept="application/json,.json"
          onChange={(e) => lireFichierLocal(e.target.files?.[0])}
        />
      </div>

      <div className="champ">
        <label htmlFor="texte-plan">{t('adminPlan.coller')}</label>
        <textarea
          id="texte-plan"
          rows={10}
          spellCheck={false}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder='{ "anneeScolaire": "2027/2028", … }'
        />
      </div>

      {analyse && (
        <div className="pile pile--serre">
          {analyse.problemes.length === 0 ? (
            <div className="encart encart--info">{t('adminPlan.aucunProbleme')}</div>
          ) : (
            <>
              {(['erreur', 'avertissement'] as const).map((gravite) => {
                const liste = analyse.problemes.filter((p) => p.gravite === gravite)
                if (!liste.length) return null
                return (
                  <div
                    className={`encart ${gravite === 'erreur' ? 'encart--alerte' : 'encart--attention'}`}
                    key={gravite}
                  >
                    <div className="encart__titre">
                      {t(`adminPlan.${gravite}s`, { nombre: liste.length })}
                    </div>
                    <ul className="liste-puces">
                      {liste.slice(0, 30).map((p, i) => (
                        <li key={i}>
                          <strong>{p.ou}</strong> — {p.message}
                        </li>
                      ))}
                    </ul>
                    {liste.length > 30 && (
                      <p className="champ__aide">{t('adminPlan.etAutres', { nombre: liste.length - 30 })}</p>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {apres && (
            <div className="carte">
              <div className="encart__titre">{t('adminPlan.comparaison')}</div>
              <div className="tableau-conteneur">
                <table>
                  <thead>
                    <tr>
                      <th scope="col" />
                      <th scope="col">{t('adminPlan.avant')}</th>
                      <th scope="col">{t('adminPlan.apres')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['lignes', avant.lignes, apres.lignes],
                        ['courses', avant.courses, apres.courses],
                        ['arrets', avant.arrets, apres.arrets],
                      ] as const
                    ).map(([cle, a, b]) => (
                      <tr key={cle}>
                        <th scope="row">{t(`adminPlan.${cle}`)}</th>
                        <td className="heure">{a}</td>
                        <td className={`heure${b < a ? ' heure--incoherente' : ''}`}>
                          {b}
                          {b !== a && ` (${b > a ? '+' : ''}${b - a})`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {apres.courses < avant.courses && (
                <p className="champ__aide texte-attention">
                  {t('adminPlan.moinsQuAvant')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="bouton bouton--primaire"
        disabled={!publiable || occupe}
        onClick={publier}
      >
        {occupe ? t('commun.chargement') : t('adminPlan.publier')}
      </button>
      <p className="champ__aide">{t('adminPlan.filet')}</p>
    </section>
  )
}
