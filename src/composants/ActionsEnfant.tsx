import { useState } from 'react'
import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { genererIcs } from '../lib/calendrier'
import { lienPartage } from '../lib/partage'
import { nomArretParId } from '../lib/affichage'
import type { ContexteEnfant } from '../lib/plan'

/**
 * Ce que le parent peut emporter une fois la fiche calculée : la feuille pour le
 * frigo, l'agenda du téléphone, le lien pour l'autre parent.
 *
 * Partagé par la fiche enfant et par la dernière étape de l'assistant, pour qu'une
 * amélioration de l'export profite aux deux — et qu'aucun des deux n'oublie une action.
 */
export function ActionsEnfant({ ctx }: { ctx: ContexteEnfant }) {
  const { t } = useT()
  const { foyer } = useFoyer()
  const [copie, setCopie] = useState(false)

  // Sans trajet, l'export produirait un calendrier vide : mieux vaut pas de bouton.
  const aDesTrajets = !ctx.marcheDirecte

  const telechargerIcs = () => {
    const ics = genererIcs(ctx, {
      libelleTrajet: (trajet) => t(`trajets.${trajet.type}`),
      nomArret: (idArret) => nomArretParId(idArret, t),
      minutesMarche: ctx.temps,
      libelleRecuperation: t('dillendapp.aRecuperer'),
      libelleDepose: t('dillendapp.aDeposer'),
    })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `bus-${ctx.enfant.prenom.toLowerCase().replace(/\W+/g, '-')}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copierLien = async () => {
    await navigator.clipboard.writeText(lienPartage(foyer))
    setCopie(true)
    setTimeout(() => setCopie(false), 2500)
  }

  return (
    <section className="pile pile--serre sans-impression">
      {aDesTrajets && (
        <>
          <button type="button" className="bouton bouton--primaire" onClick={telechargerIcs}>
            {t('calendrier.ics')}
          </button>
          <p className="champ__aide">{t('calendrier.icsAide')}</p>
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
