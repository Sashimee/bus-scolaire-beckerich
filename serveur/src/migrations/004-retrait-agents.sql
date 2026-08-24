-- Retrait des espaces à code personnel, repliés sur les comptes à capacités.
--
-- Les deux tables `agent_commune` et `agent_traduction` portaient les empreintes des
-- codes d'accès de l'espace commune et de l'espace traduction. Ces deux espaces sont
-- désormais servis par les comptes du lot 24 : une capacité (`perturbations`,
-- `horaires`, `traductions`) remplace chaque rôle figé, et l'édition passe par
-- `/edition/*`. Plus aucune route ne lit ces tables — les garder, c'est laisser deux
-- portes murées avec leur serrure.
--
-- Le déploiement est parti à neuf (les codes vivaient dans le clé-valeur Cloudflare,
-- jamais repris — voir R39) : ces tables sont vides en production. `if exists` couvre
-- une base neuve où elles n'auraient jamais été créées.
drop table if exists agent_commune;
drop table if exists agent_traduction;
