-- Mesure de fréquentation auto-hébergée (lots 27-28).
--
-- Remplace le compteur externe GoatCounter : plus aucun relevé ne part vers un service
-- tiers, il est reçu et agrégé ici. Rien de personnel n'y entre — un chemin d'écran
-- normalisé (jamais un identifiant d'enfant, jamais un fragment de partage) et une date,
-- pas d'adresse IP, pas de cookie, pas d'horodatage plus fin que le jour.
--
-- Une ligne par (jour, chemin) : l'endpoint incrémente `vues` en un seul énoncé atomique,
-- comme le compteur de débit. La table reste minuscule — au plus une poignée de chemins
-- connus par jour.
create table if not exists mesure (
  jour    date  not null,
  chemin  text  not null,
  vues    integer not null default 0,
  primary key (jour, chemin)
);
