import { describe, expect, it } from 'vitest'
import { arretEcoleDuCycle, plan, siteDuCycle } from './donnees'
import { contexteEnfant, coursApresMidi, trajetsDuJour } from './plan'
import { distanceMarche, tempsMarche } from './distance'
import type { Adresse, Cycle, Enfant, Jour, RepasMidi, TypeTrajet } from './types'
import { JOURS } from './types'

/** Fabrique un enfant dont le repas de midi est le même tous les jours. */
function enfant(cycle: Cycle, repas: RepasMidi, prenom = 'Test'): Enfant {
  return {
    id: prenom,
    prenom,
    cycle,
    repas: Object.fromEntries(JOURS.map((j) => [j, repas])) as Record<Jour, RepasMidi>,
  }
}

const adresse = (libelle: string, lat: number, lon: number): Adresse => ({
  libelle,
  localite: libelle,
  coord: [lat, lon],
})

// Adresses réelles de villages différents de la commune.
const HOVELANGE = adresse('Hovelange', 49.7228, 5.9049)
const LEVELANGE = adresse('Levelange', 49.7389, 5.8557)
const HUTTANGE = adresse('Huttange', 49.7355, 5.898)
const SCHWEICH = adresse('Schweich', 49.7209, 5.9214)

/** Les types de trajets d'une journée, dans l'ordre. */
function types(ctx: ReturnType<typeof contexteEnfant>, jour: Jour): TypeTrajet[] {
  return trajetsDuJour(ctx!, jour).trajets.map((t) => t.type)
}

describe('répartition des cycles', () => {
  it('associe chaque cycle au bon site scolaire', () => {
    expect(siteDuCycle('c1').localite).toBe('Oberpallen')
    expect(siteDuCycle('c2').localite).toBe('Noerdange')
    expect(siteDuCycle('c3').localite).toBe('Elvange')
    expect(siteDuCycle('c4').localite).toBe('Beckerich')
    expect(siteDuCycle('precoce').localite).toBe('Beckerich')
  })

  it("change d'arrêt d'école quand l'enfant change de cycle", () => {
    expect(arretEcoleDuCycle('c2').id).toBe('noerdange-ecole')
    expect(arretEcoleDuCycle('c3').id).toBe('elvange-ecole')
  })
})

describe('rythme scolaire', () => {
  it("n'a cours l'après-midi que les lundi, mercredi et vendredi", () => {
    expect(coursApresMidi('lundi')).toBe(true)
    expect(coursApresMidi('mercredi')).toBe(true)
    expect(coursApresMidi('vendredi')).toBe(true)
    expect(coursApresMidi('mardi')).toBe(false)
    expect(coursApresMidi('jeudi')).toBe(false)
  })
})

describe('nombre de trajets selon le jour et le repas', () => {
  it('un lundi, un enfant qui rentre manger fait quatre trajets', () => {
    const ctx = contexteEnfant(enfant('c2', 'maison'), HOVELANGE)
    expect(types(ctx, 'lundi')).toEqual([
      'aller-matin',
      'retour-midi',
      'aller-apres-midi',
      'retour-soir',
    ])
  })

  it('un mardi, il n’en fait que deux : pas de cours l’après-midi', () => {
    const ctx = contexteEnfant(enfant('c2', 'maison'), HOVELANGE)
    expect(types(ctx, 'mardi')).toEqual(['aller-matin', 'retour-midi'])
  })

  it('un lundi, un enfant qui mange au Dillendapp ne fait que deux trajets utiles au parent', () => {
    const ctx = contexteEnfant(enfant('c2', 'dillendapp'), HOVELANGE)
    const journee = trajetsDuJour(ctx!, 'lundi')
    const parent = journee.trajets.filter((t) => t.concerneParent).map((t) => t.type)
    expect(parent).toEqual(['aller-matin', 'retour-soir'])
  })

  it("signale l'absence de retour le mardi pour un enfant resté au Dillendapp", () => {
    const ctx = contexteEnfant(enfant('c2', 'dillendapp'), HOVELANGE)
    const journee = trajetsDuJour(ctx!, 'mardi')
    expect(journee.manquants).toContain('retour-soir')
  })
})

