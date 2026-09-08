# Plan d'évolution — Bus scolaire Beckerich

## Contexte

L'application fonctionne et rend déjà le service prévu : elle calcule, pour chaque enfant,
l'arrêt le plus proche et ses trajets jour par jour, hors ligne et sans serveur. Après
usage réel, une série de manques apparaissent — les uns purement visuels (heures de retour
illisibles, boutons qui débordent sur iPhone, bouton d'installation invisible), les autres
structurels : la configuration d'un enfant suppose un domicile unique et une présence au
Dillendapp limitée au midi, la page `/admin` exige un compte GitHub et sait éditer du JSON
brut, et l'intégration agenda s'arrête à un fichier `.ics` téléchargé.

L'objectif est de rendre l'application utilisable **par des parents pressés sur téléphone**
et **administrable par un agent communal non informaticien**, sans renoncer aux deux
principes du projet : aucune donnée personnelle ne quitte l'appareil, et l'application dit
ce qu'elle ne sait pas plutôt que de deviner.

Le travail est découpé en lots indépendants, lançables un par un — 13 à l'origine,
20 depuis les retours d'usage. Chaque lot est autonome : il compile, passe les tests et
peut être déployé seul. Les dépendances entre lots sont indiquées explicitement.

### Décisions déjà prises

| Sujet | Décision |
| --- | --- |
| Connexion des agents communaux | Code d'accès personnel vérifié par le Worker, qui publie sur GitHub avec un jeton machine. Aucun compte GitHub côté commune. |
| Google Agenda | Architecture préparée maintenant, ICS fortement amélioré ; l'intégration OAuth Google devient le lot 13, activable dès qu'un ID client existe. |
| Adresses par jour | Par enfant, avec départ (matin) et arrivée (soir) distincts. |
| Refonte UI/UX | Refonte visuelle complète : nouveau système de design (typographie, palette, espacements, composants) en plus de la mise en page. |

---

## Réserves ouvertes

Ce que les lots livrés **n'ont pas pu vérifier**, et comment le lever. Cette liste est
tenue à jour à chaque lot : une réserve énoncée et non inscrite ici est une réserve
perdue. Elle se raye quand la vérification a été faite, pas avant.

| # | Lot | Réserve | Comment la lever |
| --- | --- | --- | --- |
| R1 | 2, 7 | **La feuille du foyer débordait, et la cause n'était pas celle qu'on croyait.** Quatre corrections successives le 2026-08-09 sur la hauteur du contenu, puis la feuille d'un foyer de trois enfants est sortie le 2026-08-10 avec le vendredi **tronqué** — et « Page 1 sur 1 » en pied : WebKit avait coupé au lieu de paginer, ce qui ne laisse aucun indice à qui ne compare pas avec l'écran. Cause trouvée le 2026-08-10 : `table-layout: fixed` ne lit les largeurs que sur la PREMIÈRE rangée, et celle de la colonne des jours était posée sur le `tbody`. Les quatre colonnes se partageaient donc la feuille à parts égales — 46 mm pour « Jour » au lieu de 22 — et chaque trajet revenait à la ligne. Corrigé, mesuré à 222 mm pour un foyer réel et 236 mm pour le pire cas imaginable, sur 273 disponibles. **Mais la mesure reste celle de Chrome.** | Réimprimer la feuille du foyer à trois enfants. Elle doit tenir sur une page entière, vendredi compris. |
| ~~R2~~ | 6 | ~~L'installation réelle n'a pas été essayée.~~ **Levée le 2026-08-09** : installée depuis Safari sur l'iPhone de l'auteur, ouverte depuis l'icône. |
| ~~R3~~ | 8 | ~~Le Worker n'avait jamais écrit sur GitHub, et il ne le pouvait pas.~~ **Levée le 2026-08-09** : `cache: 'no-store'`, refusé par le runtime Cloudflare, faisait échouer toute publication depuis le lot 8. Corrigé, puis éprouvé — une correction publiée depuis `/traductions` a bien atteint le dépôt. |
| R4 | 8 | **La limitation de débit n'est pas stricte.** Elle repose sur la cohérence différée de KV : des requêtes concurrentes laisseront passer quelques tentatives de plus que les cinq annoncées. Sans commune mesure avec une force brute, mais à savoir. | Rien à faire tant que l'ordre de grandeur suffit. Un Durable Object le rendrait strict, au prix d'une brique de plus. |
| ~~R5~~ | 9 | ~~Aucun aller-retour réel avec le Worker.~~ **Levée le 2026-08-09** : connexion par code, session, publication et écriture GitHub exercées de bout en bout depuis un téléphone. |
| R7 | 10 | **Aucun rappel réel n'a été envoyé un vrai matin d'école.** Le cron Cloudflare qui ne pouvait pas aboutir a été remplacé par le planificateur en processus (lot 21), et le lot 26 a ajouté un **journal de livraison** — chaque rappel envoyé laisse une trace lisible à l'onglet « Journal » de `/edition`. La chaîne est testée de bout en bout (envoi simulé), mais elle n'a toujours pas tourné contre de vrais téléphones à 06:45. | Publier une alerte de test la veille d'un jour d'école, puis vérifier le lendemain matin dans le journal de `/edition` que le rappel est parti au bon créneau (et, si un téléphone est abonné, qu'il a sonné). Retirer l'alerte ensuite. |
| ~~R8~~ | 10 | ~~Le sélecteur de préférence n'a pas été vu à l'écran.~~ **Levée le 2026-08-09** sur iPhone, notifications actives. |
| ~~R9~~ | 11 | ~~La CSP avait été déclarée vérifiée à tort.~~ **Levée le 2026-08-09**, pour de bon cette fois : `connect-src` omettait `https://api.github.com`, ce qui rendait tout `/admin` muet en production depuis le lot 11. Corrigé, puis éprouvé par deux publications réelles de l'auteur — `Crédits : mise à jour` et `Urgence : annulation`, toutes deux passées par l'API GitHub depuis le navigateur. Leçon inscrite : une CSP n'est pas vérifiée tant que chaque origine qu'elle autorise n'a pas été exercée. |
| ~~R10~~ | 12 | ~~Aucun `.ics` de la nouvelle chaîne n'a été importé dans un vrai agenda.~~ **Levée le 2026-08-09** : importé dans Apple Calendrier depuis l'iPhone. |
| ~~R11~~ | 13 | ~~L'intégration Google fonctionne jusqu'à l'écriture.~~ **Levée le 2026-08-10** par l'auteur : portée déclarée, connexion établie, rendez-vous écrits dans Google Agenda. Deux jours d'accusations portées contre la configuration Google alors que la cause était dans le dépôt (voir R23) — leçon inscrite : une portée s'accorde par méthode, pas par API. |
| ~~R21~~ | 13 | ~~Le `401` de Google n'a jamais été vu levé.~~ **Levée le 2026-08-10** : accès retiré depuis le compte Google, puis retour sur l'onglet resté ouvert — l'écran annonce bien que la connexion n'est plus valable. **Nuance constatée** : rien ne se voit au simple retour dans l'onglet, il faut cliquer sur « mettre à jour l'agenda » pour que ce soit dit. C'est inhérent — un jeton mort ne se distingue d'un jeton vivant qu'en s'en servant — et c'est désormais atténué : depuis le correctif de session, la reprise au chargement interroge Google et dit tout de suite que la session est finie. |
| ~~R22~~ | 13 | ~~Les échecs d'écriture non authentifiés restent invisibles.~~ **Levée le 2026-08-10** : `/agenda` lit désormais `echecs` et le dit à part, sur le ton de l'avertissement — une synchronisation à moitié passée n'est pas une réussite. Deux tests de page, dont un vérifié par mutation : retirer la ligne d'affichage fait bien tomber le test.
| ~~R23~~ | 13 | ~~Deux appels sur trois étaient interdits ou inopérants avec la portée demandée.~~ **Levée le 2026-08-10** par l'auteur, contre le vrai Google : première synchronisation avec agenda créé de zéro (le cas où le `PUT` répondait 404 et où rien n'était écrit), puis seconde synchronisation sans doublon d'événements. `calendars.get` et le repli `POST` sur 404 tiennent. |
| R24 | 13 | **Un agenda peut se dupliquer.** Faute de pouvoir lister, l'application ne reconnaît ses agendas que par la mémoire locale du navigateur : effacée, ou vue depuis un autre navigateur ou un autre appareil, la synchronisation crée un second « Bus scolaire — Léa » au lieu de retrouver le premier. Les événements ayant des identifiants stables, rien n'est perdu ni dupliqué **dans** l'agenda — c'est l'agenda lui-même qui fait doublon. | Le parent supprime l'agenda en trop d'un geste. Sans une portée plus large (`calendar.calendarlist.readonly`), qui donnerait vue sur son agenda personnel, il n'y a pas de moyen propre de faire mieux : le doublon est le prix de la garantie de confidentialité. |
| R12 | 11 | **La CSP avait cassé `npm run dev`** en bloquant le préambule inline de React Refresh — page blanche, découvert seulement au lot 13. Corrigé : la politique ne s'applique qu'au build. Rappel de méthode : vérifier le build **et** le serveur de développement après toute modification de `vite.config.ts`. | Corrigé. Ligne gardée comme trace. |
| R13 | 6 | **Trois vérifications successives n'avaient pas montré que la boîte d'installation ne s'ouvrait jamais**, parce qu'elles simulaient `beforeinstallprompt` APRÈS le montage de React — exactement le cas qui fonctionnait. Rappel de méthode : un événement simulé ne prouve rien sur le moment où le vrai arrive. | Corrigé. Ligne gardée comme trace. |
| ~~R14~~ | — | ~~Les champs d'heure débordaient sur iPhone.~~ **Levée le 2026-08-09** : la refonte du lot 14 — une case et un champ par ligne, deux blocs séparés — vérifiée sur l'iPhone de l'auteur. |
| ~~R15~~ | — | ~~La vignette de partage n'a pas été soumise aux validateurs.~~ **Levée le 2026-08-10** par l'auteur : les métadonnées de partage rendent bien à l'usage. |
| ~~R16~~ | 14 | ~~Les bornes `min`/`max` n'ont pas été vues sur Safari iOS.~~ **Levée le 2026-08-09** : la roue de sélection les respecte. |
| ~~R17~~ | 15 | ~~L'espace `/traductions` n'a jamais parlé à un vrai Worker.~~ **Levée le 2026-08-09** : code de traducteur créé, connexion établie, correction publiée et arrivée dans `public/traductions.json`. |
| ~~R18~~ | 15 | ~~Les onglets d'`/admin` n'ont pas été vus connecté.~~ **Levée le 2026-08-09** : les cinq onglets vus connectés, et deux publications réelles abouties par l'auteur (crédits, perturbation). L'éditeur de crédits lit bien le dépôt et non le bundle ; l'éditeur de textes ne monte aucun champ tant qu'une section n'est pas dépliée. |
| ~~R19~~ | 17 | ~~L'effet de l'en-tête `Urgency` n'est pas constatable ici.~~ **Levée le 2026-08-09** : marche à suivre iOS affichée, notification d'essai reçue en quelques secondes sur l'iPhone de l'auteur. |
| ~~R20~~ | 17 | ~~Aucune notification d'essai.~~ **Levée le 2026-08-09** : route `POST /essai`, authentifiée par le endpoint lui-même — le connaître ne permet que de se faire vibrer soi-même, une fois par minute au plus. 7 tests, dont le refus d'un endpoint non abonné et la limite par abonnement. Reste à essayer sur un vrai téléphone (R19). |
| ~~R25~~ | 18 | ~~La couche `impression` n'a toujours pas été vue sur papier.~~ **Levée le 2026-08-10** : la feuille d'un foyer de trois enfants est sortie d'iOS Safari en noir sur blanc franc — aucun voile translucide n'a survécu, aucune ombre, aucun gris moucheté. C'était la crainte de la refonte « verre » ; elle est levée. |
| R26 | 18 | **Les nouvelles polices n'ont pas été vues sur iPhone.** IBM Plex Sans est chargée en fabrique VARIABLE (`woff2-variations`). Safari la gère depuis longtemps, mais si le format échouait, le repli `system-ui` s'appliquerait sans prévenir — et l'échelle typographique a été réglée sur les métriques de Plex. Les chiffres, eux, sont en graisses fixes et ne courent pas ce risque. | Ouvrir le site sur l'iPhone et vérifier que le texte est bien en Plex (le `l` sans empattement et le `a` à double étage se reconnaissent d'un coup d'œil). |
| R27 | 18 | **Le contraste est calculé, pas mesuré à l'écran.** Les 4,58:1 du pire cas viennent d'un calcul sur les compositions alpha, pas d'une pipette sur un rendu réel. Le calcul suppose que le navigateur compose en sRGB ; un moteur travaillant dans un autre espace, ou un `backdrop-filter` avec `saturate(140%)` sur l'en-tête, peut décaler la couleur effective de quelques points. | Pipette sur un rendu réel, sur les deux thèmes, pour l'encre douce sur une carte posée dans l'angle clair du dégradé — le pire cas identifié. |
| ~~R28~~ | 19 | ~~Le pied de page collé en bas n'a pas été vu sur iPhone.~~ **Levée le 2026-08-10** : vérifié sous Safari iOS par l'auteur, avec le reste des écrans du lot. |
| ~~R29~~ | 19 | ~~La feuille imprimée n'a pas été refaite depuis que `.page` est un conteneur flex.~~ **Levée le 2026-08-10** : la feuille est sortie sur une seule page — le conteneur souple et la hauteur minimale en hauteur de fenêtre n'ont ajouté aucune feuille. Le débordement constaté le même jour avait une tout autre cause, voir R1. |
| ~~R30~~ | 19 | ~~Le bandeau « mise à jour… » n'a pas été vu à l'œuvre.~~ **Levée le 2026-08-10** : la mise à jour automatique s'est faite seule sous Safari iOS, sans qu'aucun bouton n'apparaisse. |
| ~~R33~~ | 20 | ~~Aucun parent n'a parcouru le nouvel assistant.~~ **Levée le 2026-09-07** par l'auteur : un parent a configuré un enfant de bout en bout. Le pari du lot 20 — qu'une question par moment de la journée se comprenne mieux que cinq grilles par champ — a été éprouvé par quelqu'un qui s'en sert, et plus seulement par les tests et la mesure DOM. |
| ~~R34~~ | 20 | ~~Les réponses en cartes reposent sur `:has()`.~~ **Levée le 2026-08-21**, mais pas par le moyen qu'elle proposait : le repli `input:checked + .choix__texte` était impossible, la teinte portant sur le `<label>`, PARENT de l'input, hors de portée de tout sélecteur frère. La classe est désormais posée par le composant, comme le fait déjà `.choix--retenu` — `:has()` a disparu de la feuille au lieu d'être replié (zéro occurrence dans le CSS construit), et l'état coché est enfin assertable : il ne l'était nulle part. **Leçon inscrite** : une réserve peut se tromper sur son propre remède ; relire ce qu'elle prescrit avant de l'appliquer. |
| ~~R35~~ | 11 | ~~Le compteur de visites GoatCounter n'a rien enregistré et aucun relevé n'a été vu dans son tableau de bord.~~ **Sans objet depuis les lots 27-28** : GoatCounter est retiré. La mesure est auto-hébergée (`POST /mesure`, agrégée en base), et se vérifie désormais dans l'onglet « Fréquentation » de `/edition`, sans service tiers. |
| ~~R36~~ | 11 | ~~Seule la page d'arrivée est comptée ; le comptage par écran serait à peser contre le premier principe.~~ **Décidée aux lots 27-28** : la mesure reste à la page d'ARRIVÉE (un relevé au démarrage), désormais auto-hébergée. Le comptage écran par écran est écarté au nom du premier principe — un relevé par navigation en dirait trop sur l'usage réel d'un foyer. Sur la PWA installée, l'arrivée reste `start_url` (`/`). |
| R47 | 27-28 | **Le compteur auto-hébergé est approximatif.** `POST /mesure` est public et sans jeton — c'était déjà le cas de GoatCounter : rien n'empêche d'appeler l'endpoint à la main pour gonfler un compteur. Le chemin est normalisé côté serveur (liste blanche d'écrans, jamais un identifiant ni un fragment), donc rien de personnel ne peut s'y inscrire ; mais le NOMBRE, lui, reste un ordre de grandeur d'usage, pas une métrique de confiance. | Rien à faire tant qu'on lit ces chiffres comme une tendance. Si un jour l'exactitude comptait, il faudrait un jeton éphémère par page ou une limitation par IP — au prix d'un peu de la confidentialité que l'absence d'IP garantit aujourd'hui. |
| R32 | 19 | **Un débordement de la feuille du foyer ne se voit pas.** WebKit a coupé le vendredi au bas de la page en annonçant « Page 1 sur 1 » : un contenu trop haut n'y produit pas une seconde feuille mais une troncature silencieuse. Le banc mesure désormais 222 mm pour un foyer réel et 236 mm pour le pire cas, sur 273 — la marge est confortable, mais rien dans l'application ne préviendra si elle est un jour reprise. | Rien à faire tant que la marge tient. Si la feuille se charge encore (une sixième langue, un plan plus dense), remesurer au banc **avant** d'imprimer : la feuille, elle, ne se plaindra pas. |
| R37 | — | **L'écran de choix de la langue n'a pas été vu sur un vrai téléphone.** Le navigateur de mesure a refusé de réduire son viewport — il annonçait 2056 px quelle que soit la taille demandée. Le comportement étroit a donc été mesuré en contraignant le conteneur des bandeaux à 280, 320 et 360 px : bascule en une colonne sous 340 px, aucun retour à la ligne, cibles à 51 px. C'est la grille qui est éprouvée, pas l'écran. Restent invérifiés le rendu réel sur iPhone et, surtout, le fait que les cinq langues tiennent au-dessus de la ligne de flottaison — le point même que la grille en deux colonnes vise à régler. | Ouvrir le site avec un stockage vide sur l'iPhone de l'auteur. Les cinq langues doivent être visibles sans faire défiler. |
| R31 | 13 | **Le rafraîchissement de session n'a pas été exercé contre le vrai Google.** La session survit désormais à la fermeture grâce à un jeton de rafraîchissement (`access_type=offline`), relayé par le Worker. 6 tests à `fetch` simulé côté navigateur, 6 côté Worker, mais **le premier vrai rafraîchissement n'a jamais eu lieu** : il faut un jeton d'accès réellement périmé, donc une heure d'attente ou une réouverture le lendemain. Le cas qui inquiète est celui où Google n'accorderait pas de `refresh_token` — il ne le donne qu'à un consentement redemandé, ce que `prompt=consent` impose déjà. | Se connecter, fermer l'application, la rouvrir plus d'une heure après : on doit rester connecté sans rien redemander. Si le bouton « Connecter mon compte Google » revient, c'est que le `refresh_token` n'a pas été accordé. |
| ~~R6~~ | 3 | ~~Une arrivée après la sonnerie est affichée sans être signalée.~~ **Levée le 2026-08-08** : le signal a été écrit puis retiré. Mesure faite au lot 14 : il se déclenchait sur 14 arrêts sur 16 en c1 et 15 sur 16 en c2 — le plan fait arriver les bus à Oberpallen à 07:58 et à Noerdange à 08:00 pour une sonnerie annoncée à 07:55. Décision de l'auteur : c'est un transport scolaire, l'école intègre ces quelques minutes ; le signaler chaque jour à deux cycles entiers serait du bruit. |
| R38 | — | **Le dossier de commercialisation est un instantané, et ses chiffres ne se vérifient pas tout seuls.** `docs/dossier-commercialisation.md` (2026-08-19) décrit le dépôt au commit `578a1db` : il ignore donc l'évolution « la langue avant tout le reste », encore non commitée au moment de sa rédaction. Ses chiffres (17 341 lignes, 751 clés par langue, ~365 cas de test, 188 occurrences de `dillendapp` dans le moteur, 1 162 adresses) ont été recomptés à la main ce jour-là ; rien ne les recomptera ensuite. Il ne contient **aucune donnée de marché** — 26 questions y sont marquées `[À VÉRIFIER]` au lieu d'être estimées, notamment le nombre de communes concernées, les seuils de marchés publics, le cadre CNPD et l'assurance responsabilité. | Recompter les chiffres avant tout usage externe du dossier (`wc -l`, taille des JSON, `git log`). Répondre aux `[À VÉRIFIER]` par recherche, jamais par estimation. |
| R39 | 21 | **La reprise de l'état clé-valeur vers PostgreSQL n'a jamais été exécutée sur les vraies données.** `serveur/exporter-kv.mjs` et `serveur/importer-kv.mjs` sont écrits et l'import est idempotent, mais il n'a tourné que contre une base vide. Un import raté désabonne **tous** les parents, sans que rien ne le signale : les notifications ne partiraient plus. (Les codes d'agents, eux, ne sont plus repris depuis la consolidation — ils sont à recréer en comptes ; voir R45.) | Exporter le KV réel, importer dans la base de préproduction, puis vérifier qu'un **envoi d'essai atteint un abonné repris**. Compter les lignes ne prouve rien. |
| R40 | 21 | **L'extraction de l'adresse cliente derrière Traefik n'a pas été vue à l'œuvre.** Le Worker lisait `CF-Connecting-IP` ; le serveur lit `X-Forwarded-For` en partant de la fin, sur `NB_PROXYS_FIABLES` rangs. 7 tests couvrent la fonction et 3 tests de route la traversent, mais **aucun vrai proxy n'a encore été devant**. Une erreur ici transforme la limitation de débit en un seul seau global : cinq tentatives pour la planète entière, puis plus personne ne se connecte. Aucun signe extérieur. | Deux connexions échouées depuis deux réseaux différents (par exemple domicile et 4G) contre le serveur déployé : la seconde ne doit pas hériter du compteur de la première. Si un second relais s'ajoute un jour devant Traefik, `NB_PROXYS_FIABLES` doit passer à 2. |
| R41 | 21 | **Le paquet a été construit et l'image exercée, mais jamais sous charge.** L'envoi des notifications est passé d'un découpage en lots de 10 à une boucle à 20 envois simultanés. La nouvelle valeur n'est pas plus mesurée que ne l'était `TAILLE_LOT` — elle est seulement libre du plafond qui justifiait l'ancienne. | Regarder le journal du conteneur au premier envoi réel de plus de cinquante abonnés. Ce qui compte n'est pas la durée mais le nombre d'échecs : un service de push qui répond `429` dit que la concurrence est trop haute. |
| ~~R42~~ | 22 | ~~La chaîne de déploiement n'a jamais été montée par le vrai Dokploy.~~ **Levée le 2026-08-24** : déployée sur le vrai Dokploy (`dok.seil.pro`, projet Schoulbus), Traefik a routé `app.schoulbus.lu/api` et émis le certificat, `/api/sante` répond `base: true`, `push: true`, `commune: true`, `comptes: true`, `courriel: true`. Le site rend un 200 à la racine, une route profonde retombe sur `index.html`, les quatre lectures publiques (`/urgences /horaires /credits /traductions`) répondent 200. **Nuance** : les images ont été construites SUR la VPS et non tirées de GHCR — le chemin GHCR (paquet privé, identifiant de registre) reste donc à éprouver le jour où la CI publiera les images. Le reste — Dokploy, Traefik, certificat, chemin `/api` non tronqué — est confirmé. Reste l'ancien texte pour trace : `compose.deploiement.yaml`, la poussée d'image sur GHCR et le routage Traefik (`Host(app.schoulbus.lu) && PathPrefix(/api)`, certificat Let's Encrypt) sont vérifiés en local — `docker build`, la pile montée depuis l'image construite, `/api/sante` au vert avec `base: true`, la sonde de l'image qui passe, `docker compose config` qui résout le fichier — mais **aucun Dokploy, aucun Traefik, aucun certificat réel** n'a été devant. Trois choses ne se voient qu'au premier déploiement : que Dokploy sait tirer l'image (paquet privé → identifiant de registre requis), que Traefik émet bien le certificat (DNS à résoudre d'abord), et que le chemin `/api` arrive non tronqué au serveur. | Pousser sur `main`, créer l'application Compose dans Dokploy sur `compose.deploiement.yaml`, poser les variables, déployer, puis `curl https://app.schoulbus.lu/api/sante`. Voir [docs/deploiement.md](deploiement.md). C'est le même déploiement qui lèvera R39 (reprise clé-valeur) et R40 (adresse client derrière Traefik). |
| ~~R43~~ | 23 | ~~Restaient l'installation de la PWA depuis la nouvelle origine et le sort d'une PWA déjà installée depuis GitHub Pages.~~ **Levée le 2026-09-07** par l'auteur : la PWA s'installe depuis `app.schoulbus.lu` sur un appareil réel. Elle complète la levée partielle du 2026-08-24 — site servi par le vrai Traefik (racine 200, en-têtes `X-Frame-Options: DENY`/`nosniff`, repli SPA, CSP portant `app.schoulbus.lu/api`, partage d'origine site↔API départagé par les routeurs priorité 100/1). **Ce qui reste vrai sans être une réserve** : une installation faite depuis GitHub Pages ne migre pas seule — autre origine, autre service worker. Le mot aux parents déjà installés (réinstaller depuis la nouvelle adresse) tient au courriel d'ouverture, pas à une vérification. |
| ~~R45~~ | Consolidation | ~~Le repli sur les capacités est prouvé par les tests, pas par le serveur déployé.~~ **Levée le 2026-09-07.** Un vrai compte a publié une perturbation depuis `/edition` sur `app.schoulbus.lu`, elle est arrivée dans l'application, et elle a été retirée. Et la table `migration` de la base de PRODUCTION porte bien les cinq lignes, `004-retrait-agents.sql` comprise — le runner inscrivant le nom dans la même transaction que le fichier, `agent_commune` et `agent_traduction` sont donc tombées. Deux enseignements au passage : la publication échouait d'abord sur une **session expirée**, refusée avant même d'être journalisée (d'où un journal vide qui laissait croire à une panne d'écriture), et le jeton mort survivait à son refus — corrigé le même jour. **Leçon inscrite** : la première vérification a été faite dans le mauvais conteneur (`bus-beckerich-bus-postgres-1`, voir R50), qui n'affichait que deux migrations. Un terminal de base de données ne dit pas de quelle pile il est ; vérifier le nom du conteneur avant de conclure. |
| R50 | — | **Une pile orpheline tourne encore sur la VPS.** Le projet Compose `bus-beckerich` (`bus-beckerich-bus-postgres-1`) est resté allumé depuis le déploiement à la main d'il y a deux semaines, en parallèle de la pile Dokploy `bus-app` (`compose-hack-neural-pixel-ai3w3f-*`) qui est la vraie production. Plus rien ne l'alimente — sa base s'est arrêtée aux migrations 001 et 002 —, mais elle consomme mémoire et disque, et son volume PostgreSQL détient l'état d'alors : abonnements et comptes d'avant la reprise par Dokploy. | Regarder ce que ce volume contient (`select count(*) from abonnement`, `select courriel from compte`) AVANT de supprimer quoi que ce soit. S'il porte de vrais abonnés, c'est peut-être là que se joue R39. Ne pas confondre les deux piles en arrêtant l'une pour l'autre : leurs noms se ressemblent, et l'une des deux sert les parents. |
| ~~R48~~ | 2026-09-07 | ~~La reprise automatique d'un abonnement périmé n'a jamais tourné.~~ **Levée le 2026-09-07** par l'auteur, sur un téléphone abonné avant le correctif : le site lit `clePubliqueVapid` sur `/sante` et refait de lui-même l'abonnement lié à une clé morte. C'est ce silence qui avait rendu les notifications muettes pendant des semaines — un abonnement se crée sans la moindre erreur avec une clé morte. **Reste vrai** : aucun test automatisé ne couvre ce chemin, ni jsdom ni le banc n'ayant de Push API. Une régression ici serait de nouveau silencieuse. |
| R51 | 2026-09-08 | **La date d'ouverture du nouveau campus n'est pas connue, et elle changera tout.** La brochure 2026/2027 écrit que « sous réserve de l'ouverture du nouveau campus scolaire, prévue en janvier 2027, les horaires et les itinéraires du transport scolaire seront adaptés », et que les parents seront informés au cours du premier trimestre. Ni la date, ni le futur plan ne sont publiés. `valideAu` a donc été ramené de `2027-07-15` à `2026-12-18`, dernier jour de classe du premier trimestre : à partir du 19 décembre 2026, l'application affiche son bandeau « plan périmé » plutôt que des horaires qui pourraient ne plus exister. Un chantier qui glisse — le cas ordinaire — fera donc crier au périmé un plan encore valable. C'est le sens du compromis : un faux « vérifiez » coûte moins cher qu'un vrai bus raté. | Récupérer la communication de la commune au premier trimestre, puis soit repousser `valideAu` si l'ouverture glisse, soit saisir le nouveau plan. |
| R52 | 2026-09-08 | **Le départ du vendredi depuis le hall sportif n'est ni confirmé ni infirmé.** Le plan 2025/2026 précisait que le bus Dillendapp de midi partait « du hall sportif le vendredi » et non de l'école de Noerdange. La brochure 2026/2027 a supprimé cette mention — sans dire que la pratique a changé. La note affirmative a été retirée et remplacée par une incertitude (`depart-midi-vendredi-hall-sportif`), visible sur la page Plan et dans la journée des enfants concernés (C2 inscrits au Dillendapp, et Huttange). | Une question à la commune ou à la maison relais : le vendredi à 12:10, le bus part-il de l'école ou du hall sportif ? Puis note affirmative ou incertitude levée. |
| ~~R53~~ | 2026-09-08 | ~~Un plan publié en base à l'ancien format sera rejeté, sans que personne l'ait vu se produire.~~ **Levée le 2026-09-08, après déploiement** : `GET /api/horaires` sur `app.schoulbus.lu` répond `version: "embarque"` et `misAJour: 1970-01-01` — **aucun plan n'est publié en base**, le serveur sert sa copie embarquée, qui est désormais celle au format par cycle. Passée à `validerPlan()`, elle ne remonte **aucun problème**. Le cas redouté n'existe donc pas : il n'y a rien à republier, et l'onglet « Horaires » de `/edition` montrera un plan valide. |
| ~~R54~~ | 2026-09-08 (bis) | ~~Rien de ce lot n'a tourné dans un vrai navigateur.~~ **Levée le 2026-09-08** : Playwright était bien là — la première conclusion était fausse, faute d'avoir cherché ailleurs que dans `node_modules`. Chromium ne démarrait pas (neuf bibliothèques système absentes, puis **aucune police** sur la machine, ce qui le faisait mourir en composant le texte de `/reglages` et `/configurer` : un plantage d'environnement, pas de l'application). Paquets téléchargés et dépliés dans un dossier de travail, sans rien installer sur le système. Les trois chemins sont éprouvés : le morceau allemand retardé d'une seconde à dessein laisse `#root` **vide**, jamais du français, puis la page s'affiche en allemand — le premier rendu attend bien son dictionnaire ; hors ligne, l'application se recharge, le passage au portugais trouve son dictionnaire, et `/edition` arrive. **Reste vrai** : c'est Chromium sous Linux. Safari et iOS, où l'application est installée, n'ont pas été touchés. |
| ~~R55~~ | 2026-09-08 (bis) | ~~Le gain de poids est un gain de chemin critique, pas d'octets, et personne ne l'a mesuré.~~ **Mesurée le 2026-09-08**, navigateur contre navigateur, l'avant reconstruit depuis `fc8d5b5` : un parent francophone télécharge **227 → 152 Kio** compressés avant le premier affichage (−33 %), un parent germanophone **227 → 170 Kio** (−25 %, son dictionnaire coûtant 18 Kio). **Reste vrai, et assumé** : le service worker précharge ensuite tout le reste — 31 entrées et 1123 Kio contre 22 et 1116 Kio. Le total téléchargé ne baisse pas ; c'est le temps avant premier affichage qui gagne. Mesure faite en local, pas sur le réseau du village. |
| ~~R56~~ | 2026-09-08 (bis) | ~~La barrière d'erreur n'a jamais rattrapé une vraie panne.~~ **Levée le 2026-09-08** : un foyer portant un cycle disparu (`c9`) a été posé dans `localStorage` — JSON valide, donc accepté par le stockage, et qui fait tomber le rendu. La barrière prend la main, affiche le message technique, et « Effacer et repartir de zéro » rend une application utilisable. Deux enseignements de méthode, tous deux dans le harnais et non dans le code : un script d'initialisation Playwright rejoue à CHAQUE navigation, donc reposait le foyer corrompu après l'effacement et faisait croire à un échec ; et `innerText` renvoie vide sous `chrome-headless-shell`, ce qui faisait croire à une page blanche alors que le DOM était complet. |
| R57 | 2026-09-08 (bis) | **Les deux raccourcis du manifeste ne sont vérifiés qu'à moitié.** Le manifeste est servi et valide, et les deux adresses visées — `/plan`, `/configurer` — se rendent bien (vérifié au navigateur le 2026-09-08). Ce qui n'est pas vérifié est le geste lui-même : `shortcuts` est lu par Android, iOS l'ignore, et l'application est installée sur iPhone chez l'auteur. Aucune capture d'écran n'a été ajoutée — `screenshots` enrichit l'invite d'installation sur Chrome et demande de vraies images. | Installer depuis Chrome sur Android, appui long sur l'icône. Les captures peuvent maintenant être prises par Playwright. |
| ~~R49~~ | 2026-09-07 | ~~La charte graphique n'est pas déployée, et `dev` ne la porte plus.~~ **Tranchée le 2026-09-07** : la charte est abandonnée. `dev` a été remise sur `main` par avance rapide (`db3173e` → `18549fa`, aucun commit perdu) et les quatre commits de `charte-et-pile-dev-2026-08-25` — refonte de `src/index.css`, `LogoBus`, icônes régénérées, `src/contraste.test.ts`, `src/style.test.ts`, pile dev du compose — ne seront pas repris. La branche reste sur GitHub comme trace. L'agent communal verra donc l'apparence actuelle, et c'est assumé. |

### Mise en service — faite

Tout est en service. **Vérifié le 2026-08-10** sur `/sante` du Worker déployé :

```
{"ok":true,"oauth":true,"push":true,"commune":true,"google":true,
 "depot":{"urgences":"ok","traductions":"ok"},"rappels":true}
```

L'espace commune a été exercé de bout en bout par l'auteur : connexion par code d'agent,
assistant de publication, alerte réellement publiée. `VITE_URL_WORKER` et
`VITE_ID_CLIENT_GOOGLE` sont posés en variables de dépôt et passés à la construction —
la CSP de la page publiée porte bien l'origine du Worker, ce qui le prouve de l'extérieur.

Cette section a annoncé le contraire pendant deux jours après l'activation : **un plan
qui décrit l'état d'un service doit se relire quand cet état change**, sinon il fait
rouvrir un chantier terminé. Ce qui suit ne sert donc qu'à refaire la mise en service,
sur un autre compte ou après une remise à zéro :

```bash
cd worker
npx wrangler secret put SECRET_SESSION   # longue chaîne au hasard, non réutilisée
npx wrangler secret put GITHUB_PAT       # jeton fine-grained, Contents: RW, CE dépôt seul
npx wrangler deploy
./creer-agent.sh "Prénom Nom" "service"
curl https://<worker>/sante              # doit renvoyer "commune": true
```

---

## Ouverture à la commune — faite (2026-09-07)

Le premier agent communal a reçu son accès à `/edition`. Ce n'était pas un lot de
développement : tout le mécanisme existait depuis le lot 25. C'était une mise en service,
et elle avait un ordre — les cinq étapes ci-dessous sont franchies.

**Les identités ne sont pas dans le dépôt.** Le compte à créer — adresse, nom, capacités
retenues — et le courriel prêt à envoyer vivent dans `~/schoulbus-acces-commune.md`, sur
la machine de l'auteur. Ce dépôt est public : l'adresse professionnelle d'un agent
communal et un numéro de téléphone personnel n'ont rien à y faire. On ne garde ici que la
démarche.

1. ~~**Éprouver le chemin avant de l'ouvrir.**~~ **Fait le 2026-09-07** : une
   perturbation d'essai a été publiée depuis `/edition` par un vrai compte, vue dans
   l'application, puis retirée. L'agent ne sera pas celui qui essuie les plâtres. Voir
   R45, désormais entièrement levée.
2. ~~**Créer le compte**~~ **Fait le 2026-09-07** depuis l'onglet Comptes de `/edition`,
   avec les seules capacités utiles : perturbations, horaires, arrêts, traductions,
   crédits. `comptes` — créer et désactiver d'autres comptes — est une administration des
   accès, pas des données : elle n'a pas été accordée, et ne le sera que sur demande.
3. ~~**Vérifier que le courriel d'activation arrive.**~~ **Fait le 2026-09-07** : un
   compte d'essai créé depuis l'onglet Comptes sur une adresse personnelle — le courriel
   est arrivé, le lien d'activation a posé le mot de passe, la connexion a suivi. Le relai
   SMTP (`admin@schoulbus.lu` chez OVH, SPF + DKIM + DMARC) est donc éprouvé de bout en
   bout, et non plus seulement en envoi. L'agent choisit lui-même son mot de passe, que
   personne d'autre ne connaît jamais. Le compte d'essai reste à désactiver.
4. ~~**Trancher la charte graphique** (R49).~~ **Fait le 2026-09-07** : la charte est
   abandonnée, `dev` remise sur `main`. L'agent verra l'apparence actuelle, celle qui est
   en ligne — plus rien n'attend d'être déployé avant de lui ouvrir l'accès.
5. ~~**Écrire**, en dernier, une fois l'accès en place.~~ **Fait le 2026-09-07** : le
   courriel est parti, une fois le compte créé. Il renvoie aux deux adresses — la vitrine
   `www.schoulbus.lu` et l'application `app.schoulbus.lu` —, énumère les cinq capacités
   accordées, et dit sans détour que les traductions non françaises n'ont eu aucune
   vérification humaine. **Ce qui reste ouvert n'est plus technique : c'est sa réponse.**

**Ce que le courriel doit dire, et qui n'est pas confortable :** les traductions
allemande, luxembourgeoise, portugaise et anglaise n'ont eu **aucune vérification
humaine**. Seul le français a été écrit et relu par une personne. Le taire ferait
découvrir le défaut à la commune par un parent mécontent ; le dire en ouvrant l'accès aux
textes en fait une invitation à corriger. C'est le sens de la capacité `traductions`
accordée dès le premier compte.

### Ce qui a changé le 2026-09-07

Trois corrections de production, hors lots :

- **La clé VAPID ne vit plus qu'à un seul endroit.** Le site la lisait dans une variable
  de dépôt figée à la construction ; elle avait divergé de celle avec laquelle le serveur
  signe, et les notifications étaient muettes depuis. Le site la demande désormais à
  `/sante` et refait de lui-même les abonnements liés à une clé morte (R48). La variable
  de dépôt `CLE_VAPID` et l'argument de construction `VITE_CLE_VAPID` ont disparu.
- **Un jeton de session refusé s'efface** au lieu de survivre à son refus, et l'écran
  d'édition mène à la connexion. C'est ce qui avait fait croire à une publication perdue :
  le serveur refusait avant même de journaliser.
- **Le précoce n'est plus proposé à la saisie.** Ces enfants ne prennent pas le bus
  scolaire ; le cycle reste dans `ecoles.json` et dans le format des liens de partage —
  un lien ancien peut en porter un, et l'enfant garde alors son cycle affiché — mais
  `cyclesProposes()` ne l'offre plus au choix d'un parent. L'ordre de la liste `CYCLES`
  de `partage.ts` est un format de fil : y retirer le précoce décalerait tous les indices
  et ferait relire chaque lien déjà partagé avec un cycle de trop.
- **`pull_policy: always`** sur `bus-api` et `bus-site` : un redéploiement rejouait
  l'image déjà en cache sans rien dire, et l'on cherchait la panne dans le code qu'on
  venait de pousser.

---

## Lot 0 — Amorçage : `CLAUDE.md` et `docs/plan.md`

Aucun `CLAUDE.md` n'existe à la racine aujourd'hui.

1. Créer `docs/plan.md` : copie intégrale de ce plan (contexte, décisions, les 13 lots).
2. Créer `CLAUDE.md` à la racine, court, décrivant :
   - la nature du projet et ses deux principes non négociables (aucun serveur pour les
     données des familles ; honnêteté sur les limites) ;
   - la convention de nommage **en français** du code (`Trajet`, `contexteEnfant`,
     `definirRepas`…) — toute contribution doit s'y tenir ;
   - la carte des fichiers : `src/lib/` = moteur pur et testé, `src/composants/` +
     `src/pages/` = affichage, `src/data/` = toutes les données, `worker/` = Cloudflare ;
   - les commandes (`npm run dev`, `test`, `typecheck`, `build`) ;
   - un renvoi explicite : **« Feuille de route détaillée : [docs/plan.md](docs/plan.md) »** ;
   - les renvois existants vers `DONNEES.md` et `ADMIN.md`.

---

## Lot 1 — Corrections visibles immédiates

> **Fait le 2026-08-08.** Les quatre points sont livrés. Deux ajouts par rapport au texte
> ci-dessous : un utilitaire `destinationTrajet()` en plus de `sensTrajet()` (la fiche
> imprimable distingue trois destinations, pas deux sens), et un garde-fou anti-boucle
> sur le rechargement automatique (`sessionStorage`), pour qu'un déploiement incohérent
> ne rende pas l'application inutilisable.

Les quatre irritants signalés qui ne demandent aucun changement de modèle. Volontairement
groupés : ce sont ceux qui se voient dès l'ouverture de l'application.

### 1.1 Heures de retour lisibles — `src/composants/Trajets.tsx`, `src/index.css`

`LigneTrajet` affiche aujourd'hui l'heure de départ en grand à gauche et noie l'heure
d'arrivée dans la ligne de détail (`trajet.arrivee.heure` après un `·`). Pour un retour,
c'est l'inverse de ce qui intéresse le parent.

Nouvelle disposition, pilotée par le sens du trajet :

- **Trajet vers l'école** (`aller-matin`, `aller-apres-midi`, `navette-dillendapp-retour`) :
  heure de **départ en grand à gauche** (comportement actuel, correct), heure d'arrivée en
  petit.
- **Trajet de retour** (`retour-midi`, `retour-soir`, `retour-soir-dillendapp`,
  `navette-dillendapp-midi`) : heure de départ de l'école **en petit à gauche**, heure
  d'arrivée **en grand à droite**, dans la même couleur d'accent que l'heure de départ des
  allers.

Introduire un utilitaire `sensTrajet(type): 'aller' | 'retour'` dans `src/lib/affichage.ts`
et le réutiliser dans `FicheImprimable.tsx`, qui a déjà une fonction `sens()` locale
faisant le même travail — la remplacer par l'utilitaire partagé.

Les états `annule` / `decale` (barré, heure recalculée) doivent s'appliquer à l'heure
**mise en avant**, pas seulement au départ : `heureEffective()` dans `src/lib/urgences.ts`
ne décale aujourd'hui que `depart.heure`. Ajouter `heureArriveeEffective()` sur le même
modèle (même retard appliqué aux deux bouts) et le couvrir dans `src/lib/urgences.test.ts`.

### 1.2 Prénoms des enfants sur la page Réglages — `src/pages/Reglages.tsx`

La section renvoyant vers `/configurer` n'affiche que `foyer.adresse?.libelle` et un
compte. Remplacer par la liste des enfants : prénom, cycle, site scolaire
(`siteDuCycle(enfant.cycle).nom`, déjà utilisé dans `Semaine.tsx`), et un lien direct vers
la configuration de cet enfant. L'adresse du foyer reste affichée au-dessus.

### 1.3 Boutons « toute la semaine » — `src/composants/GrilleSemaine.tsx`, `src/index.css`

Aujourd'hui : un `<span class="champ__aide">` suivi de deux `<button class="bouton
bouton--discret">` dans un `.rangee`. Sur iPhone 15 Pro Max, le libellé pousse les deux
boutons sur deux lignes, et le style `--discret` les rend illisibles.

Refaire les deux raccourcis (repas et bus) sur le même modèle que la bascule `.bascule`
déjà utilisée dans la grille : **libellé sur sa propre ligne au-dessus**, puis un groupe de
boutons segmenté en pleine largeur, cible tactile ≥ 44 px, contraste identique aux boutons
normaux. Remplacer aussi le `<select>` « bus toute la semaine » (qui se réinitialise
bizarrement via `e.target.value = ''`) par le même groupe segmenté à quatre options.

### 1.4 Rechargement automatique à chaque déploiement — `src/composants/BandeauVersion.tsx`

`BandeauVersion` interroge `version.json` toutes les 30 min et affiche un bouton
« Recharger ». Passer en rechargement automatique :

- intervalle ramené à **5 min**, plus une vérification à chaque `visibilitychange` et à
  chaque `focus` (déjà partiellement en place) ;
- quand une nouvelle version est détectée, appeler `window.location.reload()`
  **automatiquement** après un court délai (2 s) avec un bandeau « nouvelle version, mise à
  jour… », sans bouton à cliquer ;
- **exception** : ne jamais recharger automatiquement si l'utilisateur est sur `/admin` ou
  `/commune/*` avec un brouillon non publié, ni si un `<dialog>` est ouvert. Dans ces cas,
  garder le bandeau avec bouton. Exposer cette garde via un petit contexte
  `src/rechargement-contexte.tsx` (`bloquerRechargement(raison)`) que les pages
  d'administration consomment.

Le service worker est déjà en `registerType: 'autoUpdate'` avec `skipWaiting` +
`clientsClaim` (`vite.config.ts`) : le rechargement récupère bien les nouveaux assets.

**Vérification du lot 1** : `npm test`, `npm run typecheck`, puis `npm run dev` — ouvrir la
fiche d'un enfant sur un viewport 430 × 932 (iPhone 15 Pro Max) dans les outils
développeur, vérifier que les deux boutons « toute la semaine » tiennent sur une ligne et
que les heures d'arrivée des retours sont l'élément le plus gros de la carte.

---

## Lot 2 — Refonte visuelle : le système de design

> **Fait le 2026-08-08.** Les quatre points sont livrés. Écarts et ajouts par rapport au
> texte ci-dessous :
>
> - Les jetons de couleur passent de l'anglais au français (`--bg` → `--fond`,
>   `--text` → `--encre`, `--line` → `--bord`…), ce qui aligne la feuille de style sur la
>   convention du dépôt et libère le préfixe `--texte-*` pour l'échelle typographique.
> - Les couleurs décoratives `--cyan` et `--violet` disparaissent au profit de l'accent
>   unique ; il ne reste qu'un `--accent-2`, dont le seul usage est de distinguer une
>   ligne de bus.
> - Deux défauts trouvés à la vérification et corrigés : l'URL de la source citée en
>   toutes lettres élargissait la page « Limites » au-delà d'un écran de 320 px
>   (`overflow-wrap: anywhere` sur les liens — `break-word` ne suffit pas, il ne réduit
>   pas la largeur minimale intrinsèque), et le champ « jeton » de `/admin` restait à
>   31 px de haut parce que `input[type='password']` n'était pas dans la liste des types
>   énumérés (remplacée par une exclusion).
> - `.bouton--discret` n'est plus gris sur fond transparent mais dans la couleur d'accent :
>   l'ancienne variante tombait sous le seuil de contraste.
> - Nouveaux fichiers : `src/composants/Navigation.tsx` (les deux variantes lisent la même
>   liste d'entrées) et `src/composants/Bandeaux.tsx` (la pile priorisée).
> - Vérification automatisée plutôt qu'à l'œil : 9 routes × 3 largeurs × 2 thèmes = 54
>   combinaisons, mesurées dans des iframes de largeur fixe. Aucun débordement
>   horizontal, aucune cible interactive sous 44 px.
>
> **Réserve** : la couche `impression` n'a pas été contrôlée visuellement. Le navigateur
> employé n'expose pas l'émulation du média `print`, et ouvrir la boîte d'impression
> bloquerait la session. `FicheImprimable.tsx` n'est pas touché et les variables de la
> couche ont été recroisées une à une (aucune utilisée sans être définie), mais
> l'aperçu papier reste à confirmer d'un `Cmd+P`.

**Fondation de toute la refonte. À faire avant les lots 3 à 8**, qui construisent des
écrans avec les nouvelles primitives.

`src/index.css` (767 lignes) est déjà organisé en `@layer reset, tokens, base, layout,
composants, impression` — la structure est bonne, c'est le contenu qui est repris.

### 2.1 Jetons — couche `tokens`

- **Typographie** : échelle modulaire explicite (`--texte-xs` … `--texte-3xl`) au lieu des
  `fontSize: '1rem'` en style inline dispersés dans une douzaine de composants. Chiffres en
  `font-variant-numeric: tabular-nums` partout où une heure s'affiche.
- **Palette** : conserver le principe clair/sombre piloté par `data-theme` (posé par
  `etat.tsx`), mais redéfinir les couleurs autour d'un accent unique plus lisible, et
  vérifier chaque couple texte/fond à un contraste ≥ 4.5:1 (≥ 3:1 pour les gros textes).
  Les couleurs sémantiques (`--rouge`, `--orange`) deviennent une famille complète
  (`--danger`, `--danger-fond`, `--danger-bord`…) pour que les encarts ne soient plus
  bricolés en style inline (`color: 'var(--rouge)'` dans `Trajets.tsx`).
- **Espacement** : échelle unique de 4 px, remplaçant les `marginInlineStart: '0.5rem'`
  ponctuels.
- **Rayons, ombres, épaisseurs de trait** : trois valeurs chacun, pas plus.

### 2.2 Primitives — couche `composants`

Redessiner et documenter : `.carte`, `.bouton` (+ variantes), `.champ`, `.encart`,
`.etiquette`, `.bascule`, `.pile`, `.rangee`, `.grille-semaine`, `.suggestions`, `.trajet`.

Règles imposées :
- toute cible tactile fait **≥ 44 × 44 px** ;
- aucun `.rangee` ne déborde : `flex-wrap` par défaut et `min-inline-size: 0` sur les
  enfants ;
- focus visible sur tout élément interactif ;
- `@media (prefers-reduced-motion: reduce)` neutralise les transitions.

### 2.3 Coquille de l'application — `src/App.tsx`

- **Navigation basse sur mobile** (barre fixe : Aujourd'hui · Enfants · Plan · Réglages),
  navigation haute conservée à partir de `min-width: 48rem`.
- En-tête allégé, `env(safe-area-inset-*)` respecté (le `viewport-fit=cover` est déjà posé
  dans `index.html`).
- Les bandeaux empilés en haut (version, plan périmé, urgences, avertissement initial,
  réception d'un partage) deviennent une **pile de bandeaux unique et priorisée** : au plus
  un bandeau bloquant à la fois, les autres accessibles derrière.

### 2.4 Nettoyage

Supprimer tous les `style={{ … }}` inline des composants au profit de classes. Ils sont
aujourd'hui présents dans `App.tsx`, `Accueil.tsx`, `Semaine.tsx`, `Reglages.tsx`,
`Configurer.tsx`, `Admin.tsx`, `Trajets.tsx`, `Notifications.tsx`, `Installer.tsx`,
`ChampAdresse.tsx`.

**Vérification** : parcourir chaque route (`/`, `/configurer`, `/enfant/:id`, `/plan`,
`/limites`, `/independance`, `/installer`, `/reglages`, `/admin`) en 320 px, 430 px et
1280 px de large, en thème clair et sombre. Aucun débordement horizontal.

---

## Lot 3 — Modèle de données : adresses par jour et inscription périscolaire

> **Fait le 2026-08-08.** Livré, avec une **correction de fond sur le §3.3**.
>
> **Le §3.3 partait d'un fait faux.** Il affirmait, « vérifié dans
> `src/data/plan-2025-2026.json` », qu'aucune course du plan ne dessert le Dillendapp le
> matin. C'est inexact : le service `aller-3-matin` s'y arrête à **07:38 puis à 07:52**,
> cinq jours sur cinq, en direction `vers-ecole`. Écrire sur la page « Limites » que la
> commune ne publie aucune desserte aurait été affirmer une contre-vérité aux parents —
> exactement ce que le deuxième principe du projet interdit.
>
> Ce qui a été fait à la place :
> - `dillendappDepuis[jour]` supprime bien l'`aller-matin` depuis le domicile et ne le
>   compte pas dans `manquants` — cette partie du §3.3 était juste.
> - Un nouveau type `navette-dillendapp-matin` calcule le trajet maison relais → école
>   sur le plan réel, au lieu de décréter qu'il n'existe pas. Il est interne à la journée
>   d'école (`concerneParent: false`), comme les deux autres navettes.
> - Cas particulier traité : la maison relais est à 86 m de l'école de Beckerich, donc le
>   **même point d'embarquement**. Pour un précoce ou un C4, aucune navette n'est proposée
>   — il y va à pied. Sans ce garde-fou, le moteur produisait un aller-retour à Oberpallen
>   pour revenir à son point de départ.
> - **Ce que le calcul révèle, et que l'application dit maintenant** : pour un C2, aucune
>   course Dillendapp → Noerdange n'arrive avant la sonnerie de 07:55. La première au
>   départ (Aller 2, 07:34 → 08:00) arrive cinq minutes après ; l'Aller 3 (07:52 → 07:58)
>   reste en alternative. Un C1 arrive à 07:45, à l'heure. L'application affiche les
>   heures publiées sans les corriger, et la page « Limites » énonce le fait.
>
> Autres écarts et ajouts :
> - `arretUtile(coord, enfant, sens)` cherche bien `vers-domicile` en `midi`/`soir` pour
>   une adresse de retour. Appliqué aussi au domicile : les 141 tests existants passent
>   sans modification, donc aucun village de la commune n'est desservi dans un seul sens.
> - `aller-apres-midi` repart de l'adresse du **retour de midi**, et non du domicile :
>   l'enfant reprend le bus là où il a déjeuné.
> - `depose` est affichée (fiche écran et fiche imprimable) et exportée dans l'ICS, comme
>   le prévoyait le §3.3. La boucle ICS des passages à la maison relais est mutualisée
>   entre dépose et récupération.
> - `adresseDerogatoire` est signalée par une étiquette dans `LigneTrajet`, sans quoi un
>   arrêt inhabituel se lit comme une erreur de calcul.
> - Deux sections ajoutées à la page « Limites » (`dillendapp`, `adresses`) dans les cinq
>   langues.
> - `src/lib/partage.test.ts` créé : aller-retour v4, relecture d'un lien v1 et d'un v3,
>   refus d'un lien corrompu. 172 tests au total.
>
> Reste explicitement au lot 4 : les écrans (`definirPeriscolaire`,
> `definirDillendappDepuis`, `definirAdresseJour`, choix d'un arrêt pour une adresse hors
> commune). Le modèle est en place, mais rien ne permet encore de le régler dans l'interface.

*Dépend du lot 2 pour l'habillage, mais peut être développé en parallèle : ce lot porte
d'abord sur `src/lib/`.*

C'est le lot le plus structurant. Il touche le type `Enfant`, la persistance, le partage
par lien et le moteur `plan.ts`.

### 3.1 Types — `src/lib/types.ts`

```ts
/** Une adresse qui remplace le domicile un jour donné, dans un sens donné. */
export interface AdresseJour {
  matin?: Adresse | null   // d'où part l'enfant ce matin-là
  soir?: Adresse | null    // où il est ramené ce soir-là
}

export interface Enfant {
  // … champs existants
  /** Adresses dérogatoires, par jour. Absent = domicile du foyer. */
  adresses?: Partial<Record<Jour, AdresseJour>>
  /** L'enfant est inscrit au périscolaire (Dillendapp / SEA). */
  periscolaire?: boolean
  /** Présence au Dillendapp AVANT la classe, par jour. `null` = pas de présence. */
  dillendappDepuis?: Record<Jour, string | null>
  // `dillendappJusqua` existe déjà : présence APRÈS la classe.
}
```

### 3.2 Moteur — `src/lib/plan.ts`

`contexteEnfant(enfant, adresse)` renvoie aujourd'hui **un** contexte, avec **un**
`arretDomicile`. Il faut désormais un contexte par jour et par sens.

- Extraire `arretUtile(coordDepart, enfant, sens)` de la logique actuelle de
  `contexteEnfant` (la boucle qui cherche le plus proche arrêt réellement desservi **dans
  le bon sens**). Attention : la version actuelle ne teste que le sens `vers-ecole` en
  période `matin` ; pour une adresse de retour différente, il faut tester
  `vers-domicile` en périodes `midi` / `soir`.
- `ContexteEnfant` gagne :
  ```ts
  arretsParJour: Record<Jour, { matin: ArretProche | null; soir: ArretProche | null }>
  ```
  `arretDomicile`, `distance`, `temps` restent comme valeurs par défaut (domicile du
  foyer), pour ne rien casser dans `Accueil.tsx` et `FicheImprimable.tsx`.
- `trajetsDuJour(ctx, jour)` utilise l'arrêt du jour et du sens au lieu de
  `arretDomicile.id` pour construire `domicile` : deux tableaux distincts,
  `departDuJour` et `arriveeDuJour`.
- `Trajet` gagne un champ optionnel `adresseDerogatoire?: 'matin' | 'soir'`, pour que
  l'affichage puisse signaler « départ depuis chez les grands-parents » plutôt que de
  laisser le parent croire à une erreur.

**Limite à assumer** : `chercherAdresses()` (`src/lib/adresses.ts`) ne connaît que les
adresses de la commune de Beckerich (jeu BD-Adresses embarqué, 41 Ko). Une adresse hors
commune est introuvable. Comportement retenu, cohérent avec le principe d'honnêteté :
proposer alors de **choisir directement un arrêt dans la liste** (`arrets` de
`src/lib/donnees.ts`), avec la mention « adresse hors commune : indique l'arrêt utilisé ».

### 3.3 Périscolaire — `src/lib/plan.ts`

Vérifié dans `src/data/plan-2025-2026.json` : **aucune course du plan officiel ne dessert
le Dillendapp le matin.** Les lignes `aller-*` déposent à l'école (arrivée ~07:45 pour un
début de classe à 07:55) et `aller-dillendapp` ne circule qu'à midi.

Conséquence, à traiter explicitement plutôt qu'à deviner :

- Si `dillendappDepuis[jour]` est renseigné, l'enfant **ne prend pas le bus du matin** :
  `trajetsDuJour` n'ajoute pas `aller-matin` et n'inscrit pas ce trajet dans `manquants`
  (ce n'est pas un manque, c'est le parent qui dépose).
- On ajoute à la place une entrée dans `JourneeEnfant` :
  ```ts
  depose?: { lieu: 'dillendapp'; heure: string }
  ```
  symétrique du `recuperation` existant, affichée avec le même encart et exportée dans
  l'ICS comme un rappel du matin.
- La page « Limites » (`src/pages/Infos.tsx`) reçoit un paragraphe : le plan communal ne
  publie aucune desserte Dillendapp → école le matin ; l'application ne l'invente pas.

`periscolaire: false` masque **toute** la mécanique Dillendapp (repas comme présence) :
c'est le cas de la majorité des familles et cela allège d'autant la configuration.

### 3.4 Persistance et partage

- `src/lib/stockage.ts` : `chargerFoyer()` complète déjà les champs ajoutés après coup
  (`repas`, `bus`, `dillendappJusqua`). Ajouter `dillendappDepuis`, `periscolaire`
  (déduit : `true` si un repas `dillendapp` existe déjà, pour ne pas faire disparaître la
  configuration des familles concernées) et `adresses` (défaut : `{}`).
- `src/lib/partage.ts` : passer `VERSION` de 3 à **4**. Le décodeur accepte déjà les
  versions antérieures ; ajouter les deux nouveaux champs en fin de tuple enfant, en
  gardant les adresses dérogatoires sous forme compacte `[libelle, localite, lat, lon]`
  arrondie à 5 décimales comme l'adresse principale. Compléter `src/lib/partage` (aucun
  test dédié aujourd'hui) avec un test aller-retour v4 et un test de lecture d'un lien v1.

**Vérification** : nouveaux tests dans `src/lib/plan.test.ts` — un enfant avec adresse de
retour différente le mardi obtient bien un arrêt de retour différent ce jour-là ; un enfant
avec `dillendappDepuis.lundi` n'a pas de trajet `aller-matin` le lundi et n'a pas
`'aller-matin'` dans `manquants`.

---

## Lot 4 — Écrans de configuration : sections Dillendapp et adresses par jour

> **Fait le 2026-08-08.** Les quatre sections sont livrées, avec les trois actions
> d'état prévues (`definirPeriscolaire`, `definirDillendappDepuis`,
> `definirAdresseJour`). Écarts et ajouts :
>
> - `ChampAdresse` gagne un mode `compact` (pour les dix champs de la grille des
>   adresses) et **la sortie de secours pour les adresses hors commune**, laissée en
>   suspens au lot 3 : quand la recherche ne trouve rien, elle propose de désigner
>   directement l'arrêt utilisé, dans la liste de `src/data/arrets.json`.
> - `definirAdresseJour` retire le jour de la table quand ses deux sens reviennent au
>   domicile, plutôt que d'y laisser un `{ matin: null, soir: null }` qui traînerait
>   ensuite dans le stockage et dans les liens de partage.
> - `ajouterEnfant` renvoie désormais l'identifiant créé, ce dont le lot 5 a besoin
>   pour enchaîner sur l'assistant.
> - Défaut corrigé à la vérification : en mode compact, l'adresse retenue s'affichait
>   **au-dessus** de son propre libellé, donc sous le champ précédent — un retour du
>   soir se lisait comme la réponse à « Part le matin de ».

*Dépend des lots 2 et 3.*

Refonte de `GrilleSemaine.tsx`, qui empile aujourd'hui tout dans une seule grille.

Trois sections distinctes, dans cet ordre :

1. **Repas de midi** — grille jour par jour, bascule maison / Dillendapp, plus les
   raccourcis « toute la semaine » refaits au lot 1. *Affichée seulement si
   `periscolaire`* ; sinon un simple rappel « rentre manger tous les jours ».
2. **Usage du bus** — grille jour par jour (aller-retour / aller / retour / aucun).
3. **Inscription périscolaire (Dillendapp)** — révélée par la case à cocher
   `periscolaire`. Contient, jour par jour, **deux champs horaires** :
   - « présent à partir de » (`dillendappDepuis`) — avant la classe ;
   - « présent jusqu'à » (`dillendappJusqua`) — après la classe (champ existant).
4. **Adresses particulières** — repliée par défaut (`<details>`). Pour chaque jour, deux
   `ChampAdresse` facultatifs (matin, soir) ; vide = domicile du foyer. Un badge « domicile »
   par défaut, remplacé par le libellé quand une dérogation existe.

Nouvelles actions dans `src/etat.tsx`, sur le modèle exact des existantes
(`definirRepas`, `definirDillendappJusqua`) : `definirPeriscolaire`,
`definirDillendappDepuis`, `definirAdresseJour(id, jour, sens, adresse | null)`.

---

## Lot 5 — Assistant de configuration par enfant (wizard)

> **Fait le 2026-08-08.** Route `/enfant/:id/assistant`, six étapes, proposée
> automatiquement à la création d'un enfant et par un bouton sur sa fiche. Écarts :
>
> - Plutôt qu'un dossier `src/composants/assistant/` de six composants qui auraient
>   redit ce que `GrilleSemaine` sait déjà faire, ce dernier **exporte ses sections**
>   (`SectionRepas`, `SectionBus`, `CasePeriscolaire`, `HorairesPeriscolaire`,
>   `SectionAdresses`). `/configurer` les empile, l'assistant les répartit par écran.
>   Une seule définition de chaque grille, donc aucune dérive possible entre les deux.
> - La case `periscolaire` est posée en tête de l'étape « Le midi », qu'elle commande,
>   et non à l'étape suivante : décochée, la question du repas n'a plus d'objet.
>   L'étape des horaires disparaît alors, et l'assistant passe de 6 à 5 étapes.
> - Les actions de fin (imprimer, agenda, partager) sont extraites dans
>   `ActionsEnfant.tsx`, partagé avec la fiche enfant — `Semaine.tsx` ne porte plus sa
>   propre copie de la génération ICS.
> - Défaut corrigé à la vérification : sur l'écran du bus, deux boutons portaient le
>   libellé « Retour » — l'usage du bus et la navigation. Ambigu au clavier comme au
>   lecteur d'écran, en français, en allemand et en luxembourgeois.
>   `onboarding.precedent` devient « Étape précédente ».
> - Les adresses particulières restent sur `/configurer` : la liste des six étapes du
>   plan ne leur donne pas d'écran, et elles ne concernent qu'une minorité de familles.
>
> Vérifié : les six étapes s'enchaînent sans débordement, la progression suit, et
> décocher le périscolaire ramène bien l'assistant à cinq étapes. 10 routes × 3
> largeurs × 2 thèmes = 60 combinaisons, aucun débordement, aucune cible sous 44 px.

*Dépend des lots 2, 3 et 4. Vient **en complément** de `/configurer`, qui reste accessible
pour les réglages fins.*

Nouvelle route `/enfant/:id/assistant`, proposée automatiquement à la création d'un enfant
et par un bouton « Configurer pas à pas » sur la fiche.

Six étapes, une par écran, barre de progression, retour arrière libre, enregistrement à
chaque étape (aucun « annuler » global — l'état est déjà persisté à chaque frappe par
`etat.tsx`) :

1. **L'enfant** — prénom, cycle. Affiche immédiatement le site scolaire déduit.
2. **Où il habite** — adresse du foyer, avec l'arrêt calculé et le temps de marche montrés
   en direct (réutilise `ChampAdresse` et `CarteTrajet`).
3. **Le bus** — une carte par jour : « comment vient-il ? / comment rentre-t-il ? », avec
   un raccourci « pareil tous les jours » en tête d'écran.
4. **Le midi** — rentre manger ou Dillendapp, jour par jour, même raccourci.
5. **Le périscolaire** — la case `periscolaire` puis, si cochée, les heures matin et soir
   par jour. Étape sautée si la case reste décochée.
6. **Récapitulatif** — la semaine calculée, les éventuels trajets manquants, puis les
   actions : imprimer, ajouter à l'agenda, partager.

Un composant `src/composants/Assistant.tsx` porte la coquille (progression, navigation,
gestion clavier) ; chaque étape est un composant dans `src/composants/assistant/`.
Les étapes réutilisent les mêmes actions d'état que `/configurer` — aucune logique
dupliquée, aucun état de brouillon parallèle.

---

## Lot 6 — Installation de l'application (PWA)

> **Fait le 2026-08-08.** Les deux parties sont livrées. Écarts et ajouts :
>
> - `src/installation-contexte.tsx` capte `beforeinstallprompt` au niveau de
>   l'application et expose `invite`, `installee`, `estIOS`, `proposable`,
>   `installer()`, `reporter()` et `noterFicheVue()`.
> - La boîte s'ouvre après **2 visites ou 1 fiche enfant consultée**, jamais avant que
>   le foyer soit configuré, et un refus vaut **30 jours**. Les cinq conditions ont été
>   éprouvées une à une dans le navigateur.
> - Quatre démonstrations SVG écrites à la main dans
>   `src/composants/installation/Demonstrations.tsx`. L'animation est portée par la CSS
>   et non par SMIL : c'est ce qui rend `prefers-reduced-motion` gratuit, la règle
>   globale de la couche `base` ramenant la durée à presque zéro et `forwards` figeant
>   l'image sur la dernière étape — qui est justement l'étape informative.
> - **Défaut trouvé et corrigé** : « Plus tard » fermait la boîte sans mémoriser le
>   refus, qui serait donc revenu à chaque ouverture. Deux causes successives — un
>   `onClose` que React ne relayait pas, puis un effet aux dépendances stables qui ne se
>   rejouait jamais pour trouver la boîte, absente au premier rendu. La boîte est
>   désormais pilotée par l'état, plus par un `close()` impératif.
> - **Défaut trouvé et corrigé** : « Installer l'application » débordait de son panneau
>   dans deux démonstrations. Les quatre démonstrations sont maintenant mesurées dans
>   les cinq langues.
> - L'entrée permanente de la barre basse porte un libellé court : « Installer
>   l'application » ne tient pas dans une case.
>
> **Réserve** : les cinq conditions d'affichage ont été éprouvées avec un
> `beforeinstallprompt` **simulé** — Chrome ne l'émet qu'en production, avec service
> worker. La logique de déclenchement est donc vérifiée, mais ni l'installation réelle,
> ni le comportement de `appinstalled`, ni le geste iOS ne l'ont été. À reprendre sur un
> appareil réel après le prochain déploiement.

*Dépend du lot 2.*

### 6.1 Invitation active

Aujourd'hui, `beforeinstallprompt` n'est capté que si le parent visite `/installer` : la
quasi-totalité ne le fera jamais.

- Capter `beforeinstallprompt` **au niveau de `App.tsx`** et le conserver dans un contexte
  `src/installation-contexte.tsx` (`invite`, `installee`, `installer()`, `reporter()`).
- **Boîte de dialogue** (`<dialog>` natif) proposée automatiquement une fois que le parent
  a réellement commencé à se servir de l'application — condition : foyer configuré **et**
  au moins 2 visites **ou** 1 fiche enfant consultée. Un refus est mémorisé
  (`bus-beckerich.installation-reportee`) et n'est représenté qu'après 30 jours.
- Sur iOS, où `beforeinstallprompt` n'existe pas, la boîte explique le geste
  Partager → « Sur l'écran d'accueil ».
- Entrée permanente et bien visible dans les Réglages et dans la navigation basse tant que
  l'application n'est pas installée.

### 6.2 Documentation illustrée — `src/pages/Installer.tsx`

Remplacer les listes d'étapes textuelles par des **démonstrations animées par plateforme**
(iOS/Safari, Android/Chrome, bureau, Firefox) :

- animations **SVG produites à la main**, pas des captures d'écran — un SVG animé pèse
  quelques kilo-octets, reste net sur tout écran, ne se périme pas à chaque version d'iOS
  et n'oblige pas à embarquer l'interface d'un tiers dans le dépôt ;
- une animation par plateforme, en boucle, dans `src/composants/installation/` ;
- `@media (prefers-reduced-motion: reduce)` fige l'animation sur son état final ;
- la plateforme détectée est mise en avant (`detecter()` existe déjà et gère le cas
  iPadOS), les autres restent accessibles en accordéon ;
- textes réécrits : ce que l'installation apporte concrètement (ouverture hors ligne,
  notifications, pas de barre d'adresse) plutôt que la seule procédure.

---

## Lot 7 — Impression : tous les enfants sur une feuille A4

> **Fait le 2026-08-08.** `src/composants/FicheFoyer.tsx` livré, avec le bouton sur
> l'accueil et sur `/reglages`. Écarts :
>
> - **La bascule en paysage au-delà de 5 enfants n'a pas été faite, volontairement** :
>   elle contredit la règle de pagination par groupes de 4 énoncée juste au-dessus.
>   Une page ne portant jamais plus de 4 colonnes au-delà de 5 enfants, le paysage
>   n'aurait plus rien à corriger — c'était une règle morte.
> - Le corps de texte suit `data-enfants` plutôt qu'une variable CSS posée en ligne :
>   un composant ne porte que des classes, et cinq cas se listent plus vite qu'ils ne
>   se calculent.
> - `FicheImprimable` perd son `aria-hidden="true"`, comme le demandait le §11.3 : la
>   fiche est déjà en `display: none` hors impression, donc absente de l'arbre
>   d'accessibilité, et l'attribut privait de tout contenu qui imprime en PDF pour le
>   relire ensuite.
> - Vérifié par la structure du DOM — 5 enfants sur une page de 6 colonnes, 7 enfants
>   sur deux pages de 4 et 3. **L'aperçu papier lui-même n'a pas pu être contrôlé** :
>   ce navigateur n'expose pas l'émulation du média `print`, et ouvrir la boîte
>   d'impression bloquerait la session.

*Dépend du lot 2.*

### Calcul de capacité

A4 portrait, marges de 12 mm (déjà dans `@page`) : **186 × 273 mm** utilisables.
Mise en page retenue : **un tableau unique, les 5 jours en lignes, un enfant par colonne.**

| Élément | Hauteur |
| --- | --- |
| En-tête (foyer, adresse, date) | 15 mm |
| Ligne d'en-tête du tableau (prénom, cycle, arrêt) | 18 mm |
| 5 lignes de jour | 5 × 34 mm = 170 mm |
| Pied (avertissement, source) | 14 mm |
| **Total** | **217 mm** — tient largement |

La contrainte est la **largeur** : `(186 − 22 mm de colonne « jour ») / N` par enfant.

| Enfants | Largeur/colonne | Verdict |
| --- | --- | --- |
| 1–3 | ≥ 54 mm | Confortable, corps 10 pt |
| 4 | 41 mm | Bon, corps 9,5 pt |
| **5** | **33 mm** | **Limite** — corps 9 pt, suffisant pour `07:25 → 07:45` sur deux lignes |
| 6+ | < 28 mm | Illisible → pagination |

**Règle : jusqu'à 5 enfants sur une page, au-delà on pagine par groupes de 4.** Cinq est
aussi la limite naturelle du domaine (précoce + C1 à C4), donc le cas « 6 enfants » restera
théorique — mais il doit produire deux pages propres, pas une bouillie.

### Mise en œuvre

- Nouveau composant `src/composants/FicheFoyer.tsx` : la fiche multi-enfants, sur le modèle
  de `FicheImprimable.tsx` (qui reste, pour l'impression d'un enfant seul).
- Bouton « Imprimer toute la famille » sur `/reglages` et sur l'accueil. La clé
  i18n `calendrier.tousLesEnfants` existe déjà et sera reprise pour la variante agenda.
- CSS dans la couche `impression` de `src/index.css` : `break-inside: avoid` sur chaque
  ligne de jour, `--enfants` en variable CSS pour piloter le corps de texte, et un
  `@media print` qui bascule en paysage au-delà de 5 enfants.
- Chaque cellule affiche : heure de départ, flèche, heure d'arrivée, nom de ligne en petit ;
  plus les mentions récupération/dépose Dillendapp et les trajets manquants.

**Vérification** : `window.print()` → aperçu PDF avec 1, 3, 5 puis 7 enfants fictifs.

---

## Lot 8 — Espace commune (partie Worker)

> **Fait le 2026-08-08.** `worker/src/commune.js` livré avec ses quatre routes, plus
> `worker/creer-agent.sh` et la section d'ADMIN.md. 28 tests. Écarts et ajouts :
>
> - `validerPlan()` est bien **importé** depuis `src/lib/validation.ts` par le Worker,
>   comme demandé : vérifié par `wrangler deploy --dry-run`, esbuild résout le
>   TypeScript et les imports JSON sans configuration.
> - En revanche, `src/lib/github.ts` **n'a pas pu être partagé** : il importe
>   `src/config.ts`, qui lit `import.meta.env` et n'existe donc pas hors de Vite.
>   `worker/src/github.js` reprend le strict nécessaire, avec le dépôt en variable
>   d'environnement plutôt qu'en constante compilée.
> - Le CORS des routes `/commune/*` vérifie l'origine contre `ORIGINES_AUTORISEES`.
>   Les routes existantes gardent leur `cors()` permissif : leur reprise est
>   explicitement au lot 11, et les mélanger aurait brouillé les deux lots.
> - `publiePar` est toujours pris dans la session, jamais dans la charge : un client
>   ne choisit pas la signature de sa publication.
> - Le script engendre le code en base 32 sans caractères ambigus (ni 0/O, ni 1/l/I) :
>   un code se dicte au téléphone.
>
> **Réserves** : rien n'a tourné contre Cloudflare ni GitHub. Les 29 tests s'appuient sur
> un KV en mémoire, `worker/src/github.js` n'a jamais émis d'appel réel, et
> `creer-agent.sh` n'a été vérifié que par `bash -n`, jamais exécuté. Par ailleurs, la
> limitation de débit repose sur la cohérence **différée** de KV : en cas de requêtes
> concurrentes, quelques tentatives de plus passeront — sans commune mesure avec les
> milliers qu'exigerait une force brute, mais le comportement n'est pas strict.

*Indépendant des lots 1 à 7. Peut être lancé en parallèle.*

Objectif : un agent communal publie une alerte **sans compte GitHub et sans voir de JSON**.

### 8.1 Authentification par code d'accès — `worker/src/`

Le Worker Cloudflare détient déjà un espace KV (`ABONNEMENTS`) et les secrets. On lui
ajoute le rôle de **publieur**.

Nouveau module `worker/src/commune.js` :

- `POST /commune/connexion` — corps `{ code }`. Le Worker compare le code à ceux stockés
  en KV sous `agent:<empreinte>` (valeur : `{ nom, service, cree, dernierAcces }`).
  - comparaison **à temps constant** (le code n'est jamais comparé par `===` sur la chaîne
    brute : on compare les empreintes SHA-256) ;
  - **limitation de débit** en KV par IP : 5 tentatives / 15 min, puis 429. Sans cela, un
    code à 8 caractères se force en quelques heures ;
  - en cas de succès, émission d'un **jeton de session signé** (HMAC-SHA-256 avec un secret
    `SECRET_SESSION`, durée 8 h, contenant `nom`, `service`, `expire`). Renvoyé dans le
    corps JSON, stocké côté navigateur en `sessionStorage` — même politique que le jeton
    GitHub actuel dans `Admin.tsx`.
- `POST /commune/perturbations` et `DELETE /commune/perturbations/:id` — vérifient le
  jeton de session, **valident intégralement la charge côté Worker** (voir lot 11), puis
  écrivent `public/urgences.json` via l'API GitHub avec le secret `GITHUB_PAT` (jeton
  *fine-grained*, portée : contenu en écriture, **ce dépôt uniquement**). Le message de
  commit porte l'auteur réel : `Urgence : annulation — publié par Marie (service technique)`.
  La relecture-avant-écriture avec `sha` (déjà implémentée dans `src/lib/github.ts`) est
  reproduite côté Worker pour ne pas écraser une publication concurrente.
