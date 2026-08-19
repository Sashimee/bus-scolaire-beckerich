import { useState } from 'react'
import { useT } from '../i18n'
import { plan } from '../lib/donnees'
import { planPerime } from '../lib/affichage'
import { accepterAvertissement, avertissementAccepte } from '../lib/stockage'
import { AvertissementInitial } from './AvertissementInitial'
import { ChoixLangueInitial } from './ChoixLangueInitial'
import { BandeauUrgences } from './BandeauUrgences'
import { BandeauVersion } from './BandeauVersion'
import { ReceptionPartage, usePartageRecu } from './ReceptionPartage'

/**
 * Pile de bandeaux de tête, unique et priorisée.
 *
 * Six messages peuvent se présenter à l'ouverture : mise à jour, plan périmé,
 * perturbation du jour, choix de la langue, avertissement d'indépendance, configuration
 * reçue par lien. Empilés tels quels, ils repoussaient les horaires sous la ligne de
 * flottaison — exactement ce que le parent est venu chercher.
 *
 * Trois d'entre eux appellent une décision et sont donc dits *bloquants* : ils sont
 * montrés **un seul à la fois**, dans cet ordre — la langue, puis l'avertissement
 * d'indépendance, puis le partage. Chaque marche donne son sens à la suivante : on ne
 * lit pas un avertissement écrit dans une langue qu'on ne parle pas, et accepter une
 * configuration reçue par lien avant d'avoir lu qui édite ce site serait accepter dans
 * le vide. Celui qui n'est pas montré n'est pas perdu, il vient juste après.
 *
 * Les trois autres sont informatifs et restent visibles derrière, sans jamais réclamer
 * de geste.
 */
export function PileBandeaux() {
  const { t, langueChoisie } = useT()
  const [avertissementVu, setAvertissementVu] = useState(avertissementAccepte)
  const partage = usePartageRecu()

  /*
   * La langue ne se demande qu'au premier lancement, c'est-à-dire tant que
   * l'avertissement n'a pas été accepté. Un parent qui utilise l'application depuis des
   * mois sans avoir jamais touché au réglage de langue s'en accommode : lui poser
   * aujourd'hui une question d'accueil serait le renvoyer à une case départ qu'il a
   * franchie. Il la trouve dans les réglages, où elle a toujours été.
   */
  const bloquant = !avertissementVu
    ? !langueChoisie
      ? 'langue'
      : 'avertissement'
    : partage.recu
      ? 'partage'
      : null

  return (
    <>
      {/* Bandeaux fins, pleine largeur, collés sous l'en-tête. */}
      <BandeauVersion />
      {planPerime() && (
        <div className="bandeau" role="status">
          <div className="bandeau__interne">
            <strong aria-hidden="true">⚠</strong>
            <span>{t('validite.perime', { fin: plan.valideAu })}</span>
          </div>
        </div>
      )}

      <div className="bandeaux">
        {bloquant === 'langue' && <ChoixLangueInitial />}
        {bloquant === 'avertissement' && (
          <AvertissementInitial
            onAccepter={() => {
              accepterAvertissement()
              setAvertissementVu(true)
            }}
          />
        )}
        {bloquant === 'partage' && partage.recu && (
          <ReceptionPartage
            recu={partage.recu}
            onAccepter={partage.accepter}
            onRefuser={partage.refuser}
          />
        )}
        <BandeauUrgences />
      </div>
    </>
  )
}
