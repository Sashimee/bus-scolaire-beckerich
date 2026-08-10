import { useT } from '../i18n'
import { useFoyer } from '../etat'
import { icsEnfant, icsFoyer } from '../lib/agenda'
import { nomArretParId } from '../lib/affichage'
import type { ContexteEnfant } from '../lib/plan'
import type { OptionsAgenda } from '../lib/agenda'

/**
 * Le téléchargement du fichier `.ics`, sur la page qui explique quoi en faire.
 *
 * Le bouton vivait au bas de la fiche d'un enfant, à un écran de la marche à suivre
 * pour l'importer : on repartait avec un fichier sans savoir où le mettre. Il est ici,
 * au-dessus des procédures, et il vaut pour tous les enfants du foyer — la fiche d'un
 * enfant n'a plus qu'à renvoyer vers cette page.
 */
export function TelechargementIcs() {
  const { t } = useT()
  const { foyer, contextes } = useFoyer()

  // Sans trajet, l'export produirait un calendrier vide : mieux vaut pas de bouton.
  const enfants = foyer.enfants
    .map((e) => contextes.get(e.id))
    .filter((c): c is ContexteEnfant => c !== null && c !== undefined && !c.marcheDirecte)

  if (enfants.length === 0) return null

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

  return (
    <section className="carte pile pile--serre">
      <h3 className="titre-carte">{t('calendrier.telechargerTitre')}</h3>

      {/* Un seul fichier pour toute la fratrie : trois enfants voulaient dire trois
          calendriers à activer, masquer et supprimer séparément. */}
      {enfants.length > 1 && (
        <>
          <button
            type="button"
            className="bouton bouton--primaire"
            onClick={() =>
              telecharger(icsFoyer(enfants, options, t('calendrier.nomFoyer')), 'bus-famille.ics')
            }
          >
            {t('calendrier.tousLesEnfants')}
          </button>
          <p className="champ__aide">{t('calendrier.tousLesEnfantsAide')}</p>
        </>
      )}

      {enfants.map((ctx) => (
        <button
          key={ctx.enfant.id}
          type="button"
          className={enfants.length > 1 ? 'bouton' : 'bouton bouton--primaire'}
          onClick={() =>
            telecharger(icsEnfant(ctx, options), `bus-${sansAccent(ctx.enfant.prenom)}.ics`)
          }
        >
          {t('calendrier.icsEnfant', { prenom: ctx.enfant.prenom })}
        </button>
      ))}

      <p className="champ__aide">{t('calendrier.icsAide')}</p>
    </section>
  )
}