- `POST /commune/horaires` — même mécanique, mais écrit `src/data/plan-2025-2026.json`.
  **Le Worker revalide le plan complet avant d'écrire** en réutilisant `validerPlan()` :
  extraire `src/lib/validation.ts` en module partagé importable par le Worker (il ne dépend
  que de `arrets` et `cycles`, donc de `src/data/`), plutôt que d'en écrire une seconde
  version qui divergera.
- `GET /commune/journal` — les 50 dernières actions (KV, préfixe `journal:`), pour que
  chacun voie ce qui a été publié et par qui.

Gestion des codes : commande `npx wrangler kv key put` documentée dans `ADMIN.md`, plus un
script `worker/creer-agent.sh` qui engendre un code lisible (format `xxxx-xxxx`), en stocke
l'empreinte et affiche le code une seule fois.

### 8.2 Conséquences

- La connexion GitHub OAuth reste pour `/admin` (le mainteneur), qui garde les outils
  avancés (correction d'arrêts sur carte, édition du plan complet).
- `ADMIN.md` gagne une section « Donner accès à un agent communal » (la section
  « Donner accès à la commune » existante est réécrite).
- `worker/wrangler.toml` : nouveaux secrets `GITHUB_PAT`, `SECRET_SESSION`, documentés en
  commentaire comme les précédents.

---

## Lot 9 — Espace commune (partie interface)

> **Fait le 2026-08-08.** Les trois pages sont livrées : `/commune`, `/commune/alertes`
> et `/commune/horaires`, plus `src/lib/commune.ts` qui parle au Worker. Écarts et
> ajouts :
>
> - **Incohérence trouvée entre le lot 8 et l'application** : le Worker validait un
>   type de perturbation `information` que `TypePerturbation` ne connaît pas — le
>   quatrième type s'appelle `message`. Le Worker aurait donc refusé les perturbations
>   de l'application, et accepté un type que personne n'aurait su afficher. Corrigé des
>   deux côtés, avec un test qui énumère les quatre types.
> - Le formulaire guidé réutilise la coquille `Assistant` du lot 5 : progression,
>   navigation et gestion du focus sont déjà écrites, il aurait été absurde de les
>   refaire.
> - `useBlocageRechargement` est branché sur les deux pages, comme le §1.4 le prévoyait :
>   une annonce à moitié tapée ne doit pas disparaître sous un rechargement automatique.
> - Le diff d'horaires se lit bien en langage naturel — « Aller — Bus 1 · Matin ·
>   Noerdange · Gare : 07:28 → 07:35 » — et une heure ramenée à sa valeur d'origine
>   disparaît de la liste plutôt que d'y figurer comme un changement nul.
> - La validation locale par `validerPlan()` sert à montrer les problèmes tout de suite ;
>   c'est celle du Worker qui fait autorité, et les deux appellent la même fonction.
> - Le jeton de session vit en `sessionStorage` : fermer l'onglet suffit à se
>   déconnecter d'un poste partagé.
>
> **Ce qui n'a pas pu être vérifié** : aucun aller-retour réel avec le Worker. Les
> pages ont été éprouvées avec une session simulée et un Worker injoignable — le
> rendu, la navigation, le diff et le message d'erreur réseau sont bons, mais la
> connexion par code et la publication effective attendent le déploiement.
>
> **Reporté au lot 10, volontairement** : la modification temporaire d'horaire qui
> produirait une perturbation de type `retard` depuis l'écran des horaires. Le §9 la
> mentionne, mais l'écran des alertes la couvre déjà, et la dupliquer aurait fait deux
> chemins vers le même résultat.

*Dépend des lots 2 et 8.*

Deux pages distinctes, volontairement séparées : un agent qui vient annoncer une annulation
ne doit jamais tomber sur l'éditeur d'horaires.

### `/commune` — connexion

Un seul champ (le code), gros, en `inputmode` adapté, avec message d'erreur en clair
(« code inconnu » / « trop de tentatives, réessaie dans 12 minutes »). Aucune mention de
GitHub, de JSON ni de jeton.

### `/commune/alertes` — annoncer une perturbation

Reprise de la logique de `Admin.tsx` (`brouillon()`, `ResumePerturbation`), réécrite en
**formulaire guidé** :

- **Étape 1 — Que se passe-t-il ?** Quatre grandes cartes cliquables :
  « Un bus est annulé » · « Un bus a du retard » · « Un arrêt est déplacé » ·
  « Une information à faire passer ».
- **Étape 2 — Qui est concerné ?** Ligne, course et arrêt en listes déroulantes déjà
  alimentées par `plan.lignes` et `arrets` — jamais d'identifiant technique à l'écran,
  seulement les noms lisibles (`nomArret`, `ligne.nom`).
- **Étape 3 — Quand ?** Boutons « aujourd'hui » / « aujourd'hui et demain » / « choisir des
  dates », plutôt que deux champs date nus.
- **Étape 4 — Message et gravité.** La gravité est exprimée en conséquences
  (« information » / « à savoir avant de partir » / « urgent, prévenir tout le monde »),
  pas en jargon.
- **Étape 5 — Aperçu et publication.** Ce que verront les parents, à l'identique, plus
  un rappel du délai de mise en ligne.

Sous le formulaire : la liste des perturbations en cours avec un bouton « retirer » par
ligne (confirmation explicite).

### `/commune/horaires` — modifier un horaire

**Aucun JSON à l'écran.** Vue tabulaire : ligne → course → arrêts, chaque heure étant un
champ `type="time"` modifiable.

- **Modification temporaire** : produit une perturbation de type `retard` (ou une
  annulation de course) dans `urgences.json` — réversible, sans reconstruction du site.
- **Modification définitive** : modifie `src/data/plan-2025-2026.json` via
  `POST /commune/horaires`. Écran de confirmation montrant un **diff lisible en langage
  naturel** (« Aller — Bus 2, matin, arrêt Hovelange : 07:32 → 07:35 »), les problèmes
  remontés par `validerPlan()` traduits en français simple, et un avertissement que le site
  sera reconstruit (une à deux minutes).

Le bloc `AdminPlan.tsx` (coller du JSON) **reste** sur `/admin`, réservé au mainteneur.

---

## Lot 10 — Notifications répétées pour les perturbations majeures

> **Fait le 2026-08-08.** `worker/src/rappels.js` et son cron sont livrés, avec le
> réglage parent et le champ `rappels` côté commune. 20 tests dédiés. Écarts et
> corrections :
>
> - **Le créneau cron du texte ci-dessous est faux.** `*/15 5-9 * * 1-5` est en UTC,
>   alors que les rappels sont écrits en heure locale : 06:45 à Beckerich vaut 04:45
>   UTC l'été, donc **hors de la fenêtre**. Le rappel le plus utile n'aurait jamais
>   été envoyé la moitié de l'année. Remplacé par `*/15 4-14 * * 1-5`, assez large
>   pour couvrir les deux régimes horaires, et toute la décision est prise en heure
>   locale via `Intl` avec `Europe/Luxembourg`.
> - Quand plusieurs créneaux sont échus d'un coup — cron manqué, déploiement en cours
>   de matinée — un seul rappel part, celui du créneau le plus proche. Les autres sont
>   marqués comme consommés : trois notifications d'affilée seraient pires que le
>   silence.
> - Une perturbation sans course précisée est rappelée avant **tous** les départs, du
>   matin comme de l'après-midi : on ne devine pas qu'elle ne concerne que la matinée.
> - L'état est écrit **après** l'envoi : si le Worker tombe entre les deux, le rappel
>   repart au cron suivant plutôt que de disparaître en silence.
> - Le réglage parent réutilise `/abonner` au lieu d'une route de plus : la clé y étant
>   dérivée du endpoint, l'enregistrement est remplacé et non dupliqué.
> - **Conséquence assumée du réglage par défaut** (`urgences + rappels`) : une
>   perturbation d'information ou d'attention **ne fait plus sonner les téléphones**,
>   alors qu'elle le faisait jusqu'ici. Le bandeau dans l'application la montre déjà à
>   l'ouverture, et réserver la sonnerie aux alertes est ce qui lui garde son sens. Le
>   choix « Tout » rétablit l'ancien comportement.
>
> **Réserves** : aucun rappel réel n'a été envoyé. Le planificateur est couvert par 20
> tests, mais le cron n'a jamais tourné, `URL_SITE` n'a jamais été lu, et le filtre par
> préférence n'a jamais été exercé sur un vrai abonnement. Par ailleurs, le sélecteur de
> préférence n'a pas pu être vu à l'écran : il n'apparaît qu'une fois les notifications
> réellement actives, ce qui exige d'accorder la permission du navigateur.

*Dépend du lot 8 pour la partie Worker.*

Aujourd'hui, `.github/workflows/notifier.yml` envoie **une** notification par perturbation
nouvellement ajoutée. Une annulation publiée à 6 h 40 est manquée par tous ceux qui dorment
encore.

- Nouveau champ sur `Perturbation` (`src/lib/urgences.ts`) : `rappels?: number` — nombre de
  rappels souhaités, proposé automatiquement à `gravite: 'alerte'`.
- Le Worker gagne un **Cron Trigger** (`[triggers] crons = ["*/15 5-9 * * 1-5"]` dans
  `wrangler.toml`) qui, aux créneaux utiles, relit `urgences.json` et renvoie les
  perturbations de gravité `alerte` encore actives et pas encore rappelées le nombre de
  fois demandé. L'état des rappels vit en KV (`rappel:<id>` → compteur + dernier envoi).
- **Intervalles cohérents** — un rappel n'a de valeur qu'avant le départ à l'arrêt :
  - à la publication (immédiat, comportement actuel) ;
  - puis à **06:45**, **07:15** et **07:40** le jour concerné, uniquement pour une
    perturbation du matin ;
  - pour une perturbation de l'après-midi ou du soir, à **11:15** et **15:00** ;
  - **jamais plus de 3 rappels**, jamais entre 21 h et 6 h, jamais un jour sans école
    (`etatDuJour()` de `src/lib/calendrier.ts` est réutilisé côté Worker).
- Le corps du rappel diffère du premier envoi (« Rappel : le bus de 07:25 est toujours
  annulé »), sans quoi les téléphones les regroupent silencieusement.
- Côté parent : un réglage dans `Notifications.tsx` — « seulement les urgences » /
  « urgences + rappels » (défaut) / « tout ».

**Vérification** : tests unitaires du planificateur de rappels (créneaux, plafond, jours
sans école) dans `worker/src/rappels.test.js`, sur le modèle de `worker/src/push.test.js`.

---

## Lot 11 — Sécurité et nettoyage des entrées

> **Fait le 2026-08-08.** `src/lib/nettoyage.ts` livré et branché sur les deux entrées
> exposées, CSP posée, CORS du Worker corrigé, `npm audit` en intégration continue.
> 243 tests. Écarts et corrections :
>
> - **La CSP est engendrée à la construction**, dans `vite.config.ts`, et non écrite en
>   dur dans `index.html` : elle doit contenir l'origine du Worker, connue seulement au
>   build.
> - **`frame-ancestors` a été volontairement omise.** La spécification l'ignore en
>   balise `<meta>` — elle n'a d'effet qu'en en-tête HTTP, que GitHub Pages ne permet
>   pas. L'écrire aurait donné une fausse impression de protection.
> - **`style-src` autorise `'unsafe-inline'`.** Leaflet et le service worker injectent
>   des styles ; une politique qui casse la carte protégerait surtout les parents de
>   leur propre application. Les `style={{ … }}` des composants ayant disparu au lot 2,
>   c'est la seule concession.
> - Les caractères indésirables sont filtrés par propriétés Unicode (`\p{Cc}`,
>   `\p{Cf}`) et non par une liste de points de code : cette liste aurait été écrite
>   avec les caractères eux-mêmes, donc invisible dans l'éditeur comme dans une revue —
>   précisément le défaut qu'ils servent à exploiter.
> - `dateIsoValide` reconstruit la date et vérifie qu'elle se réécrit à l'identique :
>   l'expression régulière seule laissait passer un 31 février.
> - **Le CORS du Worker renvoyait l'origine de la requête telle quelle** sur `/abonner`
>   et `/desabonner` : n'importe quel site pouvait faire désabonner un parent depuis son
>   navigateur. Il compare désormais à `ORIGINES_AUTORISEES`.
> - `chargerUrgences()` valide chaque perturbation séparément et **ignore les entrées
>   invalides sans emporter les autres** : une faute de frappe dans le fichier ne doit
>   pas priver les parents de toutes les annonces.
> - `decoderFoyer()` refuse le lien **entier** quand le foyer n'a pas de coordonnée
>   valable, mais se contente d'ignorer une adresse dérogatoire aberrante : sans
>   domicile il n'y a aucun trajet à calculer, alors qu'un jour dérogatoire en moins
>   laisse une configuration utilisable.
> - Les deux points déjà traités ailleurs sont confirmés faits : le jeton *fine-grained*
>   est documenté dans `ADMIN.md` (lot 8), et l'`aria-hidden` de `FicheImprimable` a été
>   retiré (lot 7).
>
> **Réserve** : la CSP a été éprouvée sur le build local servi par `vite preview` —
> carte OpenStreetMap, service worker, QR code et navigation sur sept routes, sans une
> seule violation. Elle n'a **pas** été vérifiée sur GitHub Pages, où le chemin de base
> et l'origine diffèrent. Une violation s'y traduirait par une carte vide ou un service
> worker inerte, pas par un message visible.

*Indépendant, mais à faire **après** le lot 8, dont il durcit les points d'entrée.*

Passe complète. Points identifiés à l'audit du code actuel :

### 11.1 En-têtes et politique de contenu

GitHub Pages ne permet pas de définir d'en-têtes HTTP : poser une **CSP par balise
`<meta http-equiv>`** dans `index.html`, autorisant strictement : `'self'`, les tuiles
`*.tile.openstreetmap.org`, l'origine du Worker, et `gc.zgo.at` (GoatCounter, déjà chargé).
`object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Vérifier que Vite
n'injecte pas de style inline incompatible.

### 11.2 Validation de toute donnée entrante

Créer `src/lib/nettoyage.ts`, unique point de passage :

- `texteSur(valeur, max)` — force le type chaîne, `normalize('NFC')`, retire les caractères
  de contrôle et les marques de direction bidirectionnelle (un `U+202E` dans un prénom
  inverse l'affichage de toute une ligne), effondre les espaces, tronque à `max`.
- `coordValide([lat, lon])` — nombres finis, dans la boîte englobante du Luxembourg.
- `heureValide('HH:MM')` — l'expression `HEURE` de `validation.ts` est réutilisée.
- `dateIsoValide('AAAA-MM-JJ')`.

Points d'application :
- **`src/lib/partage.ts` / `decoderFoyer()`** — c'est l'entrée la plus exposée : n'importe
  qui peut faire ouvrir un lien. Aujourd'hui `prenom`, `libelle` et `localite` sont repris
  tels quels et les coordonnées ne sont vérifiées que par `typeof === 'number'` (`NaN` passe).
  Valider champ par champ, plafonner le nombre d'enfants (10) et la longueur des prénoms
  (40), rejeter le lien entier en cas d'anomalie plutôt que d'importer à moitié.
- **`src/lib/urgences.ts` / `chargerUrgences()`** — le fichier est relu à chaque ouverture ;
  valider chaque perturbation (types, dates, `minutes` bornées à 1–120, message ≤ 200
  caractères) et **ignorer les entrées invalides** sans faire tomber le reste.
- **Formulaires `/commune` et `/admin`** — validation à la saisie **et** revalidation côté
  Worker. Ne jamais faire confiance au client, même « le nôtre ».
- **`worker/src/`** — taille de corps maximale sur chaque route, `Content-Type` vérifié,
  `JSON.parse` toujours dans un `try`.

### 11.3 Points ciblés

- **CORS du Worker** : `cors(origine)` renvoie l'origine de la requête telle quelle, ce qui
  autorise de fait tout le monde sur `/abonner` et `/desabonner`. La remplacer par une
  vérification contre `ORIGINES_AUTORISEES`, déjà présent dans la configuration et déjà
  utilisé correctement par `retourAutorise()`.
- **Jeton GitHub OAuth** : la portée `repo` demandée par `demarrerOAuth` est très large.
  Avec le lot 8, l'agent communal n'en a plus besoin ; documenter dans `ADMIN.md` que le
  mainteneur passe de préférence par un jeton *fine-grained* saisi à la main (le champ
  existe déjà dans `Admin.tsx`).
- **`FicheImprimable`** porte `aria-hidden="true"` tout en contenant l'information ; à
  revoir au lot 7 pour que le contenu imprimé reste accessible aux lecteurs d'écran.
- **`escape` de l'ICS** : `echapper()` traite `,`, `;`, `\` et `\n`, mais pas `\r`. Un
  prénom collé depuis Windows peut casser le fichier. Corriger.

### 11.4 Contrôle continu

Ajouter au workflow `deploy.yml`, avant `construction` : `npm audit --audit-level=high`.

**Vérification** : `npm test` (nouveaux tests de `nettoyage.ts` et de `decoderFoyer` sur
des liens malformés), puis vérification manuelle qu'un lien de partage trafiqué
(coordonnées hors zone, prénom de 5 000 caractères, `U+202E`) est refusé proprement.

---

## Lot 12 — Agenda : ICS amélioré et architecture d'export

> **Fait le 2026-08-08.** L'export est isolé dans `src/lib/agenda/` autour d'une
> représentation intermédiaire `EvenementRecurrent`, et `calendrier.ts` retrouve une
> seule responsabilité — savoir s'il y a école. Écarts et ajouts :
>
> - L'export « toute la famille » produit **un seul fichier** : trois enfants voulaient
>   dire trois calendriers à activer, masquer et supprimer séparément.
> - Le regroupement des trajets tient compte des **arrêts**, pas seulement de la ligne
>   et de l'heure : une adresse dérogatoire change le lieu du rendez-vous ce jour-là, et
>   un agenda qui annoncerait le mauvais arrêt serait pire qu'aucun agenda.
> - Nouvelle page `/agenda` : ce qu'il faut faire du fichier une fois téléchargé, avec
>   une démonstration animée par plateforme. Sans elle, le bouton produisait un fichier
>   que beaucoup de parents ne retrouvaient jamais.
> - `lienGoogleAgenda()` est supprimé, ainsi que ses clés i18n.
> - Les tests ICS déménagent avec le code qu'ils couvrent, dans
>   `src/lib/agenda/agenda.test.ts`.
>
> **Réserve** : aucun fichier `.ics` produit par la nouvelle chaîne n'a été importé dans
> un vrai agenda. Les 27 tests vérifient la structure du texte, pas qu'Apple Calendrier
> ou Google l'acceptent.

*Dépend du lot 3 (les adresses par jour changent les lieux des événements).*

- **Isoler l'export** : `src/lib/calendrier.ts` mélange calendrier scolaire et génération
  ICS. Extraire la partie export vers `src/lib/agenda/` avec une représentation
  intermédiaire commune — `EvenementRecurrent { titre, lieu, debut, duree, jours, exclusions,
  rappel }` — puis un producteur `versIcs()`. C'est cette représentation que le lot 13
  branchera sur l'API Google, sans réécrire le calcul.
- **Export « toute la famille »** : un seul `.ics` contenant tous les enfants
  (`calendrier.tousLesEnfants` existe déjà en i18n).
- **Assistant d'import** par plateforme (iOS, Android, Google Agenda web, Outlook), avec
  les mêmes animations SVG que le lot 6.
- **Retirer** les liens « autre agenda » : `lienGoogleAgenda()` est déjà signalé comme
  inférieur au `.ics` dans son propre commentaire (Google gère mal `EXDATE` dans une URL de
  modèle). Le supprimer plutôt que de l'entretenir.
- Prendre en compte les nouveautés du lot 3 : dépose du matin au Dillendapp, adresses
  dérogatoires (le `LOCATION` change ce jour-là).

---

## Lot 13 — Intégration Google Agenda (activable)

> **Fait le 2026-08-08. Actif depuis le 2026-08-10** : l'ID client est posé, la portée
> déclarée, et l'auteur a écrit ses rendez-vous dans un vrai Google Agenda — voir le
> correctif du 2026-08-10 sur la session. `src/lib/agenda/google.ts` livré : OAuth PKCE
> dans l'onglet, portée `calendar.app.created`, un agenda dédié par enfant,
> identifiants d'événements stables pour que la resynchronisation remplace au lieu de
> dupliquer. Le bloc n'apparaît dans `/agenda` que si `VITE_ID_CLIENT_GOOGLE` est
> défini — vérifié : sans lui, aucun bouton de connexion n'existe.
>
> - La CSP a dû être élargie à `oauth2.googleapis.com` et `www.googleapis.com` en
>   `connect-src`, et `accounts.google.com` en `form-action`.
> - `PUT` sur un identifiant dérivé de l'enfant et du trajet, et non `POST` : sans cela,
>   chaque resynchronisation aurait créé un doublon.
>
> **Réserves** : le prérequis à ta charge — projet Google Cloud, API Calendar activée,
> ID client OAuth « application web », écran de consentement publié pour la portée
> `calendar.app.created` — **n'est pas fait**. Rien de ce module n'a donc jamais tourné :
> ni le flux PKCE, ni la création d'agenda, ni l'écriture d'un événement. C'est du code
> écrit contre une documentation, pas contre un serveur.
>
> **Repris le 2026-08-10** (voir R21 à R24) : chaque refus de Google a désormais sa
> phrase — portée absente, session invalide, autre — et le motif brut ne s'affiche plus
> qu'à défaut de savoir nommer la cause. Leçon : un jeton vit en `sessionStorage`, donc
> plus longtemps que ce que Google en pense ; toute réponse `401` doit clore la session
> à l'écran, pas seulement dans l'état interne.
>
> Surtout, les deux vrais empêchements étaient dans ce fichier, pas dans la console
> Google : `calendarList.list` interdit à cette portée, et `PUT` qui ne crée pas. Le
> module n'a jamais écrit une seule ligne dans un agenda — R23 dit ce qu'il en coûte
> d'écrire contre une documentation lue en diagonale.

*Dépend du lot 12. À lancer quand l'ID client Google Cloud existe.*

- Prérequis à ta charge : créer un projet Google Cloud, activer l'API Calendar, créer un
  **ID client OAuth de type « application web »** (l'ID client est public, il n'y a pas de
  secret à protéger), publier l'écran de consentement pour la portée
  `https://www.googleapis.com/auth/calendar.app.created`. Cette portée **restreint l'accès
  aux agendas créés par l'application** : elle ne donne aucun droit sur l'agenda personnel
  existant, ce qui est exactement la garantie recherchée.
- Flux **OAuth PKCE côté navigateur** : le jeton reste dans l'onglet, rien ne transite par
  le Worker ni par GitHub Pages. Aucune donnée familiale ne quitte l'appareil autrement que
  vers Google, à la demande explicite du parent.
- L'application crée **un agenda dédié par enfant** — « Bus scolaire — Léa » — et y insère
  les `EvenementRecurrent` du lot 12 en événements récurrents (`RRULE` + `EXDATE` vacances).
  Conséquence directe de la demande : le parent peut masquer, modifier ou **supprimer tout
  l'agenda d'un geste**, sans toucher au sien.
- **Resynchronisation** : un bouton « mettre à jour l'agenda » remplace les événements de
  l'agenda dédié (identifiants d'événements stables dérivés de l'enfant et du trajet, comme
  les `UID` ICS actuels) — utile après un changement de cycle ou de plan.