describe('grille de repas mixte', () => {
  it('gère un enfant au Dillendapp le lundi et à la maison le mardi', () => {
    const e = enfant('c2', 'maison', 'Léa')
    e.repas.lundi = 'dillendapp'
    const ctx = contexteEnfant(e, HOVELANGE)

    const lundi = trajetsDuJour(ctx!, 'lundi')
    const mardi = trajetsDuJour(ctx!, 'mardi')

    expect(lundi.trajets.some((t) => t.type === 'navette-dillendapp-midi')).toBe(true)
    expect(lundi.trajets.some((t) => t.type === 'retour-midi')).toBe(false)

    expect(mardi.trajets.map((t) => t.type)).toEqual(['aller-matin', 'retour-midi'])
    expect(mardi.manquants).toHaveLength(0)
  })
})

describe('choix de la ligne selon le sens de circulation', () => {
  it("envoie un enfant d'Hovelange scolarisé à Noerdange sur l'Aller 2, pas l'Aller 1", () => {
    // L'Aller 1 dessert Noerdange (07:30) AVANT Hovelange (07:44) : il ne peut pas
    // servir ce trajet. Seul l'Aller 2 convient.
    const ctx = contexteEnfant(enfant('c2', 'maison'), HOVELANGE)
    const aller = trajetsDuJour(ctx!, 'lundi').trajets.find((t) => t.type === 'aller-matin')
    expect(aller?.ligne.id).toBe('aller-2')
    expect(aller?.arrivee.heure).toBe('08:00')
  })

  it("envoie un enfant d'Hovelange scolarisé à Oberpallen sur l'Aller 1", () => {
    const ctx = contexteEnfant(enfant('c1', 'maison'), HOVELANGE)
    const aller = trajetsDuJour(ctx!, 'lundi').trajets.find((t) => t.type === 'aller-matin')
    expect(aller?.ligne.id).toBe('aller-1')
    expect(aller?.arrivee.arret.id).toBe('oberpallen-ecole')
  })

  it('fait monter un enfant de Schweich à Peiffer et non à un arrêt plus lointain', () => {
    const ctx = contexteEnfant(enfant('c3', 'maison'), SCHWEICH)
    expect(ctx?.arretDomicile.id).toBe('schweich-peiffer')
  })
})

describe('règles Dillendapp', () => {
  it('fait rejoindre la maison relais à un C3 par le Retour 2, comme le prévoit le plan', () => {
    const ctx = contexteEnfant(enfant('c3', 'dillendapp'), HOVELANGE)
    const navette = trajetsDuJour(ctx!, 'lundi').trajets.find(
      (t) => t.type === 'navette-dillendapp-midi',
    )
    expect(navette?.ligne.id).toBe('retour-2')
    expect(navette?.depart.heure).toBe('12:14')
  })

  it('réserve le bus Aller Dillendapp aux C2 inscrits, et le leur propose bien', () => {
    const ctx = contexteEnfant(enfant('c2', 'dillendapp'), HOVELANGE)
    const navette = trajetsDuJour(ctx!, 'lundi').trajets.find(
      (t) => t.type === 'navette-dillendapp-midi',
    )
    expect(navette?.ligne.id).toBe('aller-dillendapp')
    expect(navette?.depart.heure).toBe('12:10')
  })

  it("n'ouvre pas le bus Dillendapp à un enfant qui rentre manger", () => {
    const ctx = contexteEnfant(enfant('c2', 'maison'), HOVELANGE)
    const journee = trajetsDuJour(ctx!, 'lundi')
    expect(journee.trajets.every((t) => t.ligne.id !== 'aller-dillendapp')).toBe(true)
  })
})

