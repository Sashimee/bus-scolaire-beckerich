-- Schéma initial : reprise de l'espace clé-valeur `ABONNEMENTS`, qui tenait huit
-- natures de données dans un seul sac, distinguées par un préfixe de clé.
--
-- Une table par nature. Ce n'est pas de la cosmétique : sur le clé-valeur, purger le
-- journal à 90 jours et purger les états de rappel à 30 jours étaient la même
-- opération, écrite deux fois, avec deux TTL passés à la main à chaque écriture.

-- — Abonnements aux notifications ————————————————————————————————
--
-- `endpoint_hash` et non `endpoint` en clé : se réabonner depuis le même navigateur
-- ne doit pas créer de doublon. C'était déjà le cas sur le clé-valeur.
create table if not exists abonnement (
  endpoint_hash   text primary key,
  endpoint        text        not null,
  cles            jsonb       not null,
  preference      text        not null default 'urgences-rappels',
  cree_le         timestamptz not null default now(),
  dernier_succes  timestamptz
);

-- — Agents ————————————————————————————————————————————————————————
--
-- DEUX tables et non une table avec une colonne `role`.
--
-- La séparation entre l'espace commune et l'espace traduction tenait à deux barrières
-- indépendantes : les préfixes `agent:` et `traducteur:` — un code de l'un n'existait
-- littéralement pas là où l'autre le cherchait — et le rôle réinscrit dans le jeton,
-- revérifié à chaque route. Une table unique avec un `where role = …` n'en laisserait
-- qu'une, et la ferait dépendre d'une clause qu'un jour quelqu'un oubliera.
create table if not exists agent_commune (
  code_hash      text primary key,
  nom            text        not null,
  service        text        not null default '',
  cree_le        timestamptz not null default now(),
  dernier_acces  timestamptz
);

create table if not exists agent_traduction (
  code_hash      text primary key,
  nom            text        not null,
  service        text        not null default '',
  cree_le        timestamptz not null default now(),
  dernier_acces  timestamptz
);

-- — Journal des publications ——————————————————————————————————————
--
-- Purgé à 90 jours par le balayeur. Sur le clé-valeur, l'ordre chronologique était
-- obtenu en préfixant la clé d'un horodatage et en triant les noms : ici, `quand`
-- est une vraie colonne, et l'index fait le travail.
create table if not exists journal (
  id       bigserial primary key,
  quand    timestamptz not null default now(),
  qui      text        not null,
  service  text        not null default '',
  action   text        not null,
  detail   text        not null default ''
);

create index if not exists journal_quand on journal (quand desc);

-- — Éphémères ——————————————————————————————————————————————————————
--
-- Ce que le clé-valeur expirait tout seul : états OAuth (10 min), verrous d'essai
-- (1 min), états de rappel (30 j). `expire_le` remplace le `expirationTtl`, et toute
-- lecture le filtre — le balayeur ne fait que récupérer la place, il n'est jamais
-- ce qui garantit l'expiration.
create table if not exists ephemere (
  cle        text primary key,
  valeur     jsonb       not null,
  expire_le  timestamptz not null
);

create index if not exists ephemere_expire on ephemere (expire_le);

-- — Limitation de débit ————————————————————————————————————————————
--
-- Table à part, et non un éphémère, parce que c'est le seul endroit qui a besoin
-- d'un incrément ATOMIQUE. Sur le clé-valeur, le compteur se lisait puis se
-- réécrivait ; entre les deux, la cohérence différée laissait passer des tentatives
-- supplémentaires — c'est la réserve R4, et elle se lève ici par un seul
-- `insert … on conflict do update … returning`.
create table if not exists debit (
  ip_hash      text primary key,
  compte       integer     not null,
  fenetre_fin  timestamptz not null
);

create index if not exists debit_fenetre on debit (fenetre_fin);