- Nouvelle variable de build `VITE_ID_CLIENT_GOOGLE`, sur le modèle de `VITE_URL_WORKER` :
  vide, la fonctionnalité disparaît de l'interface et l'ICS reste seul, exactement comme
  `notificationsConfigurees()` le fait déjà.

---

## Lot 14 — Reprise de l'assistant et de la présence au Dillendapp

> **Fait le 2026-08-08.** Signalé en usage réel sur iPhone. Livré : bornes d'heures
> calculées par cycle depuis le plan de bus, deux inscriptions au Dillendapp au lieu
> d'une, adresse de midi, raccourcis « toute la semaine » remontés en tête, horaires en
> deux blocs d'une colonne, adresse du foyer verrouillée dès le deuxième enfant, actions
> retirées de l'assistant. Écarts :
>
> - **Le retour de midi ne suit plus l'adresse du soir.** Une famille qui déclarait
>   seulement « revient le soir chez la nounou » voyait aussi son retour de midi partir
>   là-bas. Désormais le midi revient au domicile sauf adresse de midi explicite. C'est
>   la lecture fidèle du libellé, mais cela change le calcul de configurations
>   existantes. Couvert par deux tests.
> - **Défaut trouvé en route et corrigé** : un enfant déposé au Dillendapp à 07:45 se
>   voyait proposer la navette de 07:38, déjà partie. `liaisons()` accepte désormais un
>   seuil `apres`.
> - **La case unique est conservée en lecture** (`Enfant.periscolaire`, marquée
>   `@deprecated`) : les configurations enregistrées et les liens de partage antérieurs
>   la portent, et `deduireInscriptions()` en tire les deux nouvelles.
> - **L'étape 5 disparaît toujours** quand la case hors-midi est décochée, mais le total
>   annoncé reste 7 : le repère ne bouge plus sous les pieds du parent.
> - **Idée B abandonnée** après mesure, voir R6 rayée.
>
> Vérifié : 312 tests (dont 9 nouveaux sur les bornes, 4 sur les deux inscriptions,
> 3 sur l'adresse de midi, 9 de composant sur l'assistant — les premiers du dépôt) ;
> mesures DOM à 390 px sur les cinq étapes touchées ; lien de partage v4 relu.
>
> **Réserves** : R16.