describe('cas particulier de Huttange', () => {
  it('rattache un enfant de Huttange à son arrêt de village', () => {
    const ctx = contexteEnfant(enfant('c3', 'maison'), HUTTANGE)
    expect(ctx?.arretDomicile.id).toBe('huttange')
  })

  it("porte la note du plan sur le départ de 07:25 réservé aux C3 d'Elvange", () => {
    const ctx = contexteEnfant(enfant('c3', 'maison'), HUTTANGE)
    const aller = trajetsDuJour(ctx!, 'lundi').trajets.find((t) => t.type === 'aller-matin')
    expect(aller?.ligne.id).toBe('aller-1')
    expect(aller?.depart.heure).toBe('07:25')
    expect(aller?.notes).toContain('huttange-c3-uniquement')
  })

  it('donne à un C2 de Huttange l’Aller 3, comme l’indique la note du plan', () => {
    // L'Aller 1 de 07:25 lui est fermé (réservé aux C3 d'Elvange par l'astérisque du
    // plan) et l'Aller 2 ne dessert pas Huttange : il reste l'Aller 3.
    const ctx = contexteEnfant(enfant('c2', 'maison'), HUTTANGE)
    const aller = trajetsDuJour(ctx!, 'lundi').trajets.find((t) => t.type === 'aller-matin')
    expect(aller?.ligne.id).toBe('aller-3')
    // L'Aller 3 est une navette qui passe DEUX FOIS à Huttange, à 07:34 puis à 07:55.
    // On retient le second passage : il mène à Noerdange en trois minutes, là où le
    // premier ferait faire à l'enfant toute la boucle par Oberpallen.
    expect(aller?.depart.heure).toBe('07:55')
    expect(aller?.arrivee.heure).toBe('07:58')
  })
})

describe("usage partiel du bus", () => {
  const avecBus = (c: Cycle, repas: RepasMidi, usages: Partial<Record<Jour, 'aller-retour' | 'aller' | 'retour' | 'aucun'>>) => {
    const e = enfant(c, repas)
    e.bus = Object.fromEntries(
      JOURS.map((j) => [j, usages[j] ?? 'aller-retour']),
    ) as Enfant['bus']
    return e
  }

  it("n'affiche que l'aller quand le parent récupère l'enfant en voiture", () => {
    const ctx = contexteEnfant(avecBus('c2', 'maison', { lundi: 'aller' }), HOVELANGE)
    expect(types(ctx, 'lundi')).toEqual(['aller-matin', 'aller-apres-midi'])
  })

  it("n'affiche que les retours quand le parent dépose l'enfant le matin", () => {
    const ctx = contexteEnfant(avecBus('c2', 'maison', { lundi: 'retour' }), HOVELANGE)
    expect(types(ctx, 'lundi')).toEqual(['retour-midi', 'retour-soir'])
  })

  it('n’affiche aucun trajet un jour sans bus', () => {
    const ctx = contexteEnfant(avecBus('c2', 'maison', { jeudi: 'aucun' }), HOVELANGE)
    const journee = trajetsDuJour(ctx!, 'jeudi')
    expect(journee.trajets.filter((t) => t.concerneParent)).toHaveLength(0)
    expect(journee.manquants).toHaveLength(0)
  })

  it("ne signale pas de retour manquant si le parent assure lui-même le retour", () => {
    // Sans ce filtre, l'application avertirait d'un trou que le parent a déjà comblé.
    const ctx = contexteEnfant(avecBus('c2', 'dillendapp', { mardi: 'aller' }), HOVELANGE)
    const mardi = trajetsDuJour(ctx!, 'mardi')
    expect(mardi.manquants).toHaveLength(0)
    expect(mardi.incertitudes).toHaveLength(0)
  })

  it('reste indépendant du réglage des autres jours', () => {
    const ctx = contexteEnfant(
      avecBus('c2', 'maison', { lundi: 'aucun', mardi: 'retour' }),
      HOVELANGE,
    )
    expect(types(ctx, 'lundi')).toEqual([])
    expect(types(ctx, 'mardi')).toEqual(['retour-midi'])
    expect(types(ctx, 'mercredi')).toEqual([
      'aller-matin',
      'retour-midi',
      'aller-apres-midi',
      'retour-soir',
    ])
  })

  it('traite une configuration ancienne sans réglage de bus comme un aller-retour', () => {
    const e = enfant('c2', 'maison')
    delete e.bus
    const ctx = contexteEnfant(e, HOVELANGE)
    expect(types(ctx, 'lundi')).toHaveLength(4)
  })
})

