import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { icsEnfant, icsFoyer } from '../lib/agenda'
import { lienPartage } from '../lib/partage'
import { nomArretParId } from '../lib/affichage'
import type { ContexteEnfant } from '../lib/plan'
import type { OptionsAgenda } from '../lib/agenda'

/**
 * Ce que le parent peut emporter une fois la fiche calculée : la feuille pour le
 * frigo, l'agenda du téléphone, le lien pour l'autre parent.
 *
 * Partagé par la fiche enfant et par la dernière étape de l'assistant, pour qu'une
 * amélioration de l'export profite aux deux — et qu'aucun des deux n'oublie une action.
 */
export function ActionsEnfant({ ctx }: { ctx: ContexteEnfant }) {
  const { t } = useT()
  const { foyer, contextes } = useFoyer()
  const [copie, setCopie] = useState(false)

  // Les autres enfants du foyer dont l'arrêt a pu être calculé : eux seuls ont des
  // rendez-vous à exporter.
  const fratrie = foyer.enfants
    .map((e) => contextes.get(e.id))
    .filter((c): c is ContexteEnfant => c !== null && c !== undefined)

  // Sans trajet, l'export produirait un calendrier vide : mieux vaut pas de bouton.
  const aDesTrajets = !ctx.marcheDirecte

  const options = {
    libelleTrajet: (trajet: { type: string }) => t(`trajets.${trajet.type}`),
    nomArret: (idArret: string) => nomArretParId(idArret, t),
    libelleRecuperation: t('dillendapp.aRecuperer'),
    libelleDepose: t('dillendapp.aDeposer'),
  } as OptionsAgenda

  const telecharger = (ics: string, nomFichier: string) => {
    if (!ics) return
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nomFichier
    a.click()
    URL.revokeObjectURL(url)
  }

  const sansAccent = (texte: string) => texte.toLowerCase().replace(/\W+/g, '-')

  const copierLien = async () => {
    await navigator.clipboard.writeText(lienPartage(foyer))
    setCopie(true)
    setTimeout(() => setCopie(false), 2500)
  }

  return (
    <section className="pile pile--serre sans-impression">
      {aDesTrajets && (
        <>
          <button
            type="button"
            className="bouton bouton--primaire"
            onClick={() =>
              telecharger(icsEnfant(ctx, options), `bus-${sansAccent(ctx.enfant.prenom)}.ics`)
            }
          >
            {t('calendrier.ics')}
          </button>
          <p className="champ__aide">{t('calendrier.icsAide')}</p>

          {/* Un seul fichier pour toute la fratrie : trois enfants voulaient dire trois
              calendriers à activer, masquer et supprimer séparément. */}
          {fratrie.length > 1 && (
            <>
              <button
                type="button"
                className="bouton"
                onClick={() =>
                  telecharger(
                    icsFoyer(fratrie, options, t('calendrier.nomFoyer')),
                    'bus-famille.ics',
                  )
                }
              >
                {t('calendrier.tousLesEnfants')}
              </button>
              <p className="champ__aide">{t('calendrier.tousLesEnfantsAide')}</p>
            </>
          )}

          <Link to="/agenda" className="bouton bouton--discret">
            {t('calendrier.commentImporter')}
          </Link>
        </>
      )}

      <button type="button" className="bouton" onClick={() => window.print()}>
        {t('impression.bouton')}
      </button>
      <p className="champ__aide">{t('impression.aide')}</p>

      <button type="button" className="bouton" onClick={copierLien}>
        {copie ? t('partage.copie') : t('partage.copier')}
      </button>
      <p className="champ__aide">{t('partage.confidentialite')}</p>
    </section>
  )
}