*Dépend des lots 3, 4 et 5.*

Sept points relevés après usage : raccourcis hebdomadaires sous les grilles, deux
explications d'horaires empilées et illisibles sur iPhone, heures non bornées, adresses
dérogatoires en contradiction avec la présence au Dillendapp, actions dupliquées en fin
d'assistant, adresse du foyer modifiable depuis l'assistant de n'importe quel enfant, et
un modèle d'adresses qui ignore le déjeuner ailleurs qu'à la maison.

### 14.1 Amplitude d'accueil — `src/data/ecoles.json`, `src/lib/types.ts`

`maisonRelais.horaires` : ouverture, fermeture, marge avant bus. Les bornes ne sont pas
des constantes du code.

### 14.2 Bornes par cycle — `src/lib/plan.ts`

`bornesDillendapp(ctx, jour)` lit le dernier départ Dillendapp → école du cycle et en
retranche la marge ; à défaut de navette, le début des cours. Le soir, l'arrivée du bus
fait le plancher. `ajusterDillendapp()` écrête au changement de cycle.

### 14.3 Deux inscriptions — `src/lib/types.ts`, `src/lib/plan.ts`

`periscolaireMidi` et `periscolaireHorsMidi`. `RechercheOptions.repas` devient
`inscritDillendapp` : une desserte réservée aux inscrits reste ouverte à l'enfant qui
n'est là qu'en dehors du midi.

