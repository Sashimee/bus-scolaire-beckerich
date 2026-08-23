-- Lot 24 : comptes utilisateurs à capacités.
--
-- Retirer l'espace `/admin` (jeton GitHub personnel) laissait sans foyer l'édition des
-- corrections d'arrêts et des crédits. Plutôt qu'une barrière de plus, on pose une
-- authentification par compte, à capacités, sur laquelle le lot 25 gréera toute la
-- publication. Les deux espaces à code personnel (`agent_commune`, `agent_traduction`)
-- continuent de fonctionner en parallèle jusque-là.
--
-- Le mot de passe n'est jamais stocké en clair ni journalisé : seulement son empreinte
-- argon2id. Les jetons de vérification d'adresse et de réinitialisation ne prennent pas
-- de table — ils vivent dans `ephemere`, dont l'expiration est filtrée à la lecture.
create table if not exists utilisateur (
  courriel           text primary key,
  mot_de_passe_hash  text        not null,
  nom                text        not null,
  -- Sous-ensemble de { perturbations, arrets, horaires, traductions, credits, comptes }.
  -- Une liste, et non des colonnes booléennes : la liste des capacités bougera, la
  -- forme de la table ne devrait pas bouger avec elle.
  capacites          jsonb       not null default '[]'::jsonb,
  service            text        not null default '',
  -- Langue des courriels que ce compte reçoit (vérification, réinitialisation).
  langue             text        not null default 'fr',
  courriel_verifie   boolean     not null default false,
  desactive          boolean     not null default false,
  cree_le            timestamptz not null default now(),
  dernier_acces      timestamptz
);
