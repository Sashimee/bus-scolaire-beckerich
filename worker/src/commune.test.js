import { beforeEach, describe, expect, it } from 'vitest'
import {
  agentDeLaRequete,
  egalConstant,
  empreinte,
  perturbationPropre,
  routerCommune,
  routerTraductions,
  signerJeton,
  validerPerturbation,
  verifierJeton,
} from './commune.js'

const SECRET = 'secret-de-test-suffisamment-long'

/** KV en mémoire, avec le peu de surface que le Worker utilise réellement. */
function kv() {
  const donnees = new Map()
  return {
    donnees,
    async get(cle) {
      return donnees.has(cle) ? donnees.get(cle) : null
    },
    async put(cle, valeur) {
      donnees.set(cle, valeur)
    },
    async delete(cle) {
      donnees.delete(cle)
    },
    async list({ prefix }) {
      return { keys: [...donnees.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }
    },
  }
}

let env

beforeEach(() => {
  env = {
    ABONNEMENTS: kv(),
    SECRET_SESSION: SECRET,
    GITHUB_PAT: 'jeton-machine',
    ORIGINES_AUTORISEES: 'https://exemple.lu',
  }
})

const requete = (methode, chemin, { corps, jeton, ip = '1.2.3.4' } = {}) =>
  new Request(`https://worker.test${chemin}`, {
    method: methode,
    headers: {
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      'CF-Connecting-IP': ip,
    },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  })

/** Les deux routeurs, dans l'ordre où `index.js` les consulte. */
const router = async (r) => {
  const url = new URL(r.url)
  return (await routerCommune(r, env, url, {})) ?? (await routerTraductions(r, env, url, {}))
}

async function inscrireAgent(code, nom = 'Marie', service = 'service technique') {
  await env.ABONNEMENTS.put(
    'agent:' + (await empreinte(code)),
    JSON.stringify({ nom, service, cree: '2026-08-08' }),
  )
}

describe('comparaison à temps constant', () => {
  it('reconnaît deux chaînes identiques', () => {
    expect(egalConstant('abc', 'abc')).toBe(true)
  })

  it('refuse tout ce qui diffère, y compris par la longueur', () => {
    expect(egalConstant('abc', 'abd')).toBe(false)
    expect(egalConstant('abc', 'abcd')).toBe(false)
    expect(egalConstant('abc', undefined)).toBe(false)
  })
})

describe('jeton de session', () => {
  it('fait un aller-retour sans perte', async () => {
    const expire = Math.floor(Date.now() / 1000) + 60
    const jeton = await signerJeton({ nom: 'Marie', service: 'technique', expire }, SECRET)
    const charge = await verifierJeton(jeton, SECRET)
    expect(charge.nom).toBe('Marie')
    expect(charge.service).toBe('technique')
  })

  it('refuse un jeton signé avec un autre secret', async () => {
    const jeton = await signerJeton({ nom: 'Marie', expire: Date.now() / 1000 + 60 }, 'autre')
    expect(await verifierJeton(jeton, SECRET)).toBeNull()
  })

  it('refuse un jeton dont la charge a été retouchée', async () => {
    const jeton = await signerJeton({ nom: 'Marie', expire: Date.now() / 1000 + 60 }, SECRET)
    const [, signature] = jeton.split('.')
    const forge = btoa(JSON.stringify({ nom: 'Pirate', expire: Date.now() / 1000 + 99999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(await verifierJeton(`${forge}.${signature}`, SECRET)).toBeNull()
  })

  it('refuse un jeton expiré', async () => {
    const jeton = await signerJeton({ nom: 'Marie', expire: Date.now() / 1000 - 1 }, SECRET)
    expect(await verifierJeton(jeton, SECRET)).toBeNull()
  })

  it('refuse ce qui ne ressemble pas à un jeton', async () => {
    expect(await verifierJeton('', SECRET)).toBeNull()
    expect(await verifierJeton('n-importe-quoi', SECRET)).toBeNull()
    expect(await verifierJeton(null, SECRET)).toBeNull()
  })
})

describe('connexion par code', () => {
  it('remet un jeton de session à un code connu', async () => {
    await inscrireAgent('abcd-1234')
    const rep = await router(
      requete('POST', '/commune/connexion', { corps: { code: 'abcd-1234' } }),
    )
    expect(rep.status).toBe(200)
    const { jeton, nom } = await rep.json()
    expect(nom).toBe('Marie')
    expect((await verifierJeton(jeton, SECRET)).nom).toBe('Marie')
  })

  it('accepte le code quelle que soit la casse ou les espaces autour', async () => {
    await inscrireAgent('abcd-1234')
    const rep = await router(
      requete('POST', '/commune/connexion', { corps: { code: '  ABCD-1234 ' } }),
    )
    expect(rep.status).toBe(200)
  })

  it('refuse un code inconnu sans dire pourquoi', async () => {
    await inscrireAgent('abcd-1234')
    const rep = await router(
      requete('POST', '/commune/connexion', { corps: { code: 'mauvais-code' } }),
    )
    expect(rep.status).toBe(401)
    expect((await rep.json()).erreur).toBe('code-inconnu')
  })

  it('ne stocke jamais le code lui-même, seulement son empreinte', async () => {
    await inscrireAgent('abcd-1234')
    const tout = [...env.ABONNEMENTS.donnees.entries()].flat().join(' ')
    expect(tout).not.toContain('abcd-1234')
  })

  it('bloque après cinq tentatives dans le quart d’heure', async () => {
    await inscrireAgent('abcd-1234')
    for (let i = 0; i < 5; i++) {
      await router(requete('POST', '/commune/connexion', { corps: { code: `faux-${i}` } }))
    }
    const rep = await router(
      // Même le bon code est refusé une fois la limite atteinte : c'est le principe.
      requete('POST', '/commune/connexion', { corps: { code: 'abcd-1234' } }),
    )
    expect(rep.status).toBe(429)
    expect((await rep.json()).erreur).toBe('trop-de-tentatives')
  })

  it('compte les tentatives par adresse, pas globalement', async () => {
    await inscrireAgent('abcd-1234')
    for (let i = 0; i < 5; i++) {
      await router(
        requete('POST', '/commune/connexion', { corps: { code: `faux-${i}` }, ip: '9.9.9.9' }),
      )
    }
    const rep = await router(
      requete('POST', '/commune/connexion', { corps: { code: 'abcd-1234' }, ip: '1.1.1.1' }),
    )
    expect(rep.status).toBe(200)
  })

  it('remet le compteur à zéro après une connexion réussie', async () => {
    await inscrireAgent('abcd-1234')
    for (let i = 0; i < 3; i++) {
      await router(requete('POST', '/commune/connexion', { corps: { code: `faux-${i}` } }))
    }
    await router(requete('POST', '/commune/connexion', { corps: { code: 'abcd-1234' } }))
    const cles = [...env.ABONNEMENTS.donnees.keys()].filter((k) => k.startsWith('debit:'))
    expect(cles).toEqual([])
  })

  it('note la date du dernier accès, pour repérer un code oublié', async () => {
    await inscrireAgent('abcd-1234')
    await router(requete('POST', '/commune/connexion', { corps: { code: 'abcd-1234' } }))
    const brut = await env.ABONNEMENTS.get('agent:' + (await empreinte('abcd-1234')))
    expect(JSON.parse(brut).dernierAcces).toBeTruthy()
  })
})

describe('contrôle d’accès des routes', () => {
  it('refuse une publication sans jeton', async () => {
    const rep = await router(requete('POST', '/commune/perturbations', { corps: {} }))
    expect(rep.status).toBe(401)
  })

  it('refuse une publication avec un jeton expiré', async () => {
    const jeton = await signerJeton({ nom: 'Marie', expire: Date.now() / 1000 - 1 }, SECRET)
    const rep = await router(requete('POST', '/commune/perturbations', { corps: {}, jeton }))
    expect(rep.status).toBe(401)
  })

  it('laisse passer les routes qui ne concernent pas la commune', async () => {
    expect(await router(requete('GET', '/sante'))).toBeNull()
  })

  it('refuse tout si l’espace commune n’est pas configuré', async () => {
    env.SECRET_SESSION = undefined
    const rep = await router(requete('POST', '/commune/connexion', { corps: { code: 'x' } }))
    expect(rep.status).toBe(503)
  })

  it('reconnaît l’agent porteur d’une session valide', async () => {
    const expire = Math.floor(Date.now() / 1000) + 60
    const jeton = await signerJeton(
      { nom: 'Marie', service: 'technique', role: 'commune', expire },
      SECRET,
    )
    const agent = await agentDeLaRequete(
      requete('GET', '/commune/journal', { jeton }),
      env,
      'commune',
    )
    expect(agent.nom).toBe('Marie')
  })

  it('lit un jeton d’avant les rôles comme un jeton de commune', async () => {
    // Les sessions déjà ouvertes au moment du déploiement ne portent pas de rôle :
    // les invalider déconnecterait un agent en pleine publication.
    const expire = Math.floor(Date.now() / 1000) + 60
    const jeton = await signerJeton({ nom: 'Marie', service: '', expire }, SECRET)
    const req = requete('GET', '/commune/journal', { jeton })
    expect((await agentDeLaRequete(req, env, 'commune'))?.nom).toBe('Marie')
    expect(await agentDeLaRequete(req, env, 'traductions')).toBeNull()
  })
})

describe('séparation des espaces commune et traduction', () => {
  /** Enregistre un code sous le préfixe du rôle demandé. */
  const poserCode = async (code, role, nom) => {
    const prefixe = role === 'traductions' ? 'traducteur:' : 'agent:'
    await env.ABONNEMENTS.put(prefixe + (await empreinte(code)), JSON.stringify({ nom }))
  }

  it('refuse un code de commune sur l’espace traduction, et l’inverse', async () => {
    // Deux préfixes KV distincts : le code de l'autre espace n'existe littéralement
    // pas là où on le cherche.
    await poserCode('aaaa-bbbb', 'commune', 'Marie')
    await poserCode('cccc-dddd', 'traductions', 'Jean')

    const essai = (chemin, code) =>
      router(requete('POST', chemin, { corps: { code } })).then((r) => r.status)

    expect(await essai('/traductions/connexion', 'aaaa-bbbb')).toBe(401)
    expect(await essai('/commune/connexion', 'cccc-dddd')).toBe(401)
    expect(await essai('/commune/connexion', 'aaaa-bbbb')).toBe(200)
    expect(await essai('/traductions/connexion', 'cccc-dddd')).toBe(200)
  })

  it('refuse un jeton de commune sur une route de traduction', async () => {
    // Seconde barrière, indépendante du préfixe : le rôle est inscrit dans le jeton
    // signé et revérifié à chaque route.
    const expire = Math.floor(Date.now() / 1000) + 60
    const jeton = await signerJeton({ nom: 'Marie', role: 'commune', expire }, SECRET)
    const rep = await router(
      requete('POST', '/traductions/publier', { jeton, corps: { surcouche: {} } }),
    )
    expect(rep.status).toBe(401)
  })

  it('applique la limitation de débit aux deux connexions', async () => {
    // Sans cela, l'espace le plus récent deviendrait la porte d'entrée de tous.
    for (let i = 0; i < 5; i++) {
      await router(requete('POST', '/traductions/connexion', { corps: { code: 'zzzz-zzzz' } }))
    }
    const rep = await router(
      requete('POST', '/traductions/connexion', { corps: { code: 'zzzz-zzzz' } }),
    )
    expect(rep.status).toBe(429)
  })
})

describe('validation des perturbations', () => {
  const valide = {
    id: 'u-2026-08-08-1',
    type: 'annulation',
    gravite: 'alerte',
    du: '2026-08-10',
    au: '2026-08-10',
    message: { fr: 'Le bus de 07:25 ne circule pas.' },
  }

  it('accepte une perturbation complète', () => {
    expect(validerPerturbation(valide)).toEqual([])
  })

  it("accepte les quatre types de l'application, et pas un de plus", () => {
    for (const type of ['annulation', 'retard', 'arret-deplace', 'message']) {
      const p = { ...valide, type, ...(type === 'retard' ? { minutes: 10 } : {}), ...(type === 'arret-deplace' ? { arret: 'levelange' } : {}) }
      expect(validerPerturbation(p), type).toEqual([])
    }
    // « information » n'existe pas côté application : l'accepter publierait une
    // perturbation que personne ne verrait.
    expect(validerPerturbation({ ...valide, type: 'information' })).toContain('type')
  })

  it('borne le nombre de rappels', () => {
    // Chaque rappel est un envoi répété à toutes les familles abonnées. Non borné, le
    // champ ferait du Worker un outil de harcèlement involontaire.
    expect(validerPerturbation({ ...valide, rappels: 2 })).toEqual([])
    expect(validerPerturbation({ ...valide, rappels: 0 })).toEqual([])
    expect(validerPerturbation({ ...valide, rappels: 4 })).toContain('rappels')
    expect(validerPerturbation({ ...valide, rappels: -1 })).toContain('rappels')
    expect(validerPerturbation({ ...valide, rappels: 1.5 })).toContain('rappels')
    expect(validerPerturbation({ ...valide, rappels: '3' })).toContain('rappels')
  })

  it('n’emporte que les champs connus dans le fichier publié', () => {
    // Le contenu était recopié tel quel : un `curl` pouvait glisser n'importe quel
    // champ dans un fichier public du dépôt. L'application l'aurait ignoré à la
    // lecture, mais il aurait bel et bien été publié.
    const propre = perturbationPropre({
      ...valide,
      rappels: 2,
      publiePar: 'Pirate',
      script: '<script>',
      nImporteQuoi: { profond: [1, 2, 3] },
    })
    expect(Object.keys(propre).sort()).toEqual(
      ['au', 'du', 'gravite', 'id', 'message', 'rappels', 'type'].sort(),
    )
  })

  it('refuse un type ou une gravité inventés', () => {
    expect(validerPerturbation({ ...valide, type: 'explosion' })).toContain('type')
    expect(validerPerturbation({ ...valide, gravite: 'panique' })).toContain('gravite')
  })

  it('refuse des dates mal formées ou à l’envers', () => {
    expect(validerPerturbation({ ...valide, du: '10/08/2026' })).toContain('du')
    expect(validerPerturbation({ ...valide, du: '2026-08-12', au: '2026-08-10' })).toContain(
      'ordre-dates',
    )
  })

  it('refuse un message absent, vide ou démesuré', () => {
    expect(validerPerturbation({ ...valide, message: undefined })).toContain('message')
    expect(validerPerturbation({ ...valide, message: { fr: '   ' } })).toContain('message')
    expect(validerPerturbation({ ...valide, message: { fr: 'x'.repeat(201) } })).toContain(
      'message',
    )
  })

  it('refuse une langue qui n’existe pas dans l’application', () => {
    expect(validerPerturbation({ ...valide, message: { fr: 'ok', zz: 'ok' } })).toContain(
      'langue-zz',
    )
  })

  it('borne le retard à des valeurs plausibles', () => {
    expect(validerPerturbation({ ...valide, type: 'retard', minutes: 15 })).toEqual([])
    expect(validerPerturbation({ ...valide, type: 'retard', minutes: 300 })).toContain('minutes')
    expect(validerPerturbation({ ...valide, type: 'retard', minutes: 0 })).toContain('minutes')
    expect(validerPerturbation({ ...valide, type: 'retard', minutes: 1.5 })).toContain('minutes')
  })

  it('exige une durée pour un retard et un arrêt pour un déplacement', () => {
    expect(validerPerturbation({ ...valide, type: 'retard' })).toContain('minutes-obligatoires')
    expect(validerPerturbation({ ...valide, type: 'arret-deplace' })).toContain(
      'arret-obligatoire',
    )
  })

  it('refuse une charge qui n’est pas un objet', () => {
    expect(validerPerturbation(null)).toEqual(['perturbation-absente'])
    expect(validerPerturbation('annulation')).toEqual(['perturbation-absente'])
  })
})