### 14.4 Adresse de midi — `src/lib/types.ts`, `src/lib/plan.ts`

`AdresseJour.midi`, `ArretsDuJour.midi`. Proposée seulement les jours avec cours
l'après-midi où l'enfant ne déjeune pas au Dillendapp.

### 14.5 Migrations — `src/lib/stockage.ts`, `src/lib/partage.ts`

Lien de partage en version 5 : second drapeau d'inscription, adresses en triplets
`[matin, midi, soir]`. Les versions 1 à 4 restent lisibles.

### 14.6 à 14.8 Écrans et invariants

Assistant, grilles, et `etat.tsx` où se ferment les contradictions : une heure de dépose
efface l'adresse du matin, une récupération un mardi force le repas au Dillendapp.

### 14.9 à 14.13 Ménage et couverture

Regex `HEURE` factorisée, récapitulatif Dillendapp sur la fiche, compteur au repli des
adresses, et `src/pages/AssistantEnfant.test.tsx`.

---

## Lot 15 — Traductions modifiables sans reconstruction

> **Fait le 2026-08-08.** Livré : `public/traductions.json` en surcouche relue à chaque
> ouverture, éditeur commun à `/admin` et au nouvel espace `/traductions`, rôle distinct
> côté Worker, et `/admin` passé en onglets. Écarts :
>
> - **`chargerTraductions` vit dans `src/i18n/surcouche.ts`**, pas dans
>   `src/lib/traductions.ts` : ce dernier est importé par le Worker, qui n'a ni `fetch`
>   vers le site ni `import.meta.env`.
> - **Deux barrières, pas une** entre les espaces : préfixe KV (`agent:` contre
>   `traducteur:`) et rôle inscrit dans le jeton signé. Un jeton d'avant les rôles est lu
>   comme un jeton de commune, pour ne pas déconnecter une session en cours.
> - **Scintillement assumé** : le premier rendu utilise les dictionnaires du bundle, qui
>   sont complets ; la surcouche ne fait que corriger.
> - **`/traductions` ne touche pas aux crédits.** Un traducteur ne s'ajoute pas lui-même.
>
> Vérifié : 15 tests sur les règles de la surcouche, 8 sur les onglets, 4 sur la
> séparation des rôles ; `globIgnores` et `runtimeCaching` posés — le build reste à
> 18 entrées préchargées, donc la surcouche n'est pas figée.
>
> **Réserves** : R17, R18.

*Dépend du lot 8 pour le Worker, du lot 11 pour la validation des entrées.*

Corriger une tournure allemande demandait un commit et un redéploiement, donc l'auteur.

### 15.1 Surcouche — `public/traductions.json`, `src/lib/traductions.ts`

Clés pointées et plates. Une correction doit viser une clé qui existe en français, du
même type, avec exactement les mêmes marqueurs `{…}`. Une entrée refusée est ignorée,
les autres s'appliquent.

### 15.2 à 15.5 Éditeur, rôle et hôtes

`EditeurTraductions` avec le français en référence et le motif de refus affiché à la
saisie ; `routerTraductions` côté Worker ; `Onglets` générique, l'onglet actif dans la
query string.

---

## Lot 16 — Crédits et remerciements

> **Fait le 2026-08-08.** Livré : `src/data/credits.json`, page `/credits` liée depuis
> les réglages, éditeur en cinquième onglet d'`/admin`. Écarts :
>
> - **Fichier du bundle, pas surcouche** : une page de crédits doit s'afficher hors
>   ligne, et elle change quelques fois par an. Sa publication déclenche donc une
>   reconstruction, ce que l'éditeur annonce.
> - **Un `lien` n'est rendu cliquable que s'il est en `http(s)`.** C'est le seul endroit
>   du projet où du texte saisi dans une page web devient une URL sur une page publique.
> - **Une langue sans traducteur déclaré n'affiche pas de bloc vide** : cela se lirait
>   comme un oubli plutôt que comme une absence.
>
> Vérifié : 9 tests, dont le refus d'un `javascript:` ; page mesurée à 390 px.

*Dépend du lot 15 pour les onglets d'`/admin`.*

Trois sections : développement, traductions par langue, remerciements. Le fichier porte
des noms de tiers : seuls ceux dont l'accord est acquis y figurent, et la page le dit.

---

## Lot 17 — Notifications prioritaires, et ce qu'elles ne remplacent pas

> **Fait le 2026-08-08.** Livré : en-tête `Urgency` de la RFC 8030, TTL calculé sur la
> fenêtre de pertinence, vibration sur les alertes, marche à suivre par plateforme après
> activation, et encart d'honnêteté permanent. Écarts :
>
> - **Rien sur WhatsApp.** Envoyer un message supposerait de confier le numéro de chaque
>   parent à un serveur et à Meta : cela romprait le principe n° 1. Décision de l'auteur.
> - **Aucune application web ne peut se déclarer prioritaire d'elle-même** : le niveau
>   « temps réel » d'iOS est réservé aux applications natives, et le canal Android
>   appartient au navigateur. Tout ce qui pouvait l'être l'est au niveau du transport ;
>   le reste est écrit noir sur blanc à l'écran.
> - **Notification d'essai** d'abord écartée du périmètre, puis livrée le 2026-08-09
>   avec les correctifs ci-dessous. R20 rayée.
> - Ajouté au passage, hors plan initial : l'avertissement du site officiel sur les
>   horaires indicatifs, repris mot pour mot sur `/plan`, `/limites` et la fiche enfant.
>
> Vérifié : 61 tests du Worker, dont deux nouveaux sur `Urgency`.
>
> **Réserves** : R19.

*Indépendant des lots 14 à 16.*

Un bus annulé est une information dont dix minutes de retard changent la valeur. La
requête push ne portait aucun en-tête d'urgence, et rien n'expliquait au parent comment
faire sortir ces notifications du lot sur son téléphone.

---

## Lot 18 — Seconde refonte visuelle : la direction « verre »

> **Fait le 2026-08-10.** Mise en œuvre de la maquette *Schulbus App — Produktion*
> (projet Claude Design `c55e28ef`), importée depuis `Schulbus App - Produktion.dc.html`.
> La maquette décrit trente écrans dans une direction unique : fond en dégradé bleu
> profond, surfaces translucides à arête lumineuse, IBM Plex Sans et Mono, heures
> géantes à chasse fixe, rail de navigation flottant.
>
> **La maquette n'a pas été reprise telle quelle.** Cinq écarts, tous assumés :
>
> - **Les polices ne viennent pas de Google Fonts.** La maquette pose un `<link>` vers
>   `fonts.googleapis.com`. Trois raisons de ne pas le suivre : la CSP n'autorise que
>   `font-src 'self'` ; l'application doit s'ouvrir à un arrêt de bus sans réseau ; et
>   une requête vers un tiers à chaque ouverture révélerait qui consulte ce site, ce
>   qu'interdit le principe n° 1. Les deux familles sont donc servies depuis le site
>   (`src/polices.css`), et **seuls les sous-ensembles réellement lus** sont déclarés —
>   `latin` et `latin-ext` pour le texte, `latin` seul pour les chiffres. Importer les
>   feuilles de `@fontsource` aurait embarqué le cyrillique, le grec et le vietnamien,
>   précachés par le service worker sans jamais s'afficher. Coût réel : 107 Ko.
> - **La palette a été refaite, pas recopiée.** Les encres de la maquette ne tiennent pas
>   le seuil de 4,5:1 qu'impose `CLAUDE.md` : son gris de texte secondaire
>   (`rgb(233 239 246 / .62)`) tombe à **3,13:1** sur un voile posé dans l'angle clair du
>   dégradé. Un fond translucide ne se vérifie pas comme une couleur unie — il faut
>   mesurer la COMPOSITION réelle : arrêt du dégradé, halo décoratif, une puis deux
>   couches de verre. Les 24 compositions possibles ont été calculées par thème, contre
>   chaque encre, en n'appariant que ce qui se rencontre vraiment (une encre d'alerte ne
>   paraît jamais sur un encart de succès). Le dégradé a été assombri, les voiles
>   allégés, les encres relevées : **pire cas 4,58:1**, contre 3,13 en reprenant la
>   maquette. Les valeurs figurent en commentaire dans la couche `tokens`.
> - **Pas de `backdrop-filter` sur les cartes.** Une carte est posée sur un dégradé
>   lisse, et flouter un dégradé lisse redonne le même dégradé : le flou n'y change rien
>   à l'œil, alors que chaque surface floutée coûte une couche composée. Il ne reste que
>   sur les quatre surfaces sous lesquelles du contenu défile vraiment — en-tête, rail,
>   bandeaux, suggestions. Dans le même esprit, `background-attachment: fixed` a été
>   abandonné : cause connue de saccade au défilement sur téléphone, et ignoré par iOS.
> - **La bordure claire reste une bordure.** En thème clair, la maquette trace les arêtes
>   en blanc translucide. Sur un fond clair, un filet blanc ne sépare rien : la bordure
>   structurelle passe à l'encre translucide, et c'est `--lustre` seul — un filet de
>   lumière en `inset` — qui garde l'arête de verre.
> - **Le texte d'invite des champs** descend volontairement sous le seuil de lecture
>   confortable (`opacity: .62`). À `--encre-douce` il se lisait comme une valeur déjà
>   saisie. C'est la seule encre qui s'y autorise, et elle ne porte aucune information —
>   le libellé au-dessus dit la même chose.
>
> **Ajouté par la maquette, au-delà du style** : l'heure du prochain départ devient un
> bloc à part entière (`.prochain`), dimensionné pour être lu à bout de bras. En la
> grossissant, deux défauts de l'écran d'accueil sont devenus visibles et ont été
> corrigés :
>
> - il affichait l'heure de DÉPART pour un retour, c'est-à-dire l'heure à laquelle le bus
>   quitte l'école — sans intérêt pour qui attend au bout de la rue. La page « semaine »
>   appliquait déjà la bonne règle ; l'accueil s'en écartait ;
> - il **ignorait complètement les perturbations**. Un bus annulé y gardait son heure,
>   affichée comme si de rien n'était. Les trajets annulés disparaissent maintenant de
>   l'accueil, et un retard s'y lit comme ailleurs : ancienne heure barrée, nouvelle à
>   côté.
>
> **Vérifié** : 352 tests, `typecheck`, `lint`, build. Puis le même banc qu'au lot 2, mis
> à jour — 12 routes × 2 largeurs (320 et 430 px) × 2 thèmes = **48 combinaisons**
> mesurées dans des iframes de largeur fixe. Aucun débordement horizontal ; l'enseigne,
> le rail et tous les `.bouton` au-dessus de 44 px.
>
> **Réserves** : R25, R26, R27.

*Ne dépend de rien, et rien ne dépend de lui : c'est une reprise de la couche `tokens` et
des primitives du lot 2, sans changement de structure.*

La refonte du lot 2 avait donné une interface correcte et plate. Celle-ci lui donne une
direction : un fond qui respire, des surfaces qui se détachent, et surtout **une
hiérarchie qui dit ce que le parent est venu chercher**. Avant, l'heure du prochain bus
était un mot en gras au milieu d'un paragraphe ; c'est maintenant le seul élément de
l'application qu'on lit sans lire.

---

## Correctifs du 2026-08-09

> **Fait le 2026-08-09**, après la mise en production des lots 14 à 17. Quatre défauts
> relevés en relisant ce qui venait d'être déployé, dont aucun n'était propre aux
> nouveaux lots.

*Ne dépend de rien : chacun se tient seul.*

### Un espace non activé le disait mal

Sans `SECRET_SESSION`, le Worker répond 503 à tout `/commune/*` et `/traductions/*` —
mais `src/lib/commune.ts` ne traduisait pas ce motif : l'agent lisait « la publication a
échoué, réessayez dans un instant » devant un serveur qui ne serait jamais prêt. Motif
`non-activee` ajouté, et les deux écrans de connexion partagent désormais un `cleErreur()`
au lieu de trois ternaires imbriqués qu'il fallait penser à corriger des deux côtés.

### Une perturbation publiait tout ce qu'on lui donnait

`publierPerturbation` recopiait la charge par `...charge.perturbation` : n'importe quel
champ envoyé par un client — le nôtre ou un `curl` porteur d'une session valide — partait
tel quel dans `public/urgences.json`, donc dans un fichier public du dépôt. L'application
l'aurait ignoré à la lecture ; il aurait tout de même été publié. Liste blanche
`CHAMPS_PERTURBATION`, et `rappels` — que le client envoyait sans que personne le valide —
borné entre 0 et 3, puisque chacun commande un envoi répété à toutes les familles.

### Le journal ne rendait de comptes à personne

`GET /commune/journal` existe depuis le lot 8, `lireJournal()` était exportée, et aucune
page ne l'appelait. Un journal que personne ne peut lire ne sert à rien : il s'affiche
maintenant, replié, sur `/commune`.

### Notification d'essai

Voir R20, rayée.

---

## Correctif du 2026-08-09 — la feuille A4 débordait

> **Fait le 2026-08-09.** Signalé en usage réel : deux enfants ne tenaient pas sur une
> feuille. C'est le défaut que R1 attendait depuis le lot 7.
>
> **La cause n'était pas celle qu'on croyait.** Le lot 7 avait raisonné sur la largeur —
> « (186 mm − 22) / 5, soit 33 mm par colonne, ce qui suffit » — et pagine à cinq
> enfants. Mais la contrainte est la HAUTEUR, jamais mesurée : chaque trajet occupait
> trois lignes (les heures, la destination, le nom de la ligne), les trois jours avec
> cours l'après-midi coûtaient 57,9 mm chacun, et la feuille réclamait 285 mm pour
> 273 disponibles.
>
> Deux changements : la destination remonte sur la ligne des heures — « 07:25 → 07:45 →
> école » se lit d'un bloc — et la pagination passe de cinq à trois enfants par feuille.
>
> Mesuré au banc (règles de la couche impression rejouées dans un cadre de 186 mm,
> `table-layout: fixed` vérifié) : 1 enfant 117,6 mm · 2 enfants 220,0 · 3 enfants 219,6 ·
> 4 enfants deux pages de 204,8 et 164,1 · 5 enfants deux pages de 219,6 et 220,0. Toutes
> sous 273.
>
> **Écart de méthode, à retenir** : la première version du banc lisait la CSS dans les
> `<link rel=stylesheet>`, absents en développement — Vite injecte un `<style>`. Trois
> mesures ont donc tourné sans les règles d'impression et donnaient 166 mm pour tout
> effectif. Un banc doit contrôler qu'il mesure bien ce qu'il prétend : celui-ci vérifie
> désormais `table-layout` et la largeur du tableau avant de rendre un chiffre.
>
> **Réserve** : R1 reste ouverte — toujours pas d'impression sur papier.

*Dépend du lot 7.*

---

## Correctif du 2026-08-09 — deux traducteurs se recouvraient

> **Fait le 2026-08-09.** Défaut introduit par le lot 15 et trouvé sur question de
> l'auteur : « que se passe-t-il si deux traducteurs publient en même temps ? »
>
> **Le dernier gagnait, et effaçait l'autre sans un mot.** L'éditeur envoyait la
> surcouche ENTIÈRE, construite à partir de l'état chargé à l'ouverture de sa page ; le
> Worker écrivait cette charge par-dessus le fichier. Deux traducteurs partis du même
> état se recouvraient donc intégralement — y compris entre langues différentes, où il
> n'y avait pourtant aucun désaccord. Le `sha` de GitHub n'y changeait rien : relu juste
> avant l'écriture, il n'attrape qu'une collision de quelques millisecondes, pas deux
> personnes qui travaillent le même après-midi.
>
> Le patron correct existait déjà dans le même fichier — `majUrgences` relit, transforme,
> réécrit — et n'avait pas été suivi. Désormais : l'éditeur n'envoie que ses
> modifications (`{ langue, modifications }`, `null` valant retrait), le Worker relit
> l'état en ligne et fusionne clé par clé, puis renvoie l'état fusionné dont l'éditeur
> se sert comme nouvelle base. `/admin` suit le même chemin — rien n'empêche les deux
> espaces d'être ouverts ensemble.
>
> Deux personnes sur la même clé restent en dernier-arrivé-gagnant : c'est un vrai
> désaccord, pas un accident de mécanique, et fusionner deux traductions d'une même
> phrase n'aurait aucun sens.
>
> Vérifié : 6 tests sur `appliquerModifications`, et un test de bout en bout côté Worker
> avec le fichier GitHub simulé — A publie en allemand, B en portugais, les deux
> corrections coexistent dans le fichier réellement écrit.
>
> **L'éditeur de crédits portait le même défaut, et un cousin plus vicieux** : il
> s'amorçait sur `src/data/credits.json` COMPILÉ DANS LE BUNDLE. Publier une
> modification puis rouvrir `/admin` avant la reconstruction du site réaffichait
> l'ancienne version, et la republier annulait le travail. Il lit désormais le fichier
> du dépôt, et republie avec le `sha` lu à l'ouverture : c'est GitHub qui refuse si
> quelqu'un a publié entre-temps. Une liste de personnes ne se fusionne pas — l'ordre
> compte, un renommage ne se distingue pas d'un ajout — donc on refuse franchement
> plutôt que de deviner.
>
> Deux défauts trouvés en chemin et corrigés : `useBlocageRechargement` était appelé
> après un `return` conditionnel (ordre des hooks), et `charger` était recréé à chaque
> rendu alors qu'il sert de dépendance d'effet — ce qui aurait relancé la lecture GitHub
> sans fin.
>
> **Trois pertes de travail de plus, trouvées sur la question « du coup le traducteur
> perd son travail ? »** — et aucune n'était celle que j'avais décrite :
>
> - **Le sélecteur de langue vidait le brouillon.** Passer à l'allemand pour vérifier une
>   tournure effaçait vingt corrections portugaises, sans confirmation ni message. Il y a
>   désormais un brouillon par langue, et le nombre de corrections en attente dans les
>   autres langues est affiché.
> - **L'échec de publication affichait `t('commune.erreur')`**, qui désigne un objet du
>   dictionnaire : `t` renvoyait donc la clé, et le traducteur lisait « commune.erreur »
>   en toutes lettres, sans savoir si son travail était perdu. Le motif est maintenant
>   traduit, avec la mention explicite que le brouillon est conservé.
> - **Une session expirée après huit heures** laissait le traducteur sans issue. Le
>   message dit maintenant quoi faire : se reconnecter dans un autre onglet, puis
>   republier depuis celui-ci — le brouillon vit en mémoire, il survit.
>
> **Et un défaut de performance** : l'éditeur montait les 555 champs du dictionnaire à
> l'ouverture, y compris ceux des sections repliées — un `<details>` fermé garde ses
> enfants dans le DOM. Une section n'est plus montée qu'une fois dépliée. Mesuré par le
> temps du test : 86 s → 0,8 s.
>
> Couvert par `src/composants/EditeurTraductions.test.tsx`.

*Dépend du lot 15.*

---

## Correctif du 2026-08-09 — `/admin` était muet en production

> **Fait le 2026-08-09.** Signalé en usage réel : « Jeton refusé par GitHub » à chaque
> connexion. Le jeton n'y était pour rien.
>
> **`connect-src` n'autorisait pas `https://api.github.com`.** Toute la page `/admin`
> passe par cette origine — vérification du jeton, urgences, plan, textes, crédits. La
> CSP bloquait l'appel avant qu'il ne parte ; le navigateur rejetait le `fetch`, et le
> `catch` de `verifierAcces` concluait à un jeton invalide. Le message accusait donc un
> tiers qui n'avait rien reçu.
>
> Le défaut date du lot 11 et vivait en production depuis. Il n'a été vu ni par les
> tests — aucun n'exerce la CSP, qui n'existe qu'au build — ni par la vérification de
> R9, qui avait regardé les tuiles, le service worker et GoatCounter, mais pas `/admin` :
> l'ouvrir demande une connexion GitHub, et c'est exactement ce que R18 disait n'avoir
> jamais été fait. **R9 est donc rouverte** : une CSP n'est pas vérifiée tant que chaque
> origine qu'elle autorise n'a pas été exercée.
>
> Second correctif, de méthode : `verifierAcces` distingue désormais un appel qui n'est
> jamais parti d'un jeton refusé. Confondre les deux avait envoyé chercher un problème
> de jeton pendant que la politique de sécurité était en cause — et un jeton qu'on n'a
> pas pu soumettre n'est plus jeté, ce qui évitait de refaire toute la connexion pour
> une coupure réseau.

*Dépend du lot 11.*

---

## Correctif du 2026-08-09 — l'éditeur de textes proposait du vide

> **Fait le 2026-08-09.** Signalé en usage réel : « quand on choisit une langue, ça ne
> change pas le contenu de la page, ça reste français ».
>
> **Le champ ne partait pas de la traduction existante.** `valeurAffichee` retombait sur
> `valeurDeReference`, c'est-à-dire le français — et pour un texte, sur une chaîne VIDE.
> Le traducteur voyait donc un champ blanc et devait retaper une phrase qui existait
> déjà dans `de.json`. Changer de langue ne changeait rien à l'écran, puisque tout était
> vide dans toutes les langues : seul le bloc de référence, en français, restait visible.
> D'où la description.
>
> Le champ propose désormais ce qu'un parent lit aujourd'hui : correction publiée s'il y
> en a une, sinon le dictionnaire compilé de la langue, avec repli sur le français.
>
> **Et un sélecteur « Comparer à »** : le bloc de référence affichait le français et lui
> seul. Traduire vers le portugais en regardant l'allemand est souvent plus parlant. Le
> français reste la référence de VALIDATION — les marqueurs `{…}` s'y comparent — mais
> plus forcément celle qu'on lit. Une langue ne peut pas se comparer à elle-même.
>
> Les dictionnaires compilés sortent de `src/i18n/index.tsx` vers
> `src/i18n/dictionnaires.ts` : l'éditeur a besoin de lire une langue qui n'est pas
> celle affichée, et `src/lib/traductions.ts` — importé par le Worker — ne doit pas se
> charger des cinq.
>
> Vérifié par 3 tests de plus, dont celui qui a échoué en premier pour la bonne raison :
> il écrivait « Fertig » dans un champ qui contenait déjà « Fertig ».
>
> R9 et R18 levées dans la foulée : l'auteur a publié des crédits et une perturbation
> depuis `/admin`, tous deux passés par l'API GitHub — ce que la CSP interdisait encore
> une heure plus tôt.

*Dépend du lot 15.*

---

## Correctif du 2026-08-09 — ce que la mesure ne voyait pas

> **Fait le 2026-08-09**, sur un PDF envoyé par l'auteur. La correction du matin avait
> ramené la fiche sous les 273 mm ; la feuille faisait toujours deux pages.
>
> **Ma mesure portait sur le mauvais objet.** Le banc mesurait `.fiche-foyer` isolée, en
> supposant que le reste était masqué à l'impression. Il ne l'était pas :
>
> - **`.bandeaux` manquait dans la liste des éléments masqués** — au pluriel, alors que
>   la règle ne citait que `.bandeau`. Le bandeau des perturbations en cours s'imprimait
>   donc en tête de feuille, avec l'avertissement d'indépendance, et poussait la semaine
>   sur une seconde page. Au-delà de la place : une annulation valable deux jours n'a
>   rien à faire sur une feuille qu'on garde sur le frigo.
> - **`.fiche__ligne` n'était `display: block` que dans la liste des trajets.** Dans
>   l'en-tête de colonne, deux lignes consécutives se suivaient : « École primaire de
>   BeckerichElvange · Schoul », qui se lit comme un nom de lieu inventé.
>
> Remesuré sur la page entière, avec deux enfants dont un au Dillendapp : **245 mm**.
> Deux artefacts du banc corrigés au passage — il forçait `.fiche` en `display: block`
> au lieu de laisser l'impression décider, et `min-block-size: 100dvh` sur le corps
> ajoutait la hauteur de la fenêtre au total.
>
> **Leçon** : `@media print` ne s'applique nulle part ailleurs que sur du papier. Ni les
> tests ni le navigateur automatisé ne le voient. `src/impression.test.ts` lit désormais
> la couche `impression` et vérifie les règles qui l'ont cassée — c'est faible, mais
> c'est plus qu'une relecture.
>
> **Troisième passe, même jour.** Le second PDF montrait le bandeau parti et les
> en-têtes séparés — et toujours deux pages. Le banc, refait en luxembourgeois (les
> textes les plus longs des cinq langues), annonçait 241 mm pour 273. L'écart ne vient
> pas du contenu : il vient du moteur. La feuille sort d'**iOS Safari**, mes mesures de
> **Chrome** ; polices, métriques et surface utile diffèrent, et Safari ajoute son
> en-tête et son pied de page à l'intérieur de la page. Viser 273 au millimètre depuis
> un autre navigateur n'a aucun sens. Le corps de la fiche du foyer passe donc à 9 pt
> avec des cellules resserrées : 215 mm à deux enfants, 236 mm à trois — 58 et 37 mm de
> marge pour absorber ce que je ne peux pas reproduire.

*Dépend du lot 7.*

---

## Correctif du 2026-08-09 — le Worker ne pouvait pas écrire sur GitHub

> **Fait le 2026-08-09.** Trouvé grâce au détail d'erreur remonté quelques minutes plus
> tôt : `Error: The 'cache' field on 'RequestInitializerDict' is not implemented.`
>
> **`cache: 'no-store'` n'existe pas dans le runtime Cloudflare.** Parfaitement valable
> dans un navigateur, l'option fait lever le Worker. `worker/src/github.js` la posait sur
> chaque lecture du dépôt : toute publication échouait donc à sa PREMIÈRE ligne utile,
> et ce depuis le lot 8. Le cron des rappels avait le même appel sur `urgences.json`,
> ce qui explique R7 sans l'avoir jamais cherché.
>
> Remplacé par `cf: { cacheTtl: 0 }`, l'équivalent côté Workers.
>
> **Pourquoi rien ne l'avait vu.** Les 72 tests du Worker remplacent `fetch` par une
> fonction qui ignore ses options : une option refusée par le vrai runtime y passe
> inaperçue. Et R3 notait justement que « le Worker n'a jamais tourné contre GitHub » —
> la réserve décrivait le trou par lequel le défaut est passé, sans que personne fasse
> le lien. `worker/src/runtime.test.js` relit désormais les sources et refuse l'option.
>
> **Enchaînement des trois correctifs de la journée sur ce seul symptôme** : le message
> disait « Impossible de joindre le serveur » parce que le 500 n'avait pas d'en-têtes
> CORS ; une fois les CORS posés, il disait « le serveur a rencontré une erreur » sans
> plus ; une fois le détail remonté, il a nommé la cause en une ligne. Chaque couche
> cachait la suivante.