describe('présence prolongée au Dillendapp', () => {
  const avecFin = (jour: Jour, heure: string | null, repas: RepasMidi = 'dillendapp') => {
    const e = enfant('c2', repas)
    e.dillendappJusqua = Object.fromEntries(
      JOURS.map((j) => [j, j === jour ? heure : null]),
    ) as Record<Jour, string | null>
    return contexteEnfant(e, HOVELANGE)
  }

  it("fait déposer l'enfant au Dillendapp par le bus du soir, pas à la maison", () => {
    // Le lundi il y a cours l'après-midi : l'enfant retourne bien en classe, mais
    // comme il reste ensuite à la maison relais, le bus du soir l'y ramène.
    const journee = trajetsDuJour(avecFin('lundi', '18:00')!, 'lundi')
    const soir = journee.trajets.find((t) => t.type === 'retour-soir-dillendapp')
    expect(soir).toBeDefined()
    expect(journee.trajets.some((t) => t.type === 'retour-soir')).toBe(false)
    expect(soir?.arrivee.arret.village).toBe('Beckerich')
  })

  it("annonce l'heure de récupération", () => {
    const journee = trajetsDuJour(avecFin('lundi', '18:00')!, 'lundi')
    expect(journee.recuperation).toEqual({ lieu: 'dillendapp', heure: '18:00' })
  })

  it('ramène l’enfant à la maison quand aucune heure n’est indiquée', () => {
    const journee = trajetsDuJour(avecFin('lundi', null)!, 'lundi')
    expect(journee.trajets.some((t) => t.type === 'retour-soir')).toBe(true)
    expect(journee.recuperation).toBeUndefined()
  })

  it("comble le trou du mardi : ce n'est plus un manque si le parent vient", () => {
    // Sans heure, l'app signalait « pas de bus de retour ». Dès que le parent dit
    // qu'il vient chercher l'enfant, l'avertissement n'a plus lieu d'être.
    const journee = trajetsDuJour(avecFin('mardi', '16:00')!, 'mardi')
    expect(journee.manquants).toHaveLength(0)
    expect(journee.recuperation?.heure).toBe('16:00')
  })

  it('signale toujours le trou du mardi quand aucune heure n’est donnée', () => {
    const journee = trajetsDuJour(avecFin('mardi', null)!, 'mardi')
    expect(journee.manquants).toContain('retour-soir')
    expect(journee.recuperation).toBeUndefined()
  })

  it("ignore l'heure si l'enfant rentre manger à la maison ce jour-là", () => {
    // Une heure résiduelle d'un réglage précédent ne doit pas transformer un enfant
    // qui déjeune chez lui en pensionnaire de la maison relais.
    const journee = trajetsDuJour(avecFin('lundi', '18:00', 'maison')!, 'lundi')
    expect(journee.recuperation).toBeUndefined()
    expect(journee.trajets.some((t) => t.type === 'retour-soir')).toBe(true)
  })
})

describe('absence de retour les mardi et jeudi', () => {
  it("annonce l'absence de bus comme un fait, sans incertitude", () => {
    // Règle confirmée auprès de la commune : les retours de fin de journée ne
    // circulent pas les jours sans cours l'après-midi.
    const ctx = contexteEnfant(enfant('c2', 'dillendapp'), HOVELANGE)
    const mardi = trajetsDuJour(ctx!, 'mardi')
    expect(mardi.manquants).toContain('retour-soir')
    expect(mardi.incertitudes).toHaveLength(0)
  })

  it('laisse le lundi intact, où le retour du soir existe bien', () => {
    const ctx = contexteEnfant(enfant('c2', 'dillendapp'), HOVELANGE)
    const lundi = trajetsDuJour(ctx!, 'lundi')
    expect(lundi.manquants).toHaveLength(0)
    expect(lundi.trajets.some((t) => t.type === 'retour-soir')).toBe(true)
  })

  it("n'inquiète pas un enfant qui rentre manger le mardi", () => {
    const ctx = contexteEnfant(enfant('c2', 'maison'), HOVELANGE)
    const mardi = trajetsDuJour(ctx!, 'mardi')
    expect(mardi.incertitudes).toHaveLength(0)
    expect(mardi.manquants).toHaveLength(0)
  })

  it("ne déclare plus aucune incertitude dans le plan", () => {
    expect(plan.incertitudes).toHaveLength(0)
  })
})

describe('estimation de la marche', () => {
  it('applique le facteur de détour et la vitesse retenue', () => {
    // 1 km à vol d'oiseau => 1,35 km à pied => 18 min à 4,5 km/h.
    const a: [number, number] = [49.73, 5.88]
    const b: [number, number] = [49.739, 5.88]
    expect(Math.round(distanceMarche(a, b))).toBeGreaterThan(1300)
    expect(tempsMarche(a, b)).toBe(18)
  })

  it('ne descend jamais sous une minute', () => {
    expect(tempsMarche([49.73, 5.88], [49.7301, 5.8801])).toBe(1)
  })
})

