import { useState } from 'react'
import { useT } from '../i18n'
import { plan } from '../lib/donnees'
import { planPerime } from '../lib/affichage'
import { accepterAvertissement, avertissementAccepte } from '../lib/stockage'
import { AvertissementInitial } from './AvertissementInitial'
import { BandeauUrgences } from './BandeauUrgences'
import { BandeauVersion } from './BandeauVersion'
import { ReceptionPartage, usePartageRecu } from './ReceptionPartage'

/**
 * Pile de bandeaux de tête, unique et priorisée.
 *
 * Cinq messages peuvent se présenter à l'ouverture : mise à jour, plan périmé,
 * perturbation du jour, avertissement d'indépendance, configuration reçue par lien.
 * Empilés tels quels, ils repoussaient les horaires sous la ligne de flottaison —
 * exactement ce que le parent est venu chercher.
 *
 * Deux d'entre eux appellent une décision et sont donc dits *bloquants* : ils sont
 * montrés **un seul à la fois**, l'avertissement d'indépendance d'abord. Accepter une
 * configuration reçue par lien avant d'avoir lu qui édite ce site serait accepter dans
 * le vide ; et celui qui n'est pas montré n'est pas perdu, il vient juste après.
 *
 * Les trois autres sont informatifs et restent visibles derrière, sans jamais réclamer
 * de geste.
 */
export function PileBandeaux() {
  const { t } = useT()
  const [avertissementVu, setAvertissementVu] = useState(avertissementAccepte)
  const partage = usePartageRecu()

  const bloquant = !avertissementVu ? 'avertissement' : partage.recu ? 'partage' : null

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