*Dépend du lot 8.*

---

## Lot 19 — Retours d'usage sur l'interface (2026-08-10)

> **Fait le 2026-08-10.** Huit corrections demandées après usage réel, sans rapport les
> unes avec les autres sinon qu'elles portent toutes sur ce que l'écran montre et sur ce
> qu'il demande.
>
> **La mise à jour ne se négocie plus.** Le bandeau « une nouvelle version est
> disponible » et son bouton « Recharger » ont disparu ; il ne reste que le message des
> deux secondes qui précèdent le rechargement automatique. Demander au parent de
> recharger, c'est lui demander de trancher une question qui ne le regarde pas. Quand le
> rechargement est empêché — saisie en cours dans `/admin` ou `/commune`, tentative déjà
> vaine pour cette version — l'écran ne dit plus rien : la mise à jour se fera à
> l'ouverture suivante. Clés `maj.disponible` et `maj.recharger` retirées des cinq
> dictionnaires.
>
> **L'horaire du jour est toujours là.** Chaque carte d'enfant porte désormais une
> sous-tuile qui liste les trajets de la journée, heures passées barrées. Le prochain
> départ répond à « quand faut-il partir ? » ; il ne disait rien de la suite, qu'il
> fallait aller chercher dans la fiche de la semaine. Les jours sans école, la tuile ne
> disparaît pas : elle s'éteint, et « pas d'école aujourd'hui » vient s'incruster
> par-dessus avec sa raison. Le message quittait le haut de la page, où il était loin de
> l'enfant qu'il concernait, et où il faisait disparaître les cartes entières.
>
> L'incrustation est **avant** l'horaire dans le document, alors qu'elle se pose
> par-dessus à l'écran : à la lecture vocale, le motif doit précéder les heures qu'il
> annule. Les deux couches sont empilées dans une même cellule de grille et non posées
> en `position: absolute`, pour que la tuile prenne la hauteur de la plus haute — un
> samedi, l'horaire est vide et tient sur une ligne quand le motif en fait trois. Les
> quatre couples encre/fond de l'incrustation ont été recalculés sur la composition
> réelle (voile à 55 % de `--fond` sur le contenu éteint) : 5,13:1 au pire cas, en
> thème clair.
>
> **Le pied de page tombe en bas.** `#root` fait au moins la hauteur de la fenêtre,
> `.page` est une colonne souple, le pied porte `margin-block-start: auto`. L'écart
> minimal avec le contenu vient du `gap` de `.page` — une marge ne peut pas le porter en
> même temps que l'auto. La couche `impression` remet les deux en flux normal : une
> hauteur minimale exprimée en hauteur de fenêtre est une façon connue de gagner une
> feuille pour rien (voir R29).
>
> **Chaque action est là où elle se comprend.** Le fichier `.ics` se télécharge
> désormais sur `/agenda`, au-dessus de la marche à suivre qui explique quoi en faire —
> il vivait au bas de la fiche d'un enfant, à un écran de distance, et l'on repartait
> avec un fichier sans savoir où le mettre. Un bouton par enfant, plus le fichier de la
> fratrie. La fiche de la semaine, elle, ne garde que l'impression et **deux** entrées
> vers `/agenda`, en haut et en bas : le réglage des repas et l'assistant sont partis sur
> la page des enfants, d'où ils se règlent, et la copie du lien sur les réglages, avec la
> mention de confidentialité qui doit l'accompagner. `ActionsEnfant` disparaît, remplacé
> par `TelechargementIcs`.
>
> **Les enfants ne sont plus listés à deux endroits.** `/reglages` les énumérait une
> seconde fois avec un lien vers leur semaine, sans savoir les modifier ; il ne reste que
> l'adresse et le chemin vers `/configurer`, où chaque enfant porte maintenant son propre
> bouton « voir la semaine ».
>
> **Une date simulable, pour la mise au point.** Une case dans `/admin` fait apparaître
> un sélecteur de date et d'heure sur la page « Aujourd'hui ». Rien ne se vérifie aussi
> mal qu'un écran qui dépend de l'heure : « pas d'école aujourd'hui », le prochain
> départ, le passage au trajet suivant ne se montrent que le jour et à la minute où ils
> tombent. Le réglage vit dans `localStorage`, sur le seul appareil ; décocher la case
> oublie la date, sans quoi elle ressortirait à la prochaine activation sans qu'on sache
> d'où elle vient. `src/lib/simulation.ts`, 5 tests — dont la lecture du champ comme date
> **locale**, l'erreur que l'outil est censé traquer.
>
> **Vérifié à la mesure** (Chrome, DOM, aucune capture) : tuile éteinte et incrustée un
> jour de vacances, tuile allumée avec deux heures barrées à 12:30 un mardi, prochain
> départ à 07:00, aucun débordement à 320 px de large, incrustation contenue dans la
> tuile y compris avec le motif le plus long (« année inconnue »), pied de page à 297 px
> du dernier bloc sur une page courte et à 32 px sur une page longue, case d'`/admin` qui
> écrit et efface bien ses deux clés.

*Dépend des lots 2, 12, 13 et 18. Réserves R28, R29, R30.*

---

## Correctif du 2026-08-10 — la session Google mourait avec l'onglet

> **Fait le 2026-08-10**, après l'essai de bout en bout de l'auteur — le premier contre
> le vrai Google. L'essai lève R11, R21 et R23 : portée accordée, agenda créé de zéro,
> rendez-vous écrits, seconde synchronisation sans doublon, et accès retiré depuis le
> compte Google qui donne bien « la connexion n'est plus valable ». Il a montré deux
> choses de plus.
>
> **La session ne survivait pas à la fermeture.** Le jeton vivait en `sessionStorage` :
> fermer l'application et la rouvrir renvoyait sur « Connecter mon compte Google », alors
> que le compte Google, lui, affichait toujours l'autorisation comme accordée. Le parent
> voit un écran qui lui dit le contraire de ce que dit Google — et se reconnecte à chaque
> fois, pour rien.
>
> La connexion demande désormais un accès hors ligne (`access_type=offline` ; le
> `prompt=consent` déjà posé est la condition pour que Google accorde le jeton de
> rafraîchissement). La session vit en `localStorage` et porte ce jeton ; quand le jeton
> d'accès a expiré — une heure —, un nouveau s'obtient sans rien demander, par une route
> `POST /google/rafraichir` du Worker. Le Worker relaie parce que Google exige le
> `client_secret`, et ne retient rien, comme pour l'échange initial.
>
> Le jeton de rafraîchissement est un identifiant durable, et il est écrit sur l'appareil.
> C'est acceptable ici parce que sa portée est `calendar.app.created` : il n'ouvre que les
> agendas créés par cette application, jamais l'agenda personnel. Il part avec
> « Effacer toutes mes données », qui l'oubliait jusqu'ici.
>
> **Trois motifs de refus, trois conduites.** `invalid_grant` — accès retiré, ou jeton
> périmé faute d'usage — est le seul qui justifie de tout jeter et de redemander une
> connexion ; l'écran le dit dès le chargement de la page, sans attendre un clic. Une
> panne réseau ne jette rien et se retente plus tard. Le reste passe par le chemin
> existant.
>
> **Ce que l'essai a aussi montré, et qui ne se corrige pas** : revenir dans un onglet
> resté ouvert ne montre rien d'un accès retiré entre-temps — il faut agir pour
> l'apprendre. Un jeton mort ne se distingue d'un jeton vivant qu'en s'en servant. La
> reprise au chargement réduit la fenêtre à la prochaine ouverture de la page.
>
> 6 tests côté navigateur, 6 côté Worker — le premier fichier de tests des routes Google
> du Worker, qui n'en avait aucun.

*Dépend du lot 13. Réserve R31.*

---

## Correctif du 2026-08-10 — la feuille du foyer coupait le vendredi

> **Fait le 2026-08-10**, sur la feuille d'un foyer de trois enfants envoyée par l'auteur.
> Deux défauts distincts, dont un que quatre corrections successives avaient manqué.
>
> **La colonne des jours prenait la place de deux enfants.** `table-layout: fixed` ne lit
> les largeurs de colonnes que sur la PREMIÈRE rangée du tableau — le `thead`. La règle
> les posait sur `tbody th`, où l'algorithme ne les regarde jamais : les quatre colonnes
> se partageaient les 186 mm à parts égales, 46 mm pour « Jour » au lieu de 22, et 46 mm
> par enfant au lieu de 55. Chaque trajet revenait donc à la ligne, chaque journée gagnait
> une ligne, et la feuille débordait.
>
> Le débordement, lui, ne s'est pas annoncé : WebKit a **coupé** le vendredi en pied de
> page en affichant « Page 1 sur 1 ». Un contenu trop haut n'y produit pas une seconde
> feuille mais une troncature silencieuse — c'est inscrit en R32, parce que rien ne
> préviendra la prochaine fois.
>
> **Les arrêts n'étaient nulle part.** La feuille donnait des heures sans dire de quel
> arrêt, et surtout elle ne montrait rien des adresses réglées jour par jour : un mardi
> chez la nounou part d'un autre arrêt, et la feuille l'affichait comme les autres jours
> — le réglage le plus fin de l'application était invisible sur le seul support qu'on
> emporte. Chaque trajet nomme désormais l'arrêt qui concerne le parent (départ à
> l'aller, arrivée au retour ; l'autre bout est l'école, que la destination nomme déjà),
> et l'adresse dérogatoire vient dessous, en italique, quand il y en a une. Le domicile
> est en tête de feuille, une fois pour les trois colonnes. Les deux feuilles le font :
> celle du foyer et celle d'un enfant seul.
>
> **Ce qui a été gagné en hauteur pour le payer** : interligne à 1,2 (le poste le plus
> lourd — seize trajets à deux lignes chacun), cellules à 0,9 mm de rembourrage, et
> l'adresse dérogatoire réduite au libellé précédé d'un chevron. « Départ d'une autre
> adresse · Schweich, 3 rue de l'École » faisait deux lignes pour répéter ce que
> l'italique dit déjà : à lui seul, ce raccourci a fait passer le pire cas de 292 à
> 236 mm.
>
> **Mesuré au banc** (règles de `@media print` rejouées hors media, dans un cadre de
> 186 mm) : foyer réel de trois enfants avec dérogations, **222 mm** ; pire cas imaginable
> — trois enfants, quatre trajets par jour, une adresse dérogatoire sur chacun des quinze
> trajets de la semaine —, **236 mm** ; fiche d'un enfant seul, **139 mm**. Pour 273 mm
> utiles. Colonnes vérifiées à 22 / 54,6 / 54,6 / 54,6 mm.

*Dépend des lots 7 et 18. Lève R25 et R29, rouvre R1 avec sa cause, ouvre R32.*

---

## Lot 20 — Les réglages d'un enfant, refaits autour de sa journée (2026-08-10)

> **Fait le 2026-08-10.** Demande de l'auteur après usage : l'assistant n'était pas
> intuitif. Le diagnostic n'était pas cosmétique — l'assistant demandait au parent de
> **penser comme le stockage**.
>
> Sept écrans organisés par CHAMP : le prénom, l'adresse, l'usage du bus (quatre valeurs
> dans une liste déroulante, cinq jours), deux cases d'inscription au Dillendapp posées
> au-dessus d'une grille de repas, dix cases et dix champs d'heure, puis quinze champs
> d'adresse dépliés d'office. Une même situation réelle — « je le dépose à la maison
> relais le matin » — se déclarait à trois endroits sans rapport visible : une case, une
> heure, et un usage du bus qu'il fallait penser à réduire. Rien ne disait qu'ils
> parlaient de la même chose, et rien ne montrait ce que la réponse produisait avant le
> septième écran.
>
> **Six écrans, organisés par MOMENT de la journée** : qui est-ce, où habite-t-il, le
> matin, le midi, après la classe, la semaine obtenue. Trois questions, trois réponses,
> dans les mots d'un parent :
>
> | Moment | Réponses proposées |
> | --- | --- |
> | Le matin | en bus · je l'emmène à l'école · je l'emmène d'abord à la maison relais |
> | Le midi | à la maison · à la maison relais |
> | Après la classe | à la maison en bus · je viens l'attendre · à la maison relais |
>
> Écarts et décisions :
>
> - **`src/lib/moments.ts`, nouveau module pur et testé.** Il traduit dans les deux sens
>   entre une réponse de parent et les champs du stockage (`bus`, `repas`,
>   `dillendappDepuis`, `dillendappJusqua`, `adresses`), et ferme les contradictions.
>   C'est le seul endroit où la traduction se fait : les écrans posent une question et
>   écrivent une réponse, ils ne composent plus trois réglages pour exprimer une
>   situation. `sansAdresse` a quitté `etat.tsx` pour y vivre, et `etat.tsx` n'expose
>   plus que `definirMatin`, `definirMidi`, `definirSoir` et les deux heures — huit
>   actions de champ ont disparu.
> - **Les deux cases d'inscription au Dillendapp ne se cochent plus : elles se déduisent.**
>   `periscolaireMidi` et `periscolaireHorsMidi` restent enregistrés — `deduireInscriptions`
>   et les liens de partage les lisent — mais sont recalculés à chaque écriture depuis ce
>   que le parent a réellement décrit. Un parent pouvait être « inscrit » sans y déjeuner
>   un seul jour.
> - **La question du midi ne se pose que les jours avec cours l'après-midi.** Les autres,
>   la classe s'arrête à 11:45 : le repas n'est plus une étape de la journée mais sa fin,
>   et c'est la question du soir qui le règle — répondre à la fois « mange à la maison »
>   et « reste à la maison relais » un mardi n'a jamais eu de sens. L'écran du midi le dit
>   au lieu de laisser croire à un oubli.
> - **La grille des cinq jours ne s'affiche plus par défaut.** Une seule réponse, en
>   grand ; « Ce n'est pas pareil tous les jours » ouvre la grille. Une semaine déjà
>   irrégulière l'ouvre d'elle-même — repliée, la réponse affichée en gros mentirait
>   quatre jours sur cinq. Même principe pour les heures de présence, une pour la semaine
>   au lieu de dix champs.
> - **Les adresses dérogatoires sont réparties dans les trois moments**, repliées, et
>   proposées seulement les jours où elles veulent dire quelque chose. Elles formaient un
>   écran de quinze champs sans rapport visible avec le reste.
> - **Un aperçu sous chaque question** : les heures réelles du plan, jour par jour,
>   recalculées à la seconde où l'on répond, avec les déplacements que le plan ne couvre
>   pas. Le parent réglait à l'aveugle et n'apprenait qu'au bout de l'assistant si son
>   enfant avait un bus.
> - **Les étapes sont fixes et cliquables.** Aucune ne se dérobe plus selon les réponses
>   — la prop `total` de la coquille, qui compensait l'étape fuyante du lot 14, a
>   disparu. Un bouton grisé porte désormais la phrase qui dit ce qui manque.
> - **`/configurer` empile les mêmes trois sections.** Une seule définition, comme au
>   lot 5 : aucune dérive possible entre le réglage guidé et le réglage fin.
>   `GrilleSemaine.tsx` est remplacé par `Moments.tsx` et `ChoixSemaine.tsx`.
> - **Les listes déroulantes cèdent la place à des cartes-réponses.** Un `select` cache
>   ses options tant qu'on ne l'ouvre pas ; posées à plat avec leur conséquence écrite
>   dessous, elles se lisent d'un coup d'œil, et la cible tactile devient la carte entière.
>   Le cycle se choisit de la même façon, avec l'âge et l'école en dessous.
> - **La fiche de l'enfant parle la même langue** : une étiquette par moment qui s'écarte
>   du cas courant, au lieu d'un badge de repas répété cinq fois.
> - **Écart assumé** : `UsageBus` n'a pas été étendu. « Je l'emmène le matin » retire donc
>   aussi le retour en classe de 14:00, faute d'un modèle qui distingue les deux allers.
>   Ce n'est pas nouveau, mais la réponse est maintenant en tête d'écran : la conséquence
>   est écrite en toutes lettres sous l'option, ce qui est le seul remède sans changer le
>   modèle et le format des liens de partage.
> - **Défaut trouvé et corrigé à la mesure** : « À DÉPOSER AU DILLENDAPP · 07:00 » en
>   capitales espacées mesure 230 px insécables. Dans une colonne de 330, cela poussait
>   toute la page hors de l'écran — sans qu'aucun élément ne paraisse trop large, puisque
>   c'est la largeur *minimale* du texte qui débordait. D'où `.etiquette--souple`.
>
> Vérifié : 396 tests (dont 13 nouveaux sur `moments.ts`, qui éprouve chaque situation
> deux fois — telle que l'écran la relit et telle que `plan.ts` la calcule — et 11 sur
> l'assistant monté en entier) ; mesures DOM à 386 px sur les six étapes, sur la grille
> jour par jour dépliée, sur le bloc d'adresses ouvert, sur `/configurer` déplié et sur
> la fiche : aucun débordement, aucune cible sous 44 px hors contrôles Leaflet.
> Contraste de l'encre douce sur une carte-réponse cochée calculé sur la composition
> réelle : 5,70:1 en clair, 5,67:1 en sombre.
>
> **Réserves** : R33, R34.

*Dépend des lots 4, 5 et 14, qu'il remplace pour la partie « réglages d'un enfant ».*

---

## Évolution du 2026-08-13 — la langue avant tout le reste

**Demande** : qu'un nouvel utilisateur choisisse la langue de l'application avant de
faire quoi que ce soit d'autre.

**Ce qui se passait** : la langue était *devinée* d'après `navigator.languages` et jamais
demandée. La devinette est bonne la plupart du temps, mais quand elle est mauvaise, le
premier écran servi est l'avertissement d'indépendance — le texte le plus important du
site — dans une langue que le parent ne parle pas. Il ne l'a alors pas lu : il l'a cliqué.
Rien ne le rattrapait, la langue ne se réglant qu'une fois arrivé dans `/reglages`.

**Ce qui a été fait**

- `src/i18n/index.tsx` distingue désormais deux choses qui étaient confondues : `langue`,
  qui vaut toujours quelque chose, et `langueChoisie`, qui ne devient vrai que lorsque
  quelqu'un a tranché. Aucune nouvelle clé de stockage : la présence d'une langue *valide*
  dans `bus-beckerich.langue` fait foi. Une valeur stockée hors de `LANGUES` est traitée
  comme une absence de choix — elle ne se traduirait nulle part.
- `src/composants/ChoixLangueInitial.tsx` : cinq cartes de choix, chaque langue écrite
  dans sa propre langue, pour que le parent reconnaisse la sienne sans comprendre la
  question. La langue devinée est *signalée* (`choix--retenu`) et non présélectionnée :
  sans clic, rien n'est enregistré, faute de quoi on ne distinguerait plus une devinette
  d'un choix.
- `PileBandeaux` passe de deux bandeaux bloquants à trois, dans l'ordre langue →
  avertissement → partage. Chaque marche donne son sens à la suivante. La grammaire
  existante est conservée : un seul bloquant à la fois, les bandeaux informatifs derrière.
- **Écart assumé** : la question n'est posée qu'au premier lancement, c'est-à-dire tant
  que l'avertissement n'a pas été accepté — et non à tout parent dont la langue n'a
  jamais été choisie explicitement. Sans cette borne, la mise en production aurait
  interrogé *tous* les utilisateurs existants, qui n'ont pour la plupart jamais touché au
  réglage de langue : une question d'accueil à quelqu'un qui utilise l'application depuis
  des mois le renvoie à une case départ qu'il a franchie. La demande portait sur les
  nouveaux utilisateurs ; c'est ce qui est livré.
- `.choix-langues` dans la couche `composants` : grille en `auto-fit minmax(9rem, 1fr)`.
  Cinq cartes pleine largeur poussaient les dernières langues sous la ligne de flottaison
  d'un téléphone — le parent aurait dû faire défiler pour savoir que la sienne était
  proposée.
- Clés `choixLangue.titre` et `choixLangue.aide` dans les cinq dictionnaires.

**Vérifications** : `Bandeaux.test.tsx`, 7 tests, dont l'ordre des marches, le
non-enregistrement de la devinette, le cas d'une langue stockée inconnue et celui de
l'habitué qu'on n'interroge pas. Éprouvés par mutation dans les deux sens : neutraliser la
marche « langue » fait tomber 6 tests sur 7, retirer la borne du premier lancement en fait
tomber 1. Mesuré dans le navigateur sur le serveur de développement — cibles à 51 px
(≥ 44), deux colonnes à 375 px et une seule en dessous de 340 px, aucun retour à la ligne
jusqu'à 280 px de large, aucun débordement horizontal, carte entière visible sans
défilement. Parcours réel exercé : choix de « Português » → toute l'application bascule,
`<html lang="pt">`, avertissement servi en portugais, et la question ne se repose pas au
rechargement.

**Réserve** : R37.

---

## Évolution du 2026-08-21 — l'état coché, et la collision de noms qu'il cachait

**Demande** : lever R34, la dernière réserve qui se levait entièrement depuis le dépôt — les
autres attendent un vrai téléphone, une vraie impression ou un vrai matin d'école.

**Ce que R34 disait** : l'état coché des cartes-réponses de l'assistant tenait à
`.choix__option:has(input:checked)`. Sur un moteur sans `:has()`, la réponse retenue n'aurait
plus été signalée que par la puce du bouton radio. Le remède proposé était « un repli sur le
sélecteur frère `input:checked + .choix__texte` ».

**Ce remède ne pouvait pas marcher.** La teinte, la bordure d'accent et le trait interne sont
posés sur le `<label>`, qui est le **parent** de l'input : aucun sélecteur frère ne remonte
jusque-là. Au mieux on aurait teinté le texte, pas la carte. Le dépôt avait déjà la bonne
grammaire ailleurs — `.choix--retenu`, dans `ChoixLangueInitial.tsx` et `CommuneAlertes.tsx`,
pose sa classe en JS — et `ChoixSimple` connaissait déjà la réponse retenue puisqu'il écrit
`checked`. Il lui suffisait de l'écrire aussi en classe.

**Le défaut que la réserve a fait trouver.** `.choix` était déclaré **deux fois** dans la
couche `composants` : le conteneur du groupe de radios, et la carte cliquable de l'espace
commune. Deux blocs sans rapport, même nom, même spécificité — la seconde déclaration gagnait
en silence. Le groupe de réponses de l'assistant héritait donc d'un `padding`, d'un
`background: var(--surface)`, d'une bordure, d'un `cursor: pointer` et d'un `.choix:hover` qui
le teintait **comme s'il était lui-même cliquable**, plus un `gap` ramené à `--espace-1` au
lieu du `--espace-2` que sa propre règle demandait. Rien ne le signalait : une collision de
noms dans une même couche ne produit ni erreur, ni avertissement, ni rendu manifestement faux
— juste un composant qui obéit à la règle d'un autre.

**Ce qui a été fait**

- La famille du groupe de radios est renommée : `.choix` → `.reponses`, `.choix__option` →
  `.reponses__option`, `.choix__texte` → `.reponses__texte`, `.choix__libelle` →
  `.reponses__libelle`. Elle n'avait qu'un consommateur, `ChoixSemaine.tsx`. La famille
  « carte de choix » garde son nom : elle est employée dans deux pages et assertée par un
  test. Le préfixe `choix__` ne désigne plus deux blocs différents.
- `.reponses__option--retenu` remplace les deux règles `:has()`. **`:has()` ne figure plus
  nulle part** dans la feuille — vérifié aussi sur le CSS construit, zéro occurrence.
- Le commentaire de tête du bloc dit pourquoi l'état est une classe et non un sélecteur : le
  fond porte sur le parent de l'input, et un moteur sans `:has()` aurait effacé le signal.

**Vérifications** : `src/composants/ChoixSemaine.test.tsx`, 5 tests — la classe et `checked`
sur la seule option retenue, l'absence sur les deux autres (trois options, pour qu'une classe
posée sur toutes ne passe pas), le suivi de la valeur reçue sans état interne, la réponse
annoncée au clic, et le groupe qui n'est plus enveloppé dans une carte. Plus une assertion
dans `AssistantEnfant.test.tsx` sur le parcours réel : après avoir répondu « je l'emmène
d'abord à la maison relais », la carte est teintée, et une seule dans le groupe. 409 tests au
total. **Éprouvé par mutation** : retirer `${retenu ? …}` du JSX fait tomber exactement trois
tests, les trois qui assèrent la classe. `npm run typecheck`, `npm run lint` et `npm run build`
propres.

**Écart assumé** : la vérification visuelle n'a pas été refaite sur appareil — décision de
l'auteur, le rendu sur téléphone est couvert de son côté. Les deux points qu'un coup d'œil
aurait servi à voir sont d'ailleurs devenus statiques : la carte teintée est prouvée par
l'assertion de classe, et la disparition de la carte parasite par le test qui vérifie que le
parent d'une option est bien `.reponses` et rien d'autre. Le rendu sur moteur ancien, lui,
n'a plus d'objet.

---

## Ordre d'exécution conseillé

```
Lot 0  (amorçage)
  ├── Lot 1  (corrections immédiates)          ← à lancer en premier, effet visible
  ├── Lot 2  (système de design)               ← fondation des lots 4 à 7, 9
  │     ├── Lot 3 (modèle : adresses + périscolaire)
  │     │     ├── Lot 4 (écrans de configuration)
  │     │     │     └── Lot 5 (assistant)
  │     │     └── Lot 12 (agenda : ICS + architecture)
  │     │           └── Lot 13 (Google Agenda)
  │     ├── Lot 6 (installation PWA)
  │     └── Lot 7 (impression A4 famille)
  └── Lot 8  (Worker commune)                  ← indépendant, parallélisable
        ├── Lot 9  (interface commune)
        ├── Lot 10 (rappels de notification)
        └── Lot 11 (sécurité et nettoyage)
```