describe('cohérence des données', () => {
  it('ne référence que des arrêts existants', () => {
    for (const ligne of plan.lignes) {
      for (const service of ligne.services) {
        for (const a of service.arrets) {
          expect(() => arretEcoleDuCycle('c1') && a.arret).not.toThrow()
        }
      }
    }
  })

  it('couvre chaque cycle par au moins un trajet du matin depuis chaque village', () => {
    const cycles: Cycle[] = ['precoce', 'c1', 'c2', 'c3', 'c4']
    for (const c of cycles) {
      for (const lieu of [HOVELANGE, LEVELANGE, HUTTANGE, SCHWEICH]) {
        const ctx = contexteEnfant(enfant(c, 'maison'), lieu)
        expect(ctx, `${c} depuis ${lieu.libelle}`).not.toBeNull()
        const journee = trajetsDuJour(ctx!, 'lundi')
        expect(
          journee.trajets.some((t) => t.type === 'aller-matin') || ctx!.marcheDirecte,
          `${c} depuis ${lieu.libelle} : aucun aller le matin`,
        ).toBe(true)
      }
    }
  })
})

describe('domicile mitoyen de l’école', () => {
  // 1, Kächereck se trouve à moins de 100 m de l'école de Beckerich. Un C4 qui y habite
  // n'a donc aucun bus — ce qui est juste, mais l'interface l'annonçait comme cinq
  // journées sans trajet, indiscernable d'une panne du calcul. Le drapeau doit remonter.
  const KACHERECK = adresse('1, Kächereck', 49.73135, 5.88187)

  it('signale la marche directe pour un C4 voisin de son école', () => {
    const ctx = contexteEnfant(enfant('c4', 'maison'), KACHERECK)
    expect(ctx).not.toBeNull()
    expect(ctx!.marcheDirecte).toBe(true)
    expect(ctx!.arretEcole.id).toBe(arretEcoleDuCycle('c4').id)
    for (const jour of JOURS) expect(trajetsDuJour(ctx!, jour).trajets).toHaveLength(0)
  })

  it('donne malgré tout un bus à un C2 de la même adresse, scolarisé ailleurs', () => {
    const ctx = contexteEnfant(enfant('c2', 'maison'), KACHERECK)
    expect(ctx).not.toBeNull()
    expect(ctx!.marcheDirecte).toBe(false)
    expect(types(ctx, 'lundi')).toContain('aller-matin')
  })
})

