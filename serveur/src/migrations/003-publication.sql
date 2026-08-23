-- Lot 25 : la publication quitte le dépôt GitHub.
--
-- Perturbations, corrections d'arrêts, surcouche de traduction, horaires et crédits
-- vivaient dans des fichiers du dépôt, publiés par écriture GitHub puis reconstruction.
-- Ils vivent désormais en base, publiés par l'espace agents (aux capacités du lot 24) et
-- servis par l'API. Plus aucune écriture dans le dépôt.

-- Perturbations : une ligne par perturbation. La donnée entière en jsonb, telle qu'elle
-- est servie aux parents. La clé porte l'identifiant de la perturbation.
create table if not exists perturbation (
  id         text primary key,
  donnees    jsonb       not null,
  publie_le  timestamptz not null default now()
);

-- Corrections de position d'arrêt : une ligne par arrêt corrigé. Séparées des
-- perturbations — c'était déjà deux listes distinctes dans `urgences.json` — parce
-- qu'une correction n'a ni gravité, ni rappel, ni date de publication à notifier.
create table if not exists correction_arret (
  arret      text primary key,
  donnees    jsonb       not null,
  publie_le  timestamptz not null default now()
);

-- Documents à ligne unique : la surcouche de traduction, le plan (horaires) et les
-- crédits. Chacun est un blob courant, versionné pour que le client détecte une mise à
-- jour sans tout retélécharger. `nom` vaut 'traductions', 'horaires' ou 'credits'.
create table if not exists document (
  nom         text primary key,
  contenu     jsonb       not null,
  version     text        not null default '',
  mis_a_jour  timestamptz not null default now()
);