Les lots 1, 2 et 8 peuvent être lancés dans trois sessions distinctes sans se gêner.

## Vérification, à chaque lot

```bash
npm run typecheck && npm test && npm run lint
npm run dev          # inspection manuelle des écrans touchés
npm run build        # le build doit rester propre
```

Pour le serveur (lots 8, 10, 11, 21 et suivants) :

```bash
sudo docker compose up -d bus-postgres
cd serveur
DATABASE_URL_TEST=postgres://bus:bus@localhost:5433/bus npm test
npm run typecheck && npm run build
curl https://app.schoulbus.lu/api/sante      # après déploiement
```

Sans `DATABASE_URL_TEST`, les tests de stockage **se sautent** au lieu d'échouer : la
boucle courte doit rester lançable sans Docker. La CI, elle, la pose toujours — un test
qui se saute en silence ne protège rien s'il se saute partout.

`npm test` à la racine **ne couvre pas** le serveur. `npm run test:tout` lance les deux.

Aucun lot n'est considéré comme terminé tant que la fiche d'un enfant n'a pas été
réexaminée sur un viewport de 430 × 932 px, en thème clair **et** sombre.


## Lot 21 — Le serveur, réécrit et conteneurisé (2026-08-22)

> **Fait le 2026-08-22.** Premier lot du passage sur VPS Dokploy (lots 21 à 27, voir
> le plan de bascule). Objectif volontairement étroit : **un conteneur qui répond
> exactement comme le Worker, et rien de plus.** Aucune fonctionnalité nouvelle, aucun
> changement d'origine, aucune modification du chemin de publication. Mélanger la
> rupture d'hébergement avec une rupture fonctionnelle aurait rendu impossible de dire
> laquelle des deux a cassé quoi.

`worker/` (3 143 lignes, 0 dépendance, Cloudflare Workers + un espace clé-valeur)
devient `serveur/` (Hono + PostgreSQL, 3 dépendances, empaqueté par esbuild en un
fichier de 218 Ko). Le nom a changé parce que « worker » ne veut plus rien dire ici.

### Ce qui a été repris tel quel, et pourquoi

`push.js` et `rappels.js` sont copiés **sans qu'une ligne change**, avec leurs tests.
Ni l'un ni l'autre n'avait la moindre attache Cloudflare : le premier ne tient que sur
WebCrypto, le second sur du calcul de dates. Réécrire `push.js` au passage aurait été
le meilleur moyen de casser la seule brique qu'on ne peut pas déboguer à distance —
celle qui parle aux serveurs d'Apple, et qui avait déjà dû être écrite à la main parce
que la bibliothèque disponible n'implémentait que l'ancien brouillon. **Ses 28 tests,
dont le vecteur de l'annexe A de la RFC 8291, sont passés sous Node du premier coup.**

`src/lib/validation.ts`, `traductions.ts`, `calendrier.ts` et `donnees.ts` restent
partagés avec l'application, importés et non réécrits. C'est ce qui impose que le
contexte de construction Docker soit la **racine** du dépôt et non `serveur/`.

### Le schéma, et ce qu'il corrige

Huit préfixes de clés dans un seul sac deviennent cinq tables. Deux choix méritent
d'être justifiés :

- **`agent_commune` et `agent_traduction` sont deux tables, pas une table avec une
  colonne `role`.** La séparation des deux espaces reposait sur *deux* barrières
  indépendantes : deux préfixes distincts — un code de l'un n'existait littéralement
  pas là où l'autre le cherchait — et le rôle réinscrit dans le jeton signé. Une table
  unique n'en aurait laissé qu'une, suspendue à une clause `where role = …` qu'un jour
  quelqu'un oubliera. Le coût de la duplication est de quatre lignes de SQL.
- **`ephemere` porte une colonne `expire_le`, et toute lecture la filtre.** Le balayage
  périodique ne fait que récupérer la place. S'y fier pour l'expiration ferait dépendre
  une propriété de sécurité d'une tâche de fond, donc la perdrait le jour où cette
  tâche tombe.

**R4 est levée.** La limitation à cinq tentatives par quart d'heure tient désormais
dans un seul `insert … on conflict do update … returning` : PostgreSQL n'a pas la
cohérence différée du clé-valeur. Un test lance vingt tentatives simultanées et exige
que **cinq exactement** passent — c'est le cas que l'ancien mécanisme ne pouvait pas
tenir.

### Ce qui a disparu

| Supprimé | Pourquoi |
| --- | --- |
| `/notifier-lot`, `TAILLE_LOT`, `507 trop-abonnes`, le plafond d'environ 450 abonnés | Le découpage en lots n'existait que pour les 10 ms de processeur du palier gratuit. Une boucle à concurrence bornée suffit. `TAILLE_LOT = 10`, que le code déclarait « estimation prudente, NON MESURÉE », ne sera jamais mesuré : la question ne se pose plus. |
| `global_fetch_strictly_public`, `nodejs_compat`, l'erreur `1042` | Drapeaux et pannes propres à Cloudflare. |
| `cf: { cacheTtl: 0 }` | Redevient `cache: 'no-store'`. **La règle s'inverse avec le runtime** : sous Workers, `cache` n'était pas implémenté et son emploi cassait toute publication (R3, deux jours de diagnostic) ; sous Node, c'est `cf` qui n'existe pas. |
| `worker/src/runtime.test.js` | Ce test relisait les sources et **refusait** toute occurrence de `cache:`. Il gardait exactement la panne dont la correction vient d'être annulée. Sa leçon passe en commentaire là où `cache: 'no-store'` réapparaît. |
| La fenêtre cron « toutes les 15 min, 4 h–15 h UTC, lun-ven » | 44 réveils par jour pour au plus 5 créneaux utiles, et un pas de 15 minutes sur des créneaux qui n'en font pas le tour. Le planificateur réveille `rappels.js` chaque minute et le laisse décider — la logique, elle, ne bouge pas. |
| `worker/installer.sh`, `creer-agent.sh`, `reparer-vapid.sh` | Remplacés par `serveur/creer-agent.mjs` (création, liste, retrait). Le shell appelait déjà Python pour échapper du JSON : trois langages pour créer un code, c'en était deux de trop. `randomInt` remplace `$RANDOM`, dont la graine est prévisible — sur huit caractères, ce n'est pas un détail. |

### Les tests : 80 cas deviennent 109

C'était la réserve que j'avais posée sur la réécriture — jeter des tests éprouvés. Le
compte final est à l'inverse : **80 cas dans `worker/`, 109 dans `serveur/`**, dont
2 abandonnés à dessein (`runtime.test.js`, devenu faux). Ce qui change surtout, c'est
leur nature : les tests de routes ne rejouent plus contre un faux clé-valeur mais
contre la **vraie** application Hono et une **vraie** base, par `app.request()`. Ils
traversent donc le routage et les intergiciels — ce que les anciens ne pouvaient pas
faire.

Et cela a immédiatement servi : **le premier défaut du portage était dans le montage**,
pas dans la logique. Le préflight CORS de `/commune/*` n'ouvrait pas l'en-tête
`Authorization`, parce que `c.req.path` rend `/api/commune/connexion` alors que les
routes sont déclarées `/commune/connexion`. Le navigateur aurait refusé toute requête
de l'espace commune avant même de l'émettre, et aucune erreur serveur ne l'aurait
expliqué. Trouvé au premier `curl -X OPTIONS`, corrigé, et couvert par trois tests.

Second défaut du même genre, trouvé en relisant : `VITE_URL_API ?? VITE_URL_WORKER`
n'aurait **jamais** basculé sur l'ancien nom, une variable de dépôt GitHub non définie
arrivant comme chaîne vide et non comme `undefined`. Une construction faite avant le
renommage de la variable aurait produit une application sans notifications, sans espace
commune et sans Google Agenda, en silence. C'est `||`.

### Écarts assumés par rapport au texte du lot

- **`push.js` et `rappels.js` restent en `.js`, pas en `.ts`.** Le plan les annonçait
  en `.ts`. Les convertir aurait voulu dire les modifier, ce que « repris tel quel »
  exclut. `allowJs` suffit, et le typage n'aurait rien apporté à un module verrouillé
  par un vecteur de test officiel.
- **`URL_API` n'a pas de valeur par défaut `/api`**, contrairement au texte du lot.
  Vide doit continuer de vouloir dire « fonctionnalités désactivées » : c'est ce qui
  fait que l'application parent tourne intégralement sans serveur. Une origine sans
  serveur en face répondrait `/api` par la page de l'application, l'appel échouerait
  sur du HTML, et la panne se lirait « erreur réseau » au lieu de « non configuré ».
  Le `/api` se pose explicitement à la construction, au lot 23.
- **`npm test` à la racine ne couvre plus le serveur.** Il le couvrait par accident
  jusqu'ici : le vitest racine ramassait `worker/src/*.test.js`, ce qui explique le
  passage apparent de 409 à 325 cas côté application. `npm run test:tout` lance les
  deux, et la CI a un travail distinct avec un vrai PostgreSQL en service.

### Ce qui n'a PAS été fait, volontairement

Le Worker déployé continue de tourner et de servir les parents : ce lot ne change rien
en production. Sa **source** a disparu du dépôt, en revanche. En cas de besoin urgent
d'y toucher avant le lot 23, elle se récupère par `git show <commit>:worker/…` — le
dernier commit à la porter est celui qui précède ce lot.

`GITHUB_PAT`, `SECRET_NOTIFICATION`, `serveur/src/github.ts` et le workflow
`notifier.yml` sont conservés à l'identique. Ils disparaissent au lot 24, quand la
publication cessera de passer par le dépôt.

*Dépend de rien. Les lots 22 et suivants en dépendent tous.*

---

## Lot 22 — Le serveur se déploie sur la VPS, sans que le site y touche encore (2026-08-22)

> **Fait le 2026-08-22.** Deuxième lot du passage sur VPS Dokploy. Objectif étroit,
> comme le lot 21 : **faire tourner en production le conteneur écrit au lot 21, avec
> les vraies données dedans, pendant que le site continue de parler au Worker.** Aucune
> bascule d'origine (lot 23), aucun changement du chemin de publication (lot 24). Tenir
> le déploiement du serveur séparé de la bascule est ce qui rendra une panne
> ultérieure attribuable : si quelque chose casse après le lot 23, ce sera la bascule,
> parce que le serveur aura déjà été prouvé vert tout seul.

### La chaîne de livraison

Un push sur `main` fait tester le serveur — 109 cas contre un vrai PostgreSQL — puis,
si c'est vert, **construit l'image et la pousse sur GHCR** ; Dokploy la tire et la fait
tourner derrière Traefik. L'image qui servira les parents est donc, à l'octet près,
celle que les tests ont validée, et non une seconde construction faite sur une machine
où personne ne regarde. C'est tout l'intérêt de la construire dans la CI plutôt que de
laisser Dokploy la bâtir depuis les sources : la construction et la garde ne sont pas
séparées.

- **`.github/workflows/deploy.yml`** gagne un travail `image-serveur`, qui **dépend** du
  travail `serveur` — une image ne part jamais sans les tests. Il pousse
  `ghcr.io/sashimee/bus-api`, étiquetée `latest` et `sha-<commit>`. Le second tag permet
  d'épingler un redéploiement à une version précise depuis Dokploy.
- **`compose.deploiement.yaml`** (racine) est le fichier que Dokploy monte. Il **tire**
  l'image (`image:`), il ne la construit pas (`build:`) — à la différence du
  `compose.yaml` local, qui reste réservé au développement et aux tests de stockage. La
  base y est sans port exposé (réseau interne seul), les deux services en
  `restart: unless-stopped`, et le routeur Traefik n'ouvre que `app.schoulbus.lu/api` :
  la racine du domaine n'est pas à nous au lot 22, le site étant encore sur Pages.

### La documentation, répartie et non dupliquée

ADMIN.md portait déjà, depuis le lot 21, le gros du manuel d'exploitation — clés VAPID,
application OAuth, table des variables, reprise de l'état clé-valeur (le lever de R39).
Il disait explicitement ne pas décrire la mécanique Dokploy elle-même. C'est cette
pièce manquante que le lot ajoute : **`docs/deploiement.md`** — image GHCR, fichier
Compose, DNS, routage Traefik, et les trois réserves qui ne se lèvent qu'au premier
déploiement réel. Il renvoie à ADMIN.md pour la table des variables plutôt que de la
recopier : deux copies d'une même liste divergent au premier ajustement, exactement le
motif qui fait partager `validation.ts` entre l'application et le serveur.

### Ce qui a été prouvé, et où s'arrête la preuve

En local, de bout en bout : `docker build` sur le contexte racine, la pile montée
depuis l'image construite, `/api/sante` répondant `base: true`, la sonde `HEALTHCHECK`
de l'image qui passe dans le conteneur, et `docker compose config` qui résout
`compose.deploiement.yaml` — image, `DATABASE_URL`, labels Traefik, réseau externe,
dépendance `service_healthy`, absence de port sur la base.

La preuve s'arrête là où commence le vrai Dokploy. **R42** est posée pour ce qui n'a
jamais été monté par lui : la poussée GHCR effective, l'émission du certificat par
Traefik, le chemin `/api` arrivant non tronqué. **R39** (reprise clé-valeur sur vraies
données) et **R40** (adresse client derrière Traefik) restent également ouvertes — leur
outillage est complet et documenté, mais elles ne se lèvent qu'en se connectant à
`/commune` avec un vrai code et en échouant deux connexions depuis deux réseaux. Le même
premier déploiement les lève toutes les trois.

### Écarts assumés par rapport au texte du lot

- **Le manuel d'exploitation n'a pas été réécrit** : il existait déjà dans ADMIN.md.
  Le lot ajoute un document distinct pour la seule mécanique Dokploy, et se contente de
  poser des renvois croisés entre les deux. Recopier ADMIN.md dans un runbook neuf
  aurait créé la divergence qu'on cherche partout à éviter.
- **`compose.deploiement.yaml` tire l'image au lieu de la construire.** Le texte du lot
  parlait d'un conteneur ; le choix de le livrer par une image CI plutôt que par une
  construction Dokploy découle du principe « ce qui tourne est ce qui a été testé ». Le
  `compose.yaml` local, lui, construit toujours — c'est ce qui fait tourner les tests de
  stockage sans dépendre d'un registre.

*Dépend du lot 21. Les lots 23 et suivants en dépendent : ils supposent le serveur
joignable sur `app.schoulbus.lu/api`.*

---

## Lot 23 — Bascule d'origine vers `app.schoulbus.lu` (2026-08-23)

> **Fait le 2026-08-23.** Troisième lot du passage sur VPS Dokploy. Le site quitte son
> sous-domaine `github.io` et vit désormais sous la **racine d'`app.schoulbus.lu`**, à la
> **même origine que l'API**. C'est la bascule que les lots précédents préparaient : le
> commentaire de `http.ts` l'annonçait (« le jour où le site et l'API partagent l'origine
> app.schoulbus.lu »), celui d'`index.ts` en dépendait (« le site et l'API partagent une
> seule origine, ce qui fait disparaître le CORS »).

### Un conteneur de plus, pas un serveur de plus

Le site est servi par un conteneur **`bus-site`** (Caddy) distinct de `bus-api`, et non
par le serveur Hono lui-même. Le choix — deux conteneurs à une origine plutôt qu'un
processus qui sert tout — garde la séparation que le dépôt a déjà entre les deux
chaînes : le site et le serveur se construisent, se testent et se redéploient
indépendamment, chacun derrière ses propres tests. Coupler leurs constructions aurait
fait reconstruire le serveur à chaque retouche de bouton, et inversement.

Traefik répartit l'origine unique par priorité : `PathPrefix(/api)` (priorité 100) va au
serveur, tout le reste (priorité 1) au site. La priorité est posée explicitement et non
laissée à la longueur de règle : sur un chemin aussi sensible, on ne départage pas au
hasard.

### Ce que la même origine fait tomber, et resserre

- **Le CORS n'a plus d'objet.** L'intergiciel reste en place — inerte tant que le site
  et l'API se répondent depuis `app.schoulbus.lu` —, le temps que Pages, cross-origin,
  serve encore de repli. `ORIGINES_AUTORISEES` liste donc les **deux** origines pendant
  la transition.
- **La CSP se resserre.** Servie par un vrai serveur (Caddy), et non plus par une page
  Pages sans en-têtes, elle gagne ce que la balise `<meta>` ne peut pas porter :
  `X-Frame-Options: DENY` en en-tête HTTP — l'équivalent de `frame-ancestors`, que la
  spécification **ignore** en `<meta>`. La CSP complète, elle, reste en `<meta>`, à un
  seul endroit : deux politiques (en-tête + balise) s'appliqueraient par intersection, et
  une carte cassée serait vite arrivée. Ajoutés aussi : `X-Content-Type-Options` et
  `Referrer-Policy`.

### La construction, figée dans l'image

`Dockerfile.site` construit le site avec `BASE_PATH=/` (la racine du domaine, non plus le
préfixe projet de Pages) et `VITE_URL_API=https://app.schoulbus.lu/api`. Vite **inline**
ces valeurs dans le JavaScript : l'image est donc figée sur son origine, et les passer en
variables d'exécution du compose n'aurait aucun effet — d'où des `ARG`, pas des `env`.
L'URL de l'API est déclarée en **absolu** et non en `/api` relatif : la CSP engendrée la
nomme comme une source, et un chemin nu n'est pas une source CSP valide.

### La transition, filet gardé

Le déploiement GitHub Pages **reste vivant** : le lot ne le touche pas. Il sert de repli
le temps que le DNS bascule et que le nouveau site soit vérifié. Les deux sites pointent
alors vers la même API — celui de la VPS en même origine, celui de Pages en cross-origin
autorisé. Retirer Pages est un geste ultérieur, une fois `app.schoulbus.lu` éprouvé.

### Ce qui a été prouvé, et où s'arrête la preuve

En local : `docker build -f Dockerfile.site`, le conteneur monté, la racine qui rend un
200 avec les trois en-têtes, une route profonde (`/agenda`) qui retombe sur `index.html`
au lieu d'un 404, les actifs servis depuis la racine, la CSP portant `app.schoulbus.lu/api`
et `docker compose config` qui résout les deux routeurs. **R43** est posée pour ce qui ne
se voit qu'au premier déploiement réel : le partage d'origine à travers Traefik,
l'installation de la PWA depuis la nouvelle origine (`start_url`/`scope` passés à `/`), et
le fait qu'une PWA déjà installée depuis Pages ne migre pas seule — c'est une autre
origine, un autre service worker.

### Écarts assumés par rapport au texte du lot

- **Aucun code d'application changé.** La bascule tient entièrement dans la construction
  (`BASE_PATH`, `VITE_URL_API`) et l'hébergement (Caddy, Traefik). `config.ts` et la CSP
  d'`index.html` supportaient déjà une origine paramétrable depuis les lots précédents.
- **`connect-src` n'est pas réduit à `'self'` seul.** L'idéal annoncé par `index.ts` est
  atteint en pratique — l'origine de l'API `app.schoulbus.lu/api` **est** `'self'` —, mais
  la liste porte encore l'URL absolue de l'API (redondante avec `'self'`, sans danger) et
  les origines de GitHub et Google, nécessaires à `/admin` et à l'agenda. Réduire à
  `'self'` seul demanderait de router aussi ces appels par la VPS, ce qui n'est pas
  l'objet de ce lot.

*Dépend des lots 21 et 22 (le serveur doit répondre sous `app.schoulbus.lu/api`). Le lot
24 en dépend : il retire la publication par GitHub, une fois l'origine propre en place.*

---

## Lot 24 — Comptes utilisateurs et rôles (2026-08-23)

> **Fait le 2026-08-23.** L'authentification par compte est en place — serveur ET
> interface web (`/connexion`, « mon compte », `/reinitialiser`, gestion des comptes sous
> la capacité `comptes`), en cinq langues. L'opérateur amorce le premier administrateur
> par la CLI, les suivants se gèrent depuis l'application. La migration des données et le
> retrait de `/admin` restent le lot 25. Ce lot est né en cours de route :
> retirer l'espace `/admin` (qui publiait par un jeton GitHub personnel) laissait sans
> foyer l'édition des **corrections d'arrêts** et des **crédits**, que `/commune` ne
> savait pas faire. Plutôt que de bricoler deux barrières de plus, on pose une vraie
> **authentification par compte**, à rôles, sur laquelle tout le reste s'appuiera.
>
> **Réordonnancement du plan.** Ce lot s'insère à 24 ; les suivants glissent d'un rang :
> l'ancien lot 24 (publication en base) devient **25**, le journal de livraison des
> rappels **26**, la mesure auto-hébergée **27–28**. Les commentaires du code qui
> pointaient « lot 24 » pour la fin de la publication GitHub sont corrigés en « lot 25 ».

### Pourquoi des comptes, alors que `/commune` est déjà une connexion à rôle

`/commune` **est** déjà une connexion à rôle : code personnel → empreinte SHA-256
comparée à temps constant → jeton de session signé portant un `role`, revérifié à chaque
route, avec deux tables (`agent_commune`, `agent_traduction`) aux espaces de codes
disjoints. Ce qui manque n'est pas l'idée, c'est la **généralité** : deux rôles figés,
codés en dur, et aucun moyen de dire « cette personne peut corriger un arrêt mais pas
annuler un bus ». Le lot remplace les deux rôles figés par un modèle **capacités par
utilisateur**, et le code personnel par un **compte courriel + mot de passe** — un vrai
identifiant réutilisable, avec vérification d'adresse et réinitialisation.

### Décisions prises (2026-08-23)