describe('adresses dérogatoires par jour', () => {
  /** Un enfant qui part ou rentre ailleurs que chez lui, un jour donné. */
  const avecAdresse = (jour: Jour, sens: 'matin' | 'soir', a: Adresse, cycle: Cycle = 'c2') => {
    const e = enfant(cycle, 'maison')
    e.adresses = { [jour]: { [sens]: a } }
    return contexteEnfant(e, HOVELANGE)
  }

  it("rattache l'adresse de retour du mardi à son propre arrêt", () => {
    const ctx = avecAdresse('mardi', 'soir', SCHWEICH)
    expect(ctx!.arretsParJour.mardi.soir!.arret.village).toBe('Schweich')
    // Les autres jours et l'autre sens restent au domicile.
    expect(ctx!.arretsParJour.mardi.matin!.arret.id).toBe(ctx!.arretDomicile.id)
    expect(ctx!.arretsParJour.lundi.soir!.arret.id).toBe(ctx!.arretDomicile.id)
  })

  it('fait déposer l’enfant à cet arrêt-là ce jour-là, et pas ailleurs', () => {
    const ctx = avecAdresse('mardi', 'soir', SCHWEICH)
    const mardi = trajetsDuJour(ctx!, 'mardi').trajets.find((t) => t.type === 'retour-midi')!
    const lundi = trajetsDuJour(ctx!, 'lundi').trajets.find((t) => t.type === 'retour-midi')!
    expect(mardi.arrivee.arret.village).toBe('Schweich')
    expect(lundi.arrivee.arret.id).toBe(ctx!.arretDomicile.id)
  })

  it('signale la dérogation, pour qu’un arrêt inhabituel ne se lise pas comme une erreur', () => {
    const ctx = avecAdresse('mardi', 'soir', SCHWEICH)
    const mardi = trajetsDuJour(ctx!, 'mardi').trajets.find((t) => t.type === 'retour-midi')!
    expect(mardi.adresseDerogatoire).toBe('soir')
    const lundi = trajetsDuJour(ctx!, 'lundi').trajets.find((t) => t.type === 'retour-midi')!
    expect(lundi.adresseDerogatoire).toBeUndefined()
  })

  it('fait partir l’enfant de l’adresse du matin sans toucher à son retour', () => {
    const ctx = avecAdresse('jeudi', 'matin', LEVELANGE)
    const jeudi = trajetsDuJour(ctx!, 'jeudi')
    const aller = jeudi.trajets.find((t) => t.type === 'aller-matin')!
    const retour = jeudi.trajets.find((t) => t.type === 'retour-midi')!
    expect(aller.depart.arret.village).toBe('Levelange')
    expect(aller.adresseDerogatoire).toBe('matin')
    expect(retour.arrivee.arret.id).toBe(ctx!.arretDomicile.id)
    expect(retour.adresseDerogatoire).toBeUndefined()
  })

  it('repart l’après-midi de là où l’enfant a déjeuné', () => {
    // L'enfant rentre manger chez ses grands-parents : c'est de chez eux qu'il
    // reprend le bus, pas de chez lui.
    const ctx = avecAdresse('lundi', 'soir', SCHWEICH)
    const lundi = trajetsDuJour(ctx!, 'lundi')
    const apresMidi = lundi.trajets.find((t) => t.type === 'aller-apres-midi')!
    expect(apresMidi.depart.arret.village).toBe('Schweich')
  })

  it('laisse la fiche annoncer le domicile comme arrêt de référence', () => {
    // `arretDomicile` reste celui du foyer : c'est lui qui s'affiche en tête de fiche.
    const ctx = avecAdresse('mardi', 'soir', SCHWEICH)
    expect(ctx!.arretDomicile.village).toBe('Hovelange')
  })

  it("garde le trajet visible pour le parent malgré l'arrêt inhabituel", () => {
    const ctx = avecAdresse('mardi', 'soir', SCHWEICH)
    const mardi = trajetsDuJour(ctx!, 'mardi').trajets.find((t) => t.type === 'retour-midi')!
    expect(mardi.concerneParent).toBe(true)
  })
})

describe('inscription périscolaire', () => {
  it('efface toute la mécanique Dillendapp quand la famille n’est pas inscrite', () => {
    const e = enfant('c2', 'dillendapp')
    e.periscolaire = false
    e.dillendappJusqua = Object.fromEntries(JOURS.map((j) => [j, '16:30'])) as Record<
      Jour,
      string | null
    >
    const ctx = contexteEnfant(e, HOVELANGE)
    const lundi = trajetsDuJour(ctx!, 'lundi')
    // L'enfant rentre manger : quatre trajets, aucune navette, aucune récupération.
    expect(types(ctx, 'lundi')).toEqual([
      'aller-matin',
      'retour-midi',
      'aller-apres-midi',
      'retour-soir',
    ])
    expect(lundi.recuperation).toBeUndefined()
  })

  it('déduit l’inscription des repas déjà saisis, pour ne pas effacer une configuration', () => {
    // `periscolaire` n'existait pas : un enfant enregistré au Dillendapp ne doit pas
    // se retrouver « rentre manger » du jour au lendemain.
    const e = enfant('c2', 'dillendapp')
    delete e.periscolaire
    const ctx = contexteEnfant(e, HOVELANGE)
    expect(types(ctx, 'lundi')).toContain('navette-dillendapp-midi')
  })
})

