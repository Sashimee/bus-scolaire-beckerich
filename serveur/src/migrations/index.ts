/**
 * Les migrations, embarquées dans le paquet.
 *
 * Lues par `import` et non depuis le disque : le serveur est empaqueté en un seul
 * fichier, et un `readdir` relatif au module aurait cherché un dossier `migrations/`
 * que l'image ne contient pas. La panne n'aurait eu lieu qu'au premier démarrage en
 * production, sur une base vide — le pire endroit pour la découvrir.
 *
 * Ajouter une migration : créer `00N-…​.sql` et l'ajouter à cette liste, dans l'ordre.
 */
import initial from './001-initial.sql'
import comptes from './002-comptes.sql'
import publication from './003-publication.sql'
import retraitAgents from './004-retrait-agents.sql'
import mesure from './005-mesure.sql'

export const MIGRATIONS: readonly { nom: string; sql: string }[] = [
  { nom: '001-initial.sql', sql: initial },
  { nom: '002-comptes.sql', sql: comptes },
  { nom: '003-publication.sql', sql: publication },
  { nom: '004-retrait-agents.sql', sql: retraitAgents },
  { nom: '005-mesure.sql', sql: mesure },
]