| Sujet | Décision |
| --- | --- |
| Identifiant | **Courriel + mot de passe.** |
| Hachage | **argon2id**, paquet `@node-rs/argon2` (binaires musl préconstruits — s'installe dans `node:22-alpine` sans chaîne de compilation ; le paquet `argon2` de référence, lui, compile depuis les sources). |
| Courriels | **Vérification d'adresse ET liens de réinitialisation**, envoyés en **SMTP** (`nodemailer`) vers le **relai courriel** déjà présent en conteneur sur la VPS — hôte/port/expéditeur par variables d'environnement, le relai fait la livraison réelle. |
| Création de comptes | **CLI `creer-utilisateur.mjs`** amorce le premier administrateur (capacité `comptes`) ; ensuite, toute personne portant `comptes` crée, modifie et désactive les comptes depuis l'application. Pas d'inscription ouverte. |
| Capacités | Un compte porte un sous-ensemble de `{ perturbations, arrets, horaires, traductions, credits, comptes }`. Le jeton de session porte l'ensemble ; chaque route d'édition exige UNE capacité. Cela subsume les deux rôles actuels (`commune` = perturbations + horaires ; `traduction` = traductions). |
| Optionnel | Comme `SECRET_SESSION` aujourd'hui : sans configuration, l'espace de connexion répond « non configuré » et **l'application parent tourne intégralement sans**. Aucun parent ne se connecte jamais. |
| Session | Réemploi de `crypto.ts` (`signerJeton`/`verifierJeton`), le jeton portant désormais l'identifiant du compte et ses capacités. |

### Réglages retenus (2026-08-23, « tout ce qui a été suggéré »)

- **Vérification d'adresse obligatoire pour agir.** Un compte créé dans l'application
  reçoit un courriel de vérification et **ne peut pas se connecter tant qu'il n'a pas
  vérifié**. Le premier administrateur, créé par la CLI, naît **déjà vérifié** :
  l'opérateur en répond.
- **Session 8 h**, comme `/commune`. Une case « rester connecté » à la connexion la
  porte à **30 jours** — le seul réglage qui change la durée signée dans le jeton.
- **Mot de passe : 10 caractères au minimum.** argon2id fait le reste ; on ne réclame
  ni chiffre ni majuscule (une règle de composition pousse aux mots de passe faibles et
  notés sur un papier), seulement de la longueur.
- **Champs du compte** : `courriel`, `nom`, `capacites`, `service` (facultatif),
  `langue` (des courriels qu'il reçoit, `fr` par défaut), `courriel_verifie`,
  `desactive`. Rien de plus — ni téléphone, ni donnée qui ne serve pas.
- **Pas de 2FA.** La limitation de débit partagée avec `/commune` suffit à l'échelle
  d'une poignée d'agents ; une seconde barrière serait du zèle non mesuré.
- **Activation par `SECRET_SESSION`**, déjà là : c'est le secret qui signe les jetons.
  Sans lui, l'espace comptes répond « non configuré », comme `/commune`. Le SMTP a ses
  propres variables (`SMTP_HOTE`, `SMTP_PORT`, `SMTP_EXPEDITEUR`), et sans elles la
  vérification et la réinitialisation sont refusées avec un motif clair plutôt
  qu'échouées en silence.
- **Les codes `/commune` actuels ne sont pas migrés** : les deux systèmes cohabitent
  jusqu'au lot 25, qui repliera l'un sur l'autre.

### Schéma (migration 002)

- **`utilisateur`** — `courriel` (clé), `mot_de_passe_hash` (argon2id), `nom`,
  `capacites` (jsonb, liste), `service` (texte, défaut vide), `langue` (texte, défaut
  `fr`), `courriel_verifie` (bool), `desactive` (bool), `cree_le`, `dernier_acces`. Le
  mot de passe n'est jamais stocké en clair, jamais journalisé.
- Les **jetons de vérification et de réinitialisation** ne prennent pas de table : ils
  vivent dans `ephemere`, avec `expire_le` — vérification 24 h, réinitialisation 1 h.
  C'est exactement ce que la table sait faire, et l'expiration y est filtrée à la
  lecture, jamais laissée à un balayage.

### Serveur

- `comptes/argon.ts` — envelopper `@node-rs/argon2` (hachage, vérification à temps
  constant), rien de plus.
- `courriel.ts` — un seul point d'envoi SMTP, testable à sec (un transport de journal
  en test, le vrai relai en production). C'est la SEULE brique qui parle à l'extérieur ;
  elle s'isole comme `push.js` s'isole.
- Routes `/comptes/*` : `connexion`, `deconnexion`, `moi`, `mot-de-passe-oublie`,
  `reinitialiser`, `verifier-courriel`, `changer-mot-de-passe`, et — sous la capacité
  `comptes` — `lister`, `creer`, `modifier`, `desactiver`.
- `exigerCapacite(c, capacite)` remplace `exigerAgent(c, role)`, sur le même modèle
  d'appel-en-tête-de-route (pas d'intergiciel dont la portée dépend de l'ordre).
- Limitation de débit : la connexion et la demande de réinitialisation passent par le
  même seau que `/commune` aujourd'hui — sinon la connexion la plus récente devient la
  porte de toutes les autres.

### Ce qui N'est PAS dans ce lot

La **migration des données** en base (perturbations, traductions, horaires, crédits,
corrections d'arrêts) et le retrait de `/admin` et du chemin GitHub restent le **lot
25**. Ce lot-ci ne fait que poser l'authentification : à sa fin, on peut créer un
compte, se connecter, vérifier son adresse, réinitialiser son mot de passe et gérer les
comptes — mais rien de neuf ne se publie encore par ce biais. Les deux espaces `/commune`
et `/traductions` continuent de fonctionner comme avant, en parallèle, jusqu'à ce que le
lot 25 les replie sur les capacités.

### Ce qui a été construit et prouvé

- Migration `002-comptes.sql` (table `utilisateur`), argon2id (`@node-rs/argon2`),
  `courriel.ts` (SMTP nodemailer, mode capture en test), routes `/comptes/*`, la
  capacité lue **en base** à chaque requête (désactiver prend effet tout de suite), le
  garde-fou anti-auto-verrouillage, et la CLI `creer-utilisateur.mjs`.
- **25 tests de bout en bout** contre une vraie base (134 cas au total côté serveur, vs
  109) : connexion, refus indistinct inconnu/mauvais/désactivé, non-vérifié qui se dit,
  débit, activation par lien, réinitialisation à usage unique, capacité accordée sans
  reconnexion, auto-verrouillage refusé.
- **Interface web** : `lib/comptes.ts` (session en `sessionStorage`, ou `localStorage`
  si « rester connecté »), pages `Connexion`, `Reinitialiser`, `Comptes` (gestion), et
  49 clés i18n × 5 langues — la parité des dictionnaires est vérifiée par le test
  existant. Aucune chaîne en dur, aucune couleur hors jetons : les classes réemployées
  sont celles du reste du site (`case`, `rangee`, `carte`, `champ`, `etiquette`).
- **La vérification, non la seule vérification** : l'activation d'un compte pose le mot
  de passe ET vérifie l'adresse d'un même geste — ouvrir le lien reçu par courriel
  prouve le contrôle de la boîte. Il n'y a donc pas de courriel de vérification distinct.

### Réserves

- **R44 — le relai courriel n'a jamais reçu d'envoi depuis ce serveur.** En test, le
  courriel est en mode capture ; aucun vrai SMTP n'a été devant. À éprouver au premier
  déploiement : une inscription réelle, un courriel de vérification reçu, un lien qui
  active. Sans relai configuré, la création de compte et la réinitialisation sont
  refusées avec un motif clair — ce n'est donc pas une panne silencieuse, mais ce n'est
  pas non plus une preuve que ça marche.
- ~~argon2id via `@node-rs/argon2` dans l'image musl~~ **Levée le 2026-08-23** :
  l'image `alpine` construite, le binaire chargé, un `hash`+`verify` passé dedans, et
  `/api/sante` répond `"comptes": true`.

*Dépend des lots 21–23 (serveur en base, sous `app.schoulbus.lu`, courriel relayé sur
le réseau interne). Le lot 25 en dépend : c'est lui qui gréera les capacités.*

---

## Lot 25 — Publication en base, sans détour par GitHub (2026-08-24)

> **Fait le 2026-08-24** (commencé le 2026-08-23). Le plus gros lot du passage : perturbations, corrections
> d'arrêts, surcouche de traduction, horaires et crédits quittent les fichiers du dépôt
> pour la base, publiés par l'espace agents (aux capacités du lot 24) et servis par
> l'API ; `/admin` et tout le chemin GitHub (`github.ts`, `notifier.ts`, `notifier.yml`,
> `GITHUB_PAT`, `SECRET_NOTIFICATION`) disparaissent. Parce qu'il touche le moteur
> testé — le plan est embarqué et lu synchroniquement par 30 fichiers —, il est mené en
> **tranches**, chacune compilant et testée, plutôt qu'en une seule rupture.

### Le découpage retenu

Chaque nature de donnée bascule **de bout en bout** (serveur qui publie, endpoint qui
sert, client qui lit) en une fois : à moitié migrée, une perturbation publiée
n'atteindrait plus les parents. Ordre :

1. **Fondation serveur (fait).** Migration `003-publication.sql` (`perturbation`,
   `correction_arret`, `document`), stockage `publications.ts`, et les lectures
   publiques `GET /urgences · /traductions · /horaires · /credits`, qui **retombent sur
   les données embarquées** quand la base est vide — le site a toujours un plan et des
   crédits, même neuf. Additif : rien ne s'en sert encore, la publication passe encore
   par GitHub. **10 tests** (144 au total côté serveur).
2. **Perturbations (fait).** Publication → base + notification dans la MÊME opération
   (`enregistrerPerturbation` dit si l'identifiant est neuf, ce qui décide s'il faut
   notifier) ; `rappels-envoi` lit la table au lieu de refaire un aller-retour HTTP vers
   le site ; le client lit `/urgences` (repli sur le fichier embarqué sans serveur), le
   service worker le met en cache. `notifier.yml`, la route `/notifier` et
   `SECRET_NOTIFICATION` retirés — l'envoi n'a plus besoin d'un détour par GitHub Actions.
   4 tests de bout en bout (147 au total côté serveur).
3. **Surcouche de traduction (fait).** Publication fusionnée dans le document
   `traductions` sous un **verrou consultatif de transaction** — deux traducteurs
   connectés en même temps ne se recouvrent pas, ce que GitHub assurait par sa
   concurrence optimiste (`sha`, 409). Le client lit `/traductions`. La route de
   publication (`/traductions/publier`) ne change pas de chemin : seul son fond bascule
   du dépôt à la base. 148 tests serveur.
4. **Crédits (fait, sauf l'éditeur).** Premier usage de la garde par CAPACITÉ (lot 24) :
   `POST /edition/credits` exige la capacité `credits`, revalide par `relireCredits`
   partagé, écrit le document `credits`. Le client (`Credits.tsx`) lit `/credits` avec
   repli sur le bundle — une page de crédits doit s'afficher en toutes circonstances.
   L'ÉDITEUR de crédits (jusqu'ici dans `/admin`) est construit à la tranche 7, avec le
   retrait de `/admin` ; d'ici là l'endpoint répond au `curl` et 3 tests le couvrent
   (151 au total côté serveur).
5. **Horaires (fait) — la tranche délicate.** Le plan est servi par l'API et **amorcé au
   démarrage** : `donnees.plan` devient un binding `let` remplaçable, échangé AVANT le
   montage de React par `initialiserHoraires()`. Sûr parce qu'AUCUN module ne lit `plan`
   au chargement (vérifié) — toutes les lectures sont postérieures au montage —, et parce
   qu'un plan n'est adopté que s'il passe `validerPlan` : un plan malformé ne remplace
   jamais un plan valide. Cache local pour le hors-ligne, fichier embarqué pour repli
   ultime. Le plan changeant une fois l'an, on ne vise pas la propagation en direct : un
   nouveau plan est adopté à la prochaine ouverture. La publication (`/commune/horaires`,
   code-login inchangé) écrit le document `horaires` versionné, plus aucune écriture
   GitHub. 5 tests d'amorçage (dont le refus d'un plan malformé), 2 serveur (153/330).
   `github.ts` n'est plus utilisé que par `/sante` ; il tombe à la tranche 7.
6. **Corrections d'arrêts (fait, sauf l'éditeur).** `POST /edition/corrections` et
   `DELETE /edition/corrections/:arret`, sous la capacité `arrets` — refuge de l'ancien
   `/admin`. Revalidées par les mêmes garde-fous que le navigateur (un arrêt ne se
   déplace pas hors du Luxembourg), l'auteur étant celui de la session. La LECTURE était
   déjà faite en tranche 2 (les corrections viennent de `/urgences`). L'éditeur vient en
   tranche 7. 4 tests (157 serveur).
7. Consolidation, en deux temps :
   - **7a (fait) — le SERVEUR quitte GitHub.** `serveur/src/github.ts` supprimé (plus
     personne ne l'importait : perturbations, traductions, horaires et crédits écrivent
     tous en base) ; `/sante` perd le champ `depot` ; la santé `commune` ne dépend plus
     que de `SECRET_SESSION` ; `GITHUB_PAT` retiré du compose et d'ADMIN.md. Le serveur
     n'écrit plus une ligne dans le dépôt.
   - **7b (fait) — le CLIENT quitte GitHub.** `/admin` retiré (page + `src/lib/github.ts`
     client + `AdminArrets` + `AdminPlan`). Nouvelle page `/edition`, gardée par capacité,
     à onglets : éditeur de **crédits** (l'`EditeurCredits` existant, déjà découplé, ne
     restait couplé que par un type) et éditeur de **corrections d'arrêts** (`EditeurArrets`,
     repris de la carte Leaflet d'`AdminArrets` mais publiant par l'API sous la capacité
     `arrets`, la correction définitive dans `arrets.json` — un changement de données de
     référence — n'ayant plus sa place dans une page web). `api.github.com` retiré de la
     CSP ; l'OAuth GitHub serveur (`authentification-github.ts`, champ `oauth` de `/sante`,
     `GITHUB_CLIENT_ID/SECRET`) supprimé ; les constantes GitHub de `config.ts` avec.
     Lot 25 **complet**. Restait, hors lot 25, à replier `/commune` et `/traductions`
     (code personnel) sur les capacités — **fait le 2026-08-24**, voir la section
     « Consolidation » ci-dessous.

### Réserves attendues

- La reprise des fichiers actuels (`urgences.json`, `traductions.json`, `credits.json`,
  le plan) vers la base est une étape de déploiement : sans elle, les corrections de
  traduction publiées et les crédits repartent de l'embarqué. À documenter avec la
  bascule.

*Dépend des lots 21–24. Les sept tranches sont faites : plus aucune écriture dans le dépôt, ni serveur ni client. Le repli de `/commune`/`/traductions` sur les capacités, laissé hors lot, est fait — voir « Consolidation » ci-dessous.*

## Consolidation — une seule porte, un seul compte (2026-08-24)

> **Fait le 2026-08-24.** Repli des deux derniers espaces à **code personnel** — `/commune`
> (perturbations, horaires) et `/traductions` — sur les **comptes à capacités** du lot 24.
> Il ne reste qu'un seul mécanisme d'authentification, là où trois cohabitaient (jeton
> GitHub d'`/admin` retiré au lot 25, puis les deux codes personnels ici).

### Ce qui bascule

Chaque publication qui passait par un code personnel passe désormais par une **capacité**,
revérifiée en base à chaque requête :

- `POST /commune/perturbations` + `DELETE …/:id` → `/edition/perturbations` (capacité `perturbations`).
- `POST /commune/horaires` → `/edition/horaires` (capacité `horaires`).
- `POST /traductions/publier` → `/edition/traductions` (capacité `traductions`).
- `GET /commune/journal` → `/edition/journal` (toute session connectée : lire qui a publié
  quoi n'est pas un droit d'édition).

Le rôle figé (`commune` = perturbations + horaires ; `traductions` = traductions) est ainsi
**subsumé** par le modèle de capacités — un compte reçoit exactement ce qu'on lui accorde.
La séparation qui tenait à *deux tables et un rôle dans le jeton* tient maintenant à la
capacité : un traducteur (capacité `traductions` seule) ne peut toujours pas annuler un bus.

### Ce qui disparaît

- **Serveur** : `routes/commune.ts` (les deux `monter…`), `stockage/agents.ts`,
  `creer-agent.mjs`, la connexion par code, le type `Role`, le champ `commune` de `/sante`
  (redondant avec `comptes`). Migration `004-retrait-agents.sql` : `drop table agent_commune,
  agent_traduction` — départ à neuf, tables vides en production.
- **Client** : `lib/commune.ts` (code + session), les pages `Commune.tsx`, `CommuneAlertes.tsx`,
  `CommuneHoraires.tsx`, `Traductions.tsx`. Les éditeurs deviennent des **onglets de
  `/edition`** (`EditeurPerturbations`, `EditeurHoraires`, `EditeurTraductions`), chacun
  visible seulement à qui porte la capacité. `/commune`, `/commune/alertes`,
  `/commune/horaires` et `/traductions` **redirigent** vers `/edition` (bookmarks préservés).
- Nouveau `lib/edition.ts` : porte un `SessionCompte` déjà obtenu vers `/edition/*`, sans
  connaître ni code ni stockage de session.

### Ce qui a été prouvé, et où s'arrête la preuve

Vérifié : app 330 tests + typecheck + build ; serveur 144 tests (dont les propriétés de
sécurité portées de l'ancien `commune.test.ts` : bon droit passe, mauvais droit 403, sans
session 401, charge revalidée, auteur = session) + typecheck + build contre une vraie base.
La migration 004 est jouée par le banc de test (schéma neuf : tables créées puis droppées).

**Où s'arrête la preuve** : voir R45 — aucun vrai compte n'a encore publié depuis le serveur
déployé, et la migration 004 n'a tourné que sur des schémas de test. `importer-kv.mjs` ne
reprend plus les codes d'agents (tables supprimées) — il faut recréer chaque agent en
compte ; c'est documenté (ADMIN.md) mais pas exercé sur de vraies données.

## Lot 26 — Le journal des rappels (2026-08-24)

> **Fait le 2026-08-24.** Les rappels de perturbation partaient sans laisser de trace : le
> planificateur envoyait, écrivait dans `console.log`, et rien ne survivait au conteneur.
> Un rappel manqué ou parti au mauvais créneau ne se voyait donc nulle part. Le lot lui
> donne un **journal de livraison**, lisible avec le reste.

### Ce qui a été fait

- **Serveur** : `envoyerRappels` inscrit chaque envoi dans la table `journal` (celle des
  publications), sous l'auteur `système` / service `rappels`, action `rappel`, avec le
  détail « `id` · rappel n/N · créneau · X envoyée(s), Y échec(s) ». Écrit **après** l'état
  du rappel, pour ne journaliser que ce qui est réellement parti. La fonction prend
  désormais une horloge injectable (`maintenant`), ce qui la rend testable au créneau
  près.
- **Client** : un onglet **Journal** dans `/edition`, ouvert à **toute session** sans
  capacité (voir n'est pas éditer). Il rouvre la vue du journal, que la consolidation avait
  emportée avec `Commune.tsx`, et y montre du même coup les rappels automatiques. Chaque
  action porte un libellé traduit ; une action inconnue retombe sur son identifiant brut.

### Ce qui a été prouvé, et où s'arrête la preuve

Vérifié : app 334 tests (dont 4 sur l'onglet Journal), serveur 148 tests (dont 4 sur le
journal de livraison : envoi simulé, un jour d'école réel, avance de l'état, pas de double
rappel à la même minute, rien pour une simple information). **Où s'arrête la preuve** : R7
reste ouverte — la chaîne n'a toujours pas tourné contre de vrais téléphones un matin
d'école ; ce que le lot change, c'est qu'on pourra désormais le VOIR quand elle le fera.

*Reste, dans le fil des lots, la mesure auto-hébergée (lots 27-28) — faite le même jour, voir ci-dessous.*

## Lots 27-28 — La mesure de fréquentation, ramenée à la maison (2026-08-24)

> **Fait le 2026-08-24.** Le compteur de visites était GoatCounter, un service tiers : son
> script venait d'une CDN, ses relevés partaient vers un sous-domaine externe (et, deux
> jours durant, n'y arrivaient pas — R35). Les lots 27-28 le remplacent par une mesure
> **auto-hébergée** sur `bus-api`, ce qui aligne le compteur sur le premier principe du
> projet : plus rien ne quitte l'appareil vers un tiers.

### La décision de portée

Deux formes étaient possibles (R36) : la page d'arrivée seule, ou un relevé par écran. La
seconde aurait dit quels écrans un foyer parcourt, et à quel rythme — trop, pour une
application qui promet que rien de l'usage ne s'apprend d'elle. **Décision : page d'arrivée
seule**, comme GoatCounter, mais sans le tiers. R36 est ainsi tranchée, pas seulement
déplacée.

### Ce qui a été fait

- **Serveur** : table `mesure (jour, chemin, vues)` (migration 005), incrémentée en un
  énoncé atomique. `POST /mesure` **public** reçoit le relevé ; le chemin est **normalisé
  côté serveur** contre une liste blanche d'écrans — `/enfant/8f3a…` devient `/enfant`, une
  requête ou un fragment tombent, l'inconnu devient `autre`. Rien de personnel ne peut donc
  s'inscrire, même envoyé par un client trafiqué, et aucune IP, aucun cookie, aucun
  horodatage plus fin que le jour n'est gardé. `GET /edition/mesure` (session, comme le
  journal) sert l'agrégat. Purge à 400 jours par le balayeur.
- **Client** : `src/lib/mesure.ts` dépose un relevé au démarrage par `sendBeacon` vers
  `URL_API` (repli `fetch keepalive`), une seule fois, et seulement si un serveur est
  configuré. Le script GoatCounter et **toute origine tierce disparaissent de la CSP**
  (`script-src 'self'`, plus de `gc.zgo.at` ni de `bus.goatcounter.com`). Un onglet
  **Fréquentation** dans `/edition` montre total, répartition par écran et courbe par jour
  — sans graphique (une barre proportionnelle demanderait une largeur en ligne, interdite).
  Le texte « Données » des 5 langues dit désormais « notre propre serveur », plus GoatCounter.

### Ce qui a été prouvé, et où s'arrête la preuve

Vérifié : app 337 tests (dont 3 sur l'onglet), serveur 151 tests (dont 3 sur `/mesure` :
comptage agrégé, **normalisation qui écarte un identifiant d'enfant**, lecture gardée par
session). CSP du build inspectée : plus aucune origine de mesure. **Où s'arrête la preuve** :
R47 — le compteur public reste approximatif (gonflable à la main, comme l'était GoatCounter) ;
c'est un ordre de grandeur, pas une métrique de confiance, et on l'assume.

*Tous les lots planifiés (0 à 28) sont faits.*

---

## Rentrée 2026/2027 — la brochure relue, les horaires par cycle (2026-09-08)

La commune a publié *D'Suebelmouk — Schoulorganisatioun 2026 | 2027* (35 pages, les bus
aux pages 14 à 18). Les deux documents ont été comparés page à page après extraction du
texte, et non lus en diagonale.

### Les horaires de bus n'ont pas changé

Les sept tableaux — Aller 1, 2, 3, Aller Dillendapp, Retour 1, 2, Retour Dillendapp —
sont **identiques caractère pour caractère** à ceux de 2025/2026. Pas une heure, pas un
arrêt, pas un ordre de passage. Seule la pagination bouge (12–16 → 14–18). Le fichier
`plan-2025-2026.json` garde donc ses horaires tels quels, et le PDF joint à l'application
reste l'extrait de l'an dernier : il dit la même chose, pour 27 Mo de moins.

Une seule différence de fond sur ces pages : la mention « (hall sportif le vendredi) » du
bus Dillendapp de midi a disparu. Voir R52.

### Ce qui a changé autour

- **Le nouveau campus, janvier 2027.** Horaires et itinéraires seront adaptés. `valideAu`
  passe à `2026-12-18`. Voir R51.
- **Les horaires de cours étaient faux pour tous les cycles qui prennent le bus.** La
  brochure les publie site par site — Noerdange 08:00–12:05, Elvange 08:00–12:10,
  Beckerich 07:55–12:00, Oberpallen 08:00–11:50 — alors que le plan n'en portait qu'un
  seul jeu, `07:55–11:45`, qui est celui du **précoce**, précisément le seul cycle sans
  transport scolaire. L'application annonçait donc à chaque parent une fin de cours qui
  n'était pas la sienne, sur la page Plan comme dans la question du midi, et s'en servait
  comme plancher de récupération à la maison relais les mardis et jeudis. `horairesEcole`
  sépare désormais les **jours** (communs : pas de cours les mardis et jeudis après-midi)
  des **heures** (par cycle), `validerPlan()` exige les cinq cycles et refuse une fin de
  cours antérieure à son début, et la page Plan affiche un tableau cycle par cycle.
- **Les vacances 2026/2027 et la rentrée du 15 septembre** correspondent exactement à
  `vacances-lu.json` : rien à corriger.

### Ce qui a été prouvé, et où s'arrête la preuve

Vérifié : 346 tests d'application (dont trois nouveaux sur la validation des horaires par
cycle), `typecheck`, `lint` et `build` ; côté serveur, `typecheck`, `build` et 68 tests.
**Où s'arrête la preuve** : les 83 tests de stockage du serveur se sont sautés faute de
Postgres — Docker n'est pas lançable dans cette session. Rien n'a été déployé, et R53
reste ouverte sur l'état du plan publié en base.


---

## Le lendemain de la brochure — ce que l'usage réel réclamait (2026-09-08)

Cinq chantiers, dans l'ordre où ils comptent pour un parent. Aucun n'ajoute de
fonctionnalité : ils ferment des pannes silencieuses et allègent ce qu'on télécharge.

### La correction des horaires par cycle est livrée

Elle attendait dans l'arbre de travail, non commitée. En production, chaque parent
lisait encore la fin de cours du précoce. C'est le premier commit du lot.

### Une exception au rendu ne laisse plus un écran blanc

`src/composants/BarriereErreur.tsx` — la seule classe React du dépôt, parce que React
n'offre ce mécanisme qu'aux classes. Elle est doublée : une barrière autour de tout,
dans `main.tsx`, qui rattrape un fournisseur qui échoue au montage ; une autour du
contenu de page dans `App.tsx`, remise à zéro à chaque changement d'adresse, pour que
l'en-tête et la navigation survivent à la panne d'un seul écran.

Elle s'affiche hors du fournisseur de traduction — qui peut être la cause de la panne —
et lit donc le dictionnaire compilé directement, dans la langue enregistrée par le
parent. Elle propose : recharger, voir les horaires officiels (lien ordinaire, le
routeur fait partie de ce qui vient de tomber), déplier le message technique, et en
dernier recours effacer les données locales — geste que `/reglages` porte déjà, mais
`/reglages` se rend à partir du foyer et tombe avec lui.

### L'horloge de l'écran « Aujourd'hui » bat toute seule

`new Date()` au fil du rendu donnait une heure juste au premier affichage et fausse
ensuite. L'écran s'en accommodait **par accident** : la relecture des perturbations,
toutes les dix minutes, le rafraîchissait au passage. Autrement dit le compte à rebours
dépendait d'un `fetch` — donc s'arrêtait hors ligne, et pouvait désigner en grand un bus
déjà parti. `src/horloge.ts` bat désormais au changement de minute, et se rattrape au
retour au premier plan : iOS gèle les minuteries d'un onglet en arrière-plan, et une
application installée passe son temps en arrière-plan.

### Les règles de l'accueil ont quitté la page

`heureUtile`, `etapesDuJour`, `restantes`, le calcul du délai avant de sortir : des
règles, pas de l'affichage, et la carte du dépôt les interdit dans une page. Elles sont
dans `src/lib/aujourdhui.ts`, avec neuf tests. Dans la foulée, les trois écrans qu'un
parent utilise vraiment — aujourd'hui, la semaine, la configuration — ont enfin les
leurs : le moteur était couvert, la couche qui le donne à lire ne l'était pas.

### Ce qu'un parent télécharge a fondu d'un tiers

Paquet principal : **728 → 488 ko (224 → 147 ko compressés)**.

- Les écrans de publication — six éditeurs, comptes, connexion, quelques milliers de
  lignes pour une poignée de personnes — passent par `React.lazy`.
- Les cinq dictionnaires étaient tous embarqués : un parent francophone téléchargeait
  l'allemand, le luxembourgeois, le portugais et l'anglais. Le français reste dans le
  paquet (langue de référence et repli de toutes les autres) ; les quatre autres sont
  chargées à la demande. `main.tsx` attend celle du parent avant le premier rendu, sans
  quoi la page s'afficherait en français avant de se retraduire sous ses yeux.
- L'éditeur de traductions, lui, a besoin des cinq d'un bloc : il les prend dans
  `src/i18n/tous-dictionnaires.ts`, atteint depuis `/edition` seulement.

Le manifeste gagne deux raccourcis (plan officiel, saisie des enfants).

### Ce qui a été prouvé, et où s'arrête la preuve

Vérifié : **386 tests d'application** (346 avant le lot), `typecheck`, `lint`, `build`.
**Puis vérifié au navigateur**, le même jour : Playwright était disponible, contrairement
à ce qui avait d'abord été conclu — la recherche s'était arrêtée à `node_modules` et à
`which chromium`. Neuf vérifications sur neuf passent : le premier rendu attend le
dictionnaire du parent sans clignoter en français, l'application se recharge hors ligne,
y compris le changement de langue et `/edition`, et un foyer corrompu est rattrapé par la
barrière puis effaçable. Le poids est mesuré avant/après plutôt qu'annoncé : **227 → 152
Kio** compressés pour un parent francophone. R54, R55 et R56 sont levées.

Deux notes de méthode, chèrement acquises : Chromium mourait sur `/reglages` et
`/configurer` parce qu'**aucune police** n'est installée sur cette machine — un plantage
d'environnement qu'il aurait été facile de prendre pour un bogue de l'application ; et
`innerText` renvoie vide sous `chrome-headless-shell`, ce qui fait passer un DOM complet
pour une page blanche.

**Où s'arrête la preuve** : Chromium sous Linux, en local. Safari et iOS — où
l'application est réellement installée — n'ont pas été touchés, et R57 reste ouverte sur
le geste Android.

**Déployé le 2026-09-08.** `main` a reçu les neuf commits en avance rapide, la chaîne
GitHub est passée sur ses six travaux, et le redéploiement Dokploy du compose `bus-app`
(`NlpH0DNxs0fJ28bJt6LAo`) a été déclenché par l'API : `app.schoulbus.lu` sert le nouveau
paquet, `GET /api/sante` répond `ok` avec sa clé VAPID. La correction des horaires par
cycle est donc en ligne pour les parents. **R53 est levée dans la foulée** — rien n'était
publié en base. R51 et R52 restent ouvertes, elles attendent la commune.