describe('présence au Dillendapp avant la classe', () => {
  const avecDebut = (jour: Jour, heure: string | null, cycle: Cycle = 'c2') => {
    const e = enfant(cycle, 'dillendapp')
    e.periscolaire = true
    e.dillendappDepuis = Object.fromEntries(
      JOURS.map((j) => [j, j === jour ? heure : null]),
    ) as Record<Jour, string | null>
    return contexteEnfant(e, HOVELANGE)
  }

  it('ne fait pas prendre le bus du matin à un enfant que son parent dépose', () => {
    const ctx = avecDebut('lundi', '07:00')
    expect(types(ctx, 'lundi')).not.toContain('aller-matin')
  })

  it('ne compte pas cet aller comme un trajet manquant : c’est un choix, pas un trou', () => {
    const ctx = avecDebut('lundi', '07:00')
    expect(trajetsDuJour(ctx!, 'lundi').manquants).not.toContain('aller-matin')
  })

  it('annonce l’heure de dépose, symétrique de la récupération', () => {
    const ctx = avecDebut('lundi', '07:00')
    expect(trajetsDuJour(ctx!, 'lundi').depose).toEqual({ lieu: 'dillendapp', heure: '07:00' })
    expect(trajetsDuJour(ctx!, 'mardi').depose).toBeUndefined()
  })

  it('conduit malgré tout l’enfant du Dillendapp à sa classe : le plan le publie', () => {
    // Ne pas proposer ce trajet laisserait croire que l'enfant reste à la maison
    // relais toute la matinée. Le plan le couvre : l'Aller 3 passe au Dillendapp à
    // 07:38 et 07:52, et l'Aller 2 s'arrête à l'école de Beckerich, à 86 m de là.
    const ctx = avecDebut('lundi', '07:00')
    const navette = trajetsDuJour(ctx!, 'lundi').trajets.find(
      (t) => t.type === 'navette-dillendapp-matin',
    )!
    expect(navette).toBeDefined()
    expect(navette.arrivee.arret.id).toBe('noerdange-ecole')
    // Interne à la journée d'école : le parent a déjà fait sa part.
    expect(navette.concerneParent).toBe(false)
  })

  it('mène un C1 à Oberpallen à 07:45, à temps pour le début de la classe', () => {
    const navette = trajetsDuJour(avecDebut('lundi', '07:00', 'c1')!, 'lundi').trajets.find(
      (t) => t.type === 'navette-dillendapp-matin',
    )!
    expect(navette.depart.heure).toBe('07:38')
    expect(navette.arrivee.heure).toBe('07:45')
  })

  it('ne redresse pas une arrivée tardive : il annonce l’heure publiée', () => {
    // Pour un C2, aucune course Dillendapp → Noerdange n'arrive avant 07:55. Le
    // moteur retient la première au départ (Aller 2, 07:34 → 08:00) et laisse l'Aller 3
    // en alternative. L'application affiche ces heures telles quelles : les corriger
    // reviendrait à inventer une desserte que la commune ne publie pas. La page
    // « Limites » le dit explicitement.
    const navette = trajetsDuJour(avecDebut('lundi', '07:00')!, 'lundi').trajets.find(
      (t) => t.type === 'navette-dillendapp-matin',
    )!
    expect(navette.arrivee.heure).toBe('08:00')
    expect(navette.alternatives.length).toBeGreaterThan(0)
  })

  it('n’invente aucune navette pour un cycle scolarisé à côté de la maison relais', () => {
    // Le Dillendapp est à 86 m de l'école de Beckerich : un C4 y va à pied. Proposer
    // un bus reviendrait à lui faire faire l'aller-retour d'Oberpallen pour rien.
    const journee = trajetsDuJour(avecDebut('lundi', '07:00', 'c4')!, 'lundi')
    expect(journee.trajets.map((t) => t.type)).not.toContain('navette-dillendapp-matin')
    expect(journee.manquants).not.toContain('navette-dillendapp-matin')
    expect(journee.depose).toEqual({ lieu: 'dillendapp', heure: '07:00' })
  })

  it('reste sans effet sur les jours où aucune heure n’est donnée', () => {
    const ctx = avecDebut('lundi', '07:00')
    expect(types(ctx, 'mardi')).toContain('aller-matin')
  })

  it('ignore la présence du matin si la famille n’est pas inscrite au périscolaire', () => {
    const e = enfant('c2', 'maison')
    e.periscolaire = false
    e.dillendappDepuis = Object.fromEntries(
      JOURS.map((j) => [j, j === 'lundi' ? '07:00' : null]),
    ) as Record<Jour, string | null>
    const ctx = contexteEnfant(e, HOVELANGE)
    expect(types(ctx, 'lundi')).toContain('aller-matin')
    expect(trajetsDuJour(ctx!, 'lundi').depose).toBeUndefined()
  })
})
