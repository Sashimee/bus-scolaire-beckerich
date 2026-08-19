# Dossier de commercialisation — Bus scolaire Beckerich

> **À quoi sert ce document.** Il rassemble, en un seul fichier autoportant, tout ce que le
> dépôt sait de lui-même : ce que l'application fait, ce qu'elle coûte, ce qui est
> réutilisable pour une autre commune, ce qui est soudé à Beckerich, ce qui a été vérifié et
> ce qui ne l'a pas été. Il est destiné à être collé dans une conversation Claude **sans
> accès au code**, pour y bâtir un business plan visant les communes luxembourgeoises.
>
> **Convention de lecture.** Tout ce que le dépôt permet d'affirmer est écrit sans réserve et
> chiffré. Tout ce qui relève du marché, du droit ou de la concurrence est **absent ou marqué
> `[À VÉRIFIER]`** : ce document ne contient aucune donnée de marché, volontairement. Les
> inventer serait le meilleur moyen de fabriquer un business plan faux.
>
> Établi le 2026-08-19, sur l'état du dépôt au commit `578a1db` (2026-08-10).

---

## Executive summary (English)

**What it is.** A parent-built progressive web app that turns the commune of Beckerich's
school-bus timetable (a PDF brochure) into a per-child answer: which stop, which bus, what
time, on which day, accounting for the child's school cycle, the school site that cycle
attends, the direction the line runs, the walking time from home, and whether the child eats
lunch at home or at the *maison relais*. It is live, in daily use, in five languages
(French, German, Luxembourgish, Portuguese, English), and works fully offline.

**What is actually sellable.** Not the parent-facing app — the **commune back office**
(`/commune`). A municipal officer with no IT skills logs in with a personal code in the
form `xxxx-xxxx` (short enough to dictate over the phone), and can publish a disruption
("bus 2 is cancelled tomorrow") or correct a timetable through a form in plain French, with
a preview identical to what parents will see and a plain-language diff to re-read before
publishing. It reaches parents' phones — banner plus push notification — in about a minute,
with no rebuild and no developer involved. There is a tamper-evident audit journal. This
was exercised end to end on 2026-08-10.

**What it costs to run.** Effectively **€0/year**. Static front end on GitHub Pages,
Cloudflare Workers free plan with one KV namespace, GitHub Actions on a public repo,
OpenStreetMap tiles. The Worker has **zero runtime dependencies**; the app has seven. The
entire cost structure is human time: transcribing a commune's timetable, provisioning, and
back-to-school support.

**The privacy argument, which is the real differentiator for a public buyer.** No family
data ever leaves the device. Home address, children's first names and cycles live only in
`localStorage`; address autocomplete runs offline against an embedded national address
extract; household sharing travels in the **URL fragment**, which a server never receives;
QR codes are generated locally so the home address never transits a third-party service.
Server-side there is no family data at all — only opaque push endpoints, hashed officer
codes, and a 90-day audit journal. A municipal DPO has very little to review, and no
processor holding children's data appears in the contract.

**The main technical obstacle to selling this to a second commune.** The *Dillendapp*
(Beckerich's after-school care facility) is not a configuration value — it is a type-level
concept. It appears 188 times across nine engine modules, in 4 of the 8 trip-type variants,
in several `Enfant` fields and in the versioned share-link wire format. A commune with no
after-school facility, or with several, requires reworking the domain model. A second
Luxembourg commune with the *same* operating pattern (buses + fondamental cycles + one
after-school facility) is an estimated 2–4 weeks including timetable transcription. **This
is not a multi-tenant product**: one commune, one deployment.

**The three open questions this document deliberately does not answer.** (1) Is there a
market — how many of Luxembourg's communes run their own school transport, and who pays?
(2) Can the project be commercialised at all given that it currently declares itself
independent of the commune everywhere, is `noindex`, and is MIT-licensed? (3) Should the
next money go into serial twin deployments, or into a multi-tenant rewrite first?

---

## 1. Le problème résolu

Extrait du `README.md` du projet, qui formule la douleur mieux qu'une reformulation :

> Pour savoir quel bus concerne son enfant, un parent doit croiser de tête : le cycle de
> l'enfant → le site scolaire correspondant → la ligne qui le dessert dans le bon sens →
> l'arrêt le plus proche de chez lui → et selon qu'il déjeune à la maison ou au Dillendapp,
> un jour donné. Cette combinatoire est refaite à chaque rentrée et à chaque changement de
> cycle. L'application la fait une fois pour toutes.

Deux principes fondent le projet et contraignent toute évolution commerciale :

1. **Aucune donnée de famille ne quitte l'appareil.**
2. **L'application dit ce qu'elle ne sait pas** — temps de marche estimés, coordonnées
   d'arrêt approximatives, règles ambiguës du plan officiel : c'est affiché, pas deviné.

Une commune de Beckerich compte 17 arrêts sur 8 localités, 7 lignes, 11 courses, 133
passages horaires, 5 sites scolaires et une maison relais.

---

## 2. Ce que l'application fait

### 2.1 Les trois publics

L'application expose 17 routes, réparties en trois publics distincts. Seules les onze
premières figurent dans la navigation ; les autres s'atteignent par URL directe.

**Parent** — `/` (aujourd'hui), `/configurer`, `/enfant/:id` (fiche de la semaine),
`/enfant/:id/assistant`, `/plan` (le plan officiel complet), `/agenda`, `/reglages`,
`/installer`, `/limites`, `/independance`, `/credits`.

**Agent communal** — `/commune` (connexion + journal), `/commune/alertes`,
`/commune/horaires`. Détaillé en section 3.

**Mainteneur et traducteurs** — `/admin` (cinq onglets : perturbations, arrêts, plan,
traductions, crédits ; authentification GitHub avec vérification du droit d'écriture sur le
dépôt), `/traductions` (espace traducteur à code personnel).

### 2.2 Les briques de valeur

- **Écran « aujourd'hui »** — une carte par enfant, prochain départ en très grand
  caractère, délai « dans N min » **déduction faite du temps de marche**, badge « partir
  maintenant », horaire complet du jour toujours affiché et grisé avec sa raison les jours
  sans école.
- **Assistant de configuration en 6 étapes**, une question par écran, structuré autour de
  la journée de l'enfant (« le matin ? », « le midi ? », « la fin de journée ? » — bus,
  voiture ou maison relais) plutôt qu'autour des champs du stockage. Aucun brouillon :
  chaque réponse est écrite immédiatement. Aperçu en direct des heures produites.
- **Recherche d'adresse 100 % hors ligne** — 1 162 adresses de la commune (registre
  national BD-Adresses, CC0) embarquées en 41 Ko, tolérante aux accents, tous les mots dans
  n'importe quel ordre, navigation clavier complète. Aucun appel réseau : c'est une garantie
  de confidentialité, pas une optimisation.
- **Calcul de l'arrêt utile** — l'arrêt le plus proche n'est pas la réponse : il faut un
  arrêt desservi par une ligne roulant **dans le bon sens vers l'école du cycle de cet
  enfant**. Le moteur applique un rayon d'équivalence de 150 m (deux arrêts plus proches que
  cela sont le même point d'embarquement), gère les adresses dérogatoires par jour **et par
  sens** (matin, midi, soir), les jours sans cours l'après-midi, les navettes vers la maison
  relais, et signale les déplacements qu'aucune ligne ne couvre.
- **Partage du foyer** — configuration encodée dans le **fragment** de l'URL
  (`#partage=…`), jamais transmise au serveur ; QR code généré localement ; le destinataire
  accepte ou refuse explicitement, jamais d'écrasement silencieux.
- **Impression A4** — deux mises en page papier distinctes : une fiche par enfant, et une
  fiche foyer avec un enfant par colonne (jusqu'à 3 par page). Tout repasse en noir sur
  blanc franc.
- **Export agenda** — fichier `.ics` conforme RFC 5545 (récurrence hebdomadaire, exclusion
  de toutes les vacances et de tous les fériés, alarme calée sur le temps de marche + 5 min,
  calendrier nommé « Bus scolaire — *prénom* » pour qu'il se retrouve et se supprime d'un
  geste) ; **et** écriture directe dans Google Agenda en OAuth PKCE avec la portée
  `calendar.app.created` seule — l'agenda personnel du parent reste hors d'atteinte. Les
  dépôts et récupérations à la maison relais font des événements séparés : c'est le seul
  engagement du parent que rien d'autre ne lui rappelle.
- **Notifications push** (Web Push / VAPID) — jamais demandées au chargement, trois niveaux
  de préférence, bouton d'essai, marche à suivre par plateforme, encart permanent rappelant
  que ce n'est pas une garantie. Rappels programmés pour les alertes graves (créneaux 06:45,
  07:15, 07:40, 11:15, 15:00, plafonnés à 3).
- **Perturbations** — relues à chaque ouverture du site, hors bundle : publier une
  annulation prend une minute, sans reconstruction. Bandeaux non refermables.
- **PWA hors ligne** — installable, tous les horaires et adresses embarqués, utilisable à
  l'arrêt de bus sans réseau. Tuiles de carte et PDF officiel mis en cache.

### 2.3 Multilingue — argument direct dans un pays multilingue

**5 langues** : français, allemand, luxembourgeois, portugais, anglais. **751 chaînes
terminales par langue**, réparties en 54 sections, **strictement alignées** entre les cinq
dictionnaires. Aucune chaîne visible n'est écrite en dur dans un composant : c'est une règle
du projet, vérifiable.

Mieux : une **surcouche de traduction** est relue à chaque ouverture, hors bundle. Un
traducteur muni d'un code personnel corrige un texte depuis `/traductions` et la correction
est en ligne sans reconstruction. L'éditeur affiche le français de référence et une langue
de comparaison, garde un brouillon par langue, et n'envoie que le diff pour que deux
traducteurs simultanés ne s'écrasent pas.

Pour une commune dont une part importante des familles est lusophone, germanophone ou
anglophone, c'est un argument concret : le portugais et le luxembourgeois sont déjà là, et
le personnel communal peut corriger un mot lui-même.

---

## 3. L'espace commune — le produit vendable

C'est la section centrale du dossier. **Ce qu'on vend à une commune n'est pas l'application
parent, c'est cet espace-là** : la capacité, pour un agent communal non informaticien, de
prévenir toutes les familles d'un changement en quelques minutes, depuis son téléphone.

### 3.1 Connexion

- **Un code personnel au format `xxxx-xxxx`**, choisi assez court pour être dicté au
  téléphone. Aucun compte GitHub, aucune installation, aucun logiciel à déployer sur le
  poste de l'agent.
- Le serveur ne stocke que l'**empreinte SHA-256** du code, comparée à temps constant. Le
  code en clair est affiché une seule fois, à la création.
- Session : jeton signé HMAC, **8 heures**, rangé dans le stockage de session — fermer
  l'onglet déconnecte.
- Limitation anti-force brute : **5 tentatives par tranche de 15 minutes et par adresse IP**
  (limitation non stricte, voir section 7, réserve R4).
- **Deux rôles étanches** : « commune » et « traductions ». Ils vivent sous des préfixes de
  stockage distincts *et* le rôle est réinscrit dans le jeton et revérifié à chaque appel —
  deux barrières indépendantes. On peut être connecté aux deux à la fois ; se déconnecter de
  l'un n'emporte pas l'autre.
- Les erreurs sont traduites en langage humain : code inconnu, trop de tentatives, session
  expirée, conflit de publication, réseau, plan invalide.

### 3.2 Publier une perturbation — `/commune/alertes`

Un assistant en cinq écrans, formulé en français courant. Le type technique n'est jamais
montré : il est déduit.

1. **La situation** — « un bus est annulé », « un bus a du retard », « un arrêt est
   déplacé », « une information à faire passer ».
2. **La portée** — une ligne, une course précise, ou un arrêt (avec arrêt de remplacement et
   minutes de retard le cas échéant). Un avertissement explicite s'affiche si la
   perturbation vise **toute la commune**.
3. **Quand** — aujourd'hui, deux jours, ou une plage de dates. Les perturbations expirent
   toutes seules ; personne n'a à penser à les retirer.
4. **Le message** — 200 caractères maximum avec compteur, gravité choisie par ses
   conséquences (information / attention / alerte), et nombre de rappels push (0 à 3,
   réservé aux alertes).
5. **L'aperçu** — rendu **à l'identique de ce que verra le parent**, avant publication.

La liste des perturbations en cours est affichée avec un bouton « retirer » sous
confirmation. Le rechargement automatique du site est bloqué pendant que l'agent saisit.

### 3.3 Corriger un horaire — `/commune/horaires`

Sélecteur de ligne, puis un tableau arrêt × heure avec un champ d'heure natif par case.
L'application produit un **diff en français** que l'agent relit avant de publier :

> Aller — Bus 2 · matin · Hovelange : 07:32 → 07:35

La saisie est validée localement, puis **revalidée de façon autoritaire côté serveur** avec
le même validateur — le serveur n'accorde aucune confiance au navigateur. Confirmation avant
envoi, annulation en masse possible. À aucun moment l'agent ne voit du JSON.

### 3.4 Traçabilité

Un **journal des publications et des retraits** (qui, quand, quoi), consultable depuis
`/commune`, purgé automatiquement à 90 jours, plafonné à 50 entrées. Chaque écriture se fait
avec relecture-avant-écriture : deux publications concurrentes produisent un conflit
explicite, jamais un écrasement silencieux.

### 3.5 Ce qui est éprouvé

L'espace commune a été exercé de bout en bout par l'auteur le 2026-08-10 : création d'un
code d'agent, connexion depuis un téléphone, assistant de publication, alerte réellement
publiée et arrivée dans le dépôt. Le point de contrôle du serveur répondait alors :

```json
{"ok":true,"oauth":true,"push":true,"commune":true,"google":true,
 "depot":{"urgences":"ok","traductions":"ok"},"rappels":true}
```

### 3.6 Sans serveur, rien ne casse

Si le serveur n'est pas configuré, l'espace commune affiche « non configurée » et
**l'application parent continue de fonctionner intégralement**. Idem pour les notifications
et pour Google Agenda : chaque brique optionnelle disparaît proprement de l'interface. Une
commune peut donc démarrer avec la seule application, et activer l'espace communal plus tard.

---

## 4. Architecture, exploitation et coûts

### 4.1 Pile technique

| Couche | Choix | Remarque |
| --- | --- | --- |
| Interface | React 19, Vite 8, react-router 7, TypeScript | **7 dépendances runtime** au total |
| Carte | Leaflet, chargé en différé | Ne pèse pas sur qui n'ouvre jamais de carte |
| Hors ligne | PWA, Workbox | Précache complet, sauf ce qui doit rester frais |
| Serveur | Cloudflare Worker | **0 dépendance runtime** |
| Stockage serveur | Un espace clé-valeur Cloudflare | Ni base de données, ni objet durable |
| Intégration continue | GitHub Actions | Contrôle, construction, mise en ligne |

Le Web Push (chiffrement `aes128gcm`, signature VAPID) a été **écrit à la main sur la
cryptographie du navigateur** : la bibliothèque disponible n'implémentait que l'ancien
brouillon, rejeté sans appel par le service de notification d'Apple — or les parents visés
sont majoritairement sur iPhone.

### 4.2 Volumétrie du code

| Mesure | Valeur |
| --- | --- |
| Lignes TypeScript/TSX (`src/`) | **17 341**, dont 3 709 de tests |
| Lignes JavaScript (serveur) | **3 143**, dont 1 236 de tests |
| Composants et pages | 41 |
| Modules du moteur | 22 |
| Fichiers de tests / cas de test | **28 / 403** (exécutés le 2026-08-19, tous au vert) |
| Cas de test sur le seul moteur de calcul des trajets | **73** |
| Feuille de style | 75 Ko, en couches (jetons, base, mise en page, composants, impression) |
| Documentation | `docs/plan.md` 128 Ko, `ADMIN.md` 18 Ko, `DONNEES.md` 6,6 Ko |
| Historique | 115 commits, du 2026-08-07 au 2026-08-10 |
| Poids en ligne | 3,2 Mo, dont 2,1 Mo pour le seul PDF officiel |

### 4.3 Qualité — ce qui distingue ce dépôt d'un prototype

- Le moteur (`src/lib/`) est **pur et testé séparément de l'affichage** : les composants ne
  portent aucune règle métier. C'est ce qui rend une reprise par un tiers envisageable.
- Chaque décision non évidente porte un commentaire expliquant **la panne qu'elle évite** —
  pas ce que fait le code.
- Un **registre formel de réserves** (`docs/plan.md`, R1 à R37) recense tout ce qui n'a pas
  pu être vérifié, avec le critère exact pour le lever. Il est reproduit en section 7 sans
  être adouci.
- La chaîne d'intégration continue bloque la mise en ligne sur : audit de sécurité des
  dépendances au niveau « élevé », vérification de types, et la totalité des tests.

### 4.4 Sécurité

- Politique de sécurité de contenu générée à la construction et injectée dans la page (le
  service d'hébergement statique ne pose pas d'en-têtes HTTP) : origines énumérées une à
  une, `object-src` interdit, formulaires restreints.
- Toute donnée entrante — lien de partage, fichier de perturbations, formulaire
  d'administration — passe par un point de nettoyage unique dont la politique est explicite :
  **refuser proprement, jamais deviner**. Une perturbation malformée est ignorée sans
  emporter les autres.
- Le site est en `noindex` : il ne cherche pas à concurrencer la page officielle de la
  commune dans les moteurs de recherche.
- Le jeton d'authentification du mainteneur est relayé dans le **fragment** de l'URL, jamais
  dans les journaux du serveur ni dans l'en-tête de provenance.

### 4.5 Coûts d'exploitation

| Poste | Fournisseur | Coût |
| --- | --- | --- |
| Hébergement du site | GitHub Pages | **0 €** |
| Serveur d'API et notifications | Cloudflare Workers, plan gratuit | **0 €** |
| Stockage des abonnements | Cloudflare KV, palier gratuit | **0 €** |
| Intégration continue | GitHub Actions, dépôt public | **0 €** |
| Fonds de carte | OpenStreetMap | **0 €** |
| Mesure d'audience | GoatCounter, sans cookie | **0 €** (palier non commercial) |

**Coût marginal d'exploitation ≈ 0 €/an**, hors nom de domaine. Tout le coût réel est en
temps humain.

**Les plafonds à connaître, parce qu'ils cadrent la montée en charge :**

- Le plan gratuit Cloudflare accorde **10 ms de processeur par invocation** et 50
  sous-requêtes. L'envoi des notifications est donc découpé en lots de 10 abonnés,
  chaque lot obtenant son propre budget. **La taille de lot est documentée dans le code
  comme une estimation jamais mesurée** : le premier envoi massif réel est un chemin non
  éprouvé.
- Les tuiles OpenStreetMap sont gratuites mais **sans garantie de service** et soumises à
  une politique d'usage. À l'échelle de plusieurs communes, il faudra soit un fournisseur de
  tuiles payant, soit vérifier que la mise en cache agressive déjà en place suffit.
  `[À VÉRIFIER]`
- Le palier gratuit de la mesure d'audience est réservé à un usage non commercial : une
  commercialisation impose d'en changer. `[À VÉRIFIER]`
- Un passage au plan payant Cloudflare (de l'ordre de quelques euros par mois) lèverait le
  plafond processeur ; ce n'est pas un obstacle économique, c'est une ligne de coût à
  intégrer. `[À VÉRIFIER pour le tarif exact]`

---

## 5. Confidentialité et RGPD — l'argument différenciant

Pour un acheteur public, c'est probablement le levier de vente le plus fort, parce qu'il
est **vérifiable dans le code** et non simplement revendiqué dans une brochure.

### 5.1 Côté famille : rien ne sort de l'appareil

| Donnée | Où elle vit | Ce qui la protège |
| --- | --- | --- |
| Adresse du domicile | Stockage local du navigateur | Ne transite jamais par un serveur |
| Prénoms des enfants | Stockage local du navigateur | Idem |
| Cycle, repas, présence en maison relais | Stockage local du navigateur | Idem |
| Recherche d'adresse | Jeu de 1 162 adresses embarqué | **Aucun appel réseau** — donc aucun tiers ne sait quelle adresse est cherchée |
| Partage entre parents | **Fragment** de l'URL (`#partage=…`) | Le fragment n'est jamais envoyé au serveur, par construction du protocole HTTP |
| QR code du partage | Généré **localement** dans le navigateur | Précisément pour que l'adresse ne transite pas par un générateur en ligne |

Le format de partage borne en outre ses entrées (10 enfants maximum, prénom ≤ 40
caractères, coordonnées validées) : un lien malformé est refusé en bloc plutôt que
partiellement interprété.

### 5.2 Côté serveur : aucune donnée de famille

Le serveur ne détient, littéralement, ni adresse, ni prénom, ni cycle. Ce qu'il stocke :

| Contenu | Nature | Durée |
| --- | --- | --- |
| Points de terminaison de notification | Identifiants d'appareil **opaques** émis par Apple / Google / Mozilla, indexés par leur empreinte, plus une préférence | Jusqu'au désabonnement ; supprimés automatiquement quand le service de push les déclare morts |
| Jetons d'état d'authentification | Identifiants aléatoires | 10 minutes |
| Codes d'agents communaux | **Empreintes SHA-256 uniquement** | Durée du mandat |
| Nom et service de l'agent communal | Donnée personnelle de personnel administratif | Durée du mandat |
| Journal des publications | Qui, quand, quoi | 90 jours, purge automatique |
| État des rappels | Compteurs | Le temps de la perturbation |

Un point de terminaison de notification identifie un appareil sans porter aucun nom : sa
qualification exacte au regard du RGPD est à faire trancher. `[À VÉRIFIER]`

Le jeton d'authentification GitHub du mainteneur n'est **jamais** conservé côté serveur.
Pour Google Agenda, le serveur n'est qu'un relais d'échange (l'API de Google impose un
secret client) et ne retient rien.

### 5.3 Ce qu'on peut en dire à une commune

- Aucun sous-traitant hébergeant des données d'enfants n'apparaît au contrat.
- Le registre des traitements de la commune n'a pratiquement rien à enregistrer, et une
  analyse d'impact est probablement sans objet. `[À VÉRIFIER auprès d'un juriste / de la CNPD]`
- L'affirmation est **auditable** : le code est public, et une commune peut faire vérifier
  par un tiers qu'aucune adresse ne quitte l'appareil.
- Le prix payé pour cette garantie est explicitement assumé dans le code : par exemple, un
  agenda Google peut se dupliquer si le parent change de navigateur, parce que l'application
  refuse la portée d'accès qui lui permettrait de lister les agendas du parent (voir R24).
  **Cette cohérence est un argument de vente en soi.**

---

## 6. Portage vers une seconde commune — le chiffrage honnête

C'est la section la plus utile à un business plan, et celle où il ne faut pas se mentir.

### 6.1 Ce qui est quasi gratuit

| Tâche | Effort |
| --- | --- |
| Régénérer le jeu d'adresses de la nouvelle commune | **Une constante à changer et une commande.** Le registre national BD-Adresses est national et libre (CC0) ; le script résout tout seul l'URL courante du fichier, filtre sur le nom de la commune et réécrit le jeu. Pour Beckerich : 1 162 adresses, 41 Ko. |
| Calendrier scolaire | **Réutilisé tel quel** — les vacances sont nationales |
| Icônes et vignette de partage | Une chaîne de caractères à changer, une commande |
| Chemin d'hébergement | Une variable d'environnement |
| Serveur, clés de notification, codes d'agents | Scripts d'installation guidés déjà écrits |

### 6.2 Ce qui demande du travail humain, mais aucune décision d'architecture

| Tâche | Volume observé sur Beckerich |
| --- | --- |
| **Transcrire le plan de bus** depuis le PDF communal | 7 lignes, 11 courses, **133 passages horaires**, 6 notes de bas de tableau |
| Relever la position des arrêts | 17 arrêts |
| Table cycle → site scolaire → arrêt de l'école | 5 cycles, 5 sites, 1 maison relais |
| Retraduire les chaînes qui nomment la commune, les écoles, la maison relais | ~30 occurrences sur 751 clés × 5 langues |

**Il n'existe aucun outil d'import.** Le validateur contrôle après coup qu'un plan est
cohérent ; il ne lit pas un PDF. C'est le poste de coût principal d'une nouvelle commune, et
le premier candidat à l'outillage si le modèle d'affaires repose sur le volume.

### 6.3 Le blocage structurel : la maison relais

**Le Dillendapp n'est pas une configuration, c'est un concept du modèle de données.**

| Mesure | Valeur |
| --- | --- |
| Occurrences littérales dans les 9 modules du moteur | **188** (dont 67 dans le calcul des trajets, 27 dans les types, 26 dans le modèle de la journée, 16 dans le format de partage) |
| Variantes de type de trajet qui le nomment | **4 sur 8** (`retour-soir-dillendapp`, et trois navettes matin / midi / retour) |
| Champs d'un enfant qui en dépendent | 5 |
| Format de partage | Il est encodé dedans, en version 5 |

Conséquence : une commune **sans** structure d'accueil périscolaire, ou avec **plusieurs**,
ou avec une structure éloignée de l'école, impose de reprendre les types, le moteur, le
modèle de la journée, l'affichage, le partage, la persistance et l'interface. C'est le
premier poste d'un chiffrage de refonte.

### 6.4 Les autres verrous, plus petits

- Le moteur et la recherche d'adresses importent **statiquement** un seul jeu de données :
  il n'existe aucun registre multi-communes, aucun sélecteur, aucune notion de client.
- Les clés de stockage local sont préfixées du nom de la commune (18 clés) : les renommer
  efface la configuration des familles existantes.
- Le vocabulaire des cycles est une liste fermée sur l'enseignement fondamental
  luxembourgeois — réutilisable partout au Luxembourg, nulle part ailleurs sans travail.
- Deux fichiers déclarent séparément les mêmes chemins (côté navigateur et côté serveur) et
  doivent rester synchronisés à la main.
- Le changement d'année scolaire demande encore de toucher trois fichiers de code, ce que
  `DONNEES.md` documente honnêtement.

### 6.5 Verdict

> **Bien factorisé pour une deuxième commune luxembourgeoise au même schéma** (bus + cycles
> du fondamental + une maison relais) : estimation **2 à 4 semaines**, transcription du plan
> comprise. **Ce n'est pas un produit multi-locataire** : une commune = un déploiement, un
> dépôt, un serveur.

Les deux trajectoires à arbitrer dans le business plan :

- **(a) Déploiements jumeaux à la chaîne.** Coût quasi nul en infrastructure, mise en
  service rapide, mais l'effort de maintenance se multiplie par le nombre de communes et
  chaque correctif doit être propagé N fois.
- **(b) Refonte multi-locataire d'abord.** Un seul déploiement, une base de données de
  communes, une transcription qui devient de la saisie. Coût d'entrée à chiffrer, dont le
  premier poste est la sortie de la maison relais hors du système de types.

Un troisième scénario mérite d'être examiné : **vendre la mise en service et le support, pas
le logiciel** — le code étant sous licence MIT, il est déjà librement reprenable (voir 7.3).

---

## 7. Ce qui n'est pas vérifié — les risques, sans adoucissement

Le projet tient un registre de réserves : *une réserve dite de vive voix et non écrite est
une réserve perdue*. Voici celles qui restent ouvertes au 2026-08-10, telles qu'elles sont
consignées, plus les risques non techniques.

### 7.1 Réserves techniques ouvertes

| # | Ce qui n'est pas vérifié | Portée commerciale |
| --- | --- | --- |
| **R7** | **Aucun rappel de notification réel n'a jamais été envoyé.** Le mécanisme a été corrigé mais jamais exercé un vrai matin d'école. | La fonction la plus vendeuse de l'espace commune est celle dont la chaîne complète n'a pas été observée en conditions réelles. **À lever avant toute démonstration commerciale.** |
| **R33** | **Aucun parent extérieur n'a parcouru l'assistant de configuration.** Il n'a été éprouvé que par les tests et la mesure. | Le pari central de l'ergonomie n'est pas validé par un utilisateur qui ne connaît pas l'application. Un test à cinq parents est le prochain investissement le moins cher et le plus rentable. |
| **R35 / R36** | **Il n'existe aucune donnée d'usage exploitable.** Le compteur de visites n'a rien enregistré du 2026-08-08 au 2026-08-10 (une origine manquante dans la politique de sécurité), et il ne compte que la page d'arrivée : sur l'application installée, ce sera toujours la même. | **Aucun chiffre d'adoption ne peut être présenté à une commune aujourd'hui.** Corriger la mesure est un préalable à tout argumentaire fondé sur l'usage — et se heurte au premier principe du projet, ce qui demande un arbitrage explicite. |
| **R1 / R32** | La feuille imprimée du foyer a été tronquée silencieusement par le moteur d'Apple, qui annonçait « page 1 sur 1 ». Corrigé et mesuré (222 mm pour un foyer réel, 236 mm au pire, sur 273 disponibles), **mais mesuré sous Chrome**. | Un document imprimé faux entre les mains d'un parent est un incident de confiance. Réimprimer avant toute mise en avant de l'impression. |
| **R4** | La limitation à 5 tentatives de connexion n'est **pas stricte** : le stockage clé-valeur a une cohérence différée, des requêtes concurrentes laisseront passer quelques essais de plus. | Sans commune mesure avec une attaque par force brute, mais à déclarer si un audit de sécurité est demandé. |
| **R24** | Un agenda Google peut **se dupliquer** si le parent change de navigateur ou d'appareil. Rien n'est perdu ni dupliqué *dans* l'agenda, c'est l'agenda lui-même qui fait doublon. | Assumé : c'est le prix de la portée d'accès restreinte. Se raconte bien, à condition de le dire soi-même en premier. |
| **R31** | Le renouvellement silencieux de la session Google n'a jamais été exercé contre le vrai service. | Un parent pourrait devoir se reconnecter sans que ce soit prévu. |
| **R26 / R27** | Les polices n'ont pas été vues sur un vrai iPhone ; le contraste de 4,58:1 au pire cas est **calculé, pas mesuré à la pipette**. | À reprendre si une commune exige une conformité d'accessibilité formelle (voir section 9). |
| **R34 / R37** | L'état coché des réponses de l'assistant repose sur un sélecteur CSS récent, non vérifié sur un moteur ancien ; l'écran de choix de la langue n'a jamais été vu sur un vrai téléphone. | Risque de première impression dégradée sur du matériel ancien — fréquent dans le public visé. |

### 7.2 Risques d'organisation

- **Facteur de bus = 1.** Un seul développeur, un seul dépôt, les secrets détenus
  personnellement, une adresse électronique personnelle inscrite dans un dépôt public (le
  code lui-même signale qu'il faudrait une adresse dédiée). Une commune qui achète un
  service de transport scolaire achète une dépendance : la continuité doit être traitée
  contractuellement dès la première vente.
- **Aucune astreinte, aucun engagement de service.** L'application affiche partout le
  contraire : « meilleur effort, sans engagement de résultat ». Vendre, c'est prendre cet
  engagement — et le chiffrer, notamment autour de la rentrée.
- **Charge concentrée sur la rentrée.** Le plan change en septembre pour toutes les communes
  en même temps. C'est à la fois l'événement commercial naturel et le pic de charge.

### 7.3 Risques juridiques et de positionnement

- **Le plan de bus est la propriété de la commune.** Il n'est redistribué que pour en
  faciliter la consultation. Commercialiser un service bâti dessus suppose une autorisation
  explicite, commune par commune. `[À VÉRIFIER auprès d'un juriste]`
- **Le code est sous licence MIT.** Il est donc déjà librement reprenable par un tiers,
  y compris par une commune ou par un concurrent. Cela ne condamne pas la
  commercialisation — on vend alors la mise en service, la transcription, la maintenance,
  l'astreinte — mais cela **exclut un modèle fondé sur la seule cession de licence**, sauf
  à changer de licence pour la suite du développement. `[À VÉRIFIER : implications d'un
  changement de licence sur les contributions déjà reçues]`
- **Le positionnement actuel contredit frontalement une commercialisation.** L'application
  déclare son indépendance de la commune et de l'école **partout** : dans le README, dans le
  titre de la page, dans la description de l'application installable, dans la vignette de
  partage, sur une page dédiée, dans un écran d'avertissement à la première ouverture, en
  pied de page, sur la page du plan, sur la fiche de la semaine, **et jusque sur les feuilles
  imprimées**. Le site est en `noindex` pour ne pas concurrencer la page officielle.
  Passer de « site indépendant fait par un parent » à « prestataire de la commune » est un
  **point de bascule à traiter en premier**, pas une note de bas de page : il touche à la
  raison d'être du projet, à la confiance des parents actuels, et à des dizaines de chaînes
  de traduction dans cinq langues.

---

## 8. Cadrage commercial — ce que le dépôt permet déjà d'affirmer

Rien de ce qui suit ne préjuge d'un prix ni d'un marché : ce sont les seules conclusions que
le code autorise.

### 8.1 L'actif

**L'actif n'est pas l'application parent — elle est reproductible. L'actif est le couple :
un espace d'administration réellement utilisable par un agent non informaticien, et une
garantie de non-collecte qui est vérifiable.** Le reste (calcul des trajets, cinq langues,
export agenda, impression) est ce qui rend l'ensemble crédible, pas ce qui se vend.

### 8.2 Structure de coûts

- **Infrastructure : ≈ 0 €** par commune, tant que les plafonds gratuits tiennent (§4.5).
- **Mise en service : du temps humain**, dominé par la transcription du plan.
- **Récurrent : du temps humain**, concentré sur la rentrée (nouveau plan, nouvelle
  répartition des cycles, nouveau calendrier de vacances) plus le support des perturbations.
- **Marge structurelle élevée si le volume vient ; sinon, une prestation de service
  déguisée.** C'est l'arbitrage central du business plan.

### 8.3 Formes d'offre à instruire

Sans en privilégier aucune, ce que la structure du produit rend possible :

1. **Abonnement annuel par commune** — mise à disposition + espace commune + astreinte.
2. **Forfait de mise en service** (transcription + déploiement + formation d'un agent) **+
   maintenance annuelle**.
3. **Prestation de rentrée seule** — mise à jour annuelle du plan pour une commune qui
   exploite le logiciel elle-même (cohérent avec la licence MIT).
4. **Vente à un syndicat scolaire ou à un groupement de communes** plutôt qu'à une commune
   isolée, ce qui amortit la refonte multi-locataire. `[À VÉRIFIER : ces structures existent-elles
   et achètent-elles ?]`

### 8.4 Le moment

**La rentrée.** Le plan change, la commune doit le republier, les parents redemandent tous
la même chose en même temps. La douleur est datée, ce qui est rare et exploitable : le cycle
de vente doit viser une décision au printemps pour une mise en service en août.

### 8.5 Preuves disponibles pour un argumentaire

- Une commune réelle, en service, dont l'espace d'administration a été exercé de bout en
  bout par un agent.
- Un code public, auditable, testé (403 cas, tous au vert), documenté en français à destination de
  non-développeurs.
- Une garantie de confidentialité démontrable ligne à ligne.
- **Ce qui manque, et manque cruellement : le moindre chiffre d'usage** (voir R35/R36), et
  le moindre témoignage de parent ou d'agent communal. Les deux se fabriquent en quelques
  semaines et devraient précéder toute démarche commerciale.

---

## 9. Ce qui reste à rechercher — le dossier ne le contient volontairement pas

Toutes les questions ci-dessous conditionnent le business plan et **aucune ne peut être
répondue depuis le dépôt**. Elles sont à instruire par recherche, pas à estimer.

**Marché**
- Combien de communes compte le Luxembourg, et combien organisent leur **propre** transport
  scolaire (par opposition aux lignes du réseau national) ? `[À VÉRIFIER]`
- Combien passent par un **syndicat scolaire intercommunal** ou une structure d'accueil
  mutualisée ? Qui achèterait, dans ce cas ? `[À VÉRIFIER]`
- Combien de communes publient aujourd'hui leur plan sous forme de simple PDF — c'est-à-dire
  ont exactement le problème résolu ici ? `[À VÉRIFIER]`

**Décision et achat**
- Qui décide et qui paie dans une commune luxembourgeoise : le collège des bourgmestre et
  échevins, le secrétaire communal, la commission scolaire, le syndicat ? `[À VÉRIFIER]`
- Quels sont les seuils de marchés publics en dessous desquels une commune peut contracter
  de gré à gré ? C'est ce seuil qui détermine le prix plafond d'une première vente sans
  procédure. `[À VÉRIFIER]`
- Existe-t-il des dispositifs de soutien à la numérisation communale mobilisables ?
  `[À VÉRIFIER]`

**Conformité**
- Obligations d'accessibilité applicables au secteur public (transposition de la directive
  européenne 2016/2102) : quel niveau, quelle déclaration, quel audit ? Le projet a soigné
  l'accessibilité (cibles tactiles ≥ 44 px, contrastes calculés, motifs ARIA, mouvement
  réduit) mais **n'a jamais été audité**. `[À VÉRIFIER]`
- Cadre RGPD et doctrine de la CNPD pour une application destinée à des familles : une
  architecture sans collecte suffit-elle à écarter l'analyse d'impact ? `[À VÉRIFIER]`
- Statut d'un point de terminaison de notification au regard du RGPD. `[À VÉRIFIER]`
- Le fait d'héberger chez des prestataires non européens (GitHub, Cloudflare, Google) — même
  sans donnée personnelle — soulève-t-il une objection en commande publique ? `[À VÉRIFIER]`

**Concurrence**
- Que couvre déjà l'offre nationale d'information voyageur, et jusqu'où descend-elle au
  niveau du transport scolaire communal ? `[À VÉRIFIER]`
- Quels éditeurs vendent déjà des outils de communication scolaire ou de gestion de maison
  relais aux communes luxembourgeoises, et à quel prix ? `[À VÉRIFIER]`
- Quelles communes ont déjà une application maison, et qui la leur a faite ? `[À VÉRIFIER]`

**Cadre de l'activité**
- Forme juridique et fiscalité d'une activité indépendante au Luxembourg ; compatibilité
  avec l'emploi actuel de l'auteur. `[À VÉRIFIER]`
- Assurance responsabilité professionnelle : que couvre-t-elle si un enfant rate un bus
  parce qu'un horaire était faux ? **C'est la question de risque la plus concrète du dossier.**
  `[À VÉRIFIER]`
- Droits sur les données de plan et sur la marque : la commune accepte-t-elle qu'un tiers
  exploite commercialement un service bâti sur son plan ? `[À VÉRIFIER]`

---

## 10. Annexes

### 10.1 Les données, fichier par fichier

Toutes les données vivent dans des fichiers texte ; **aucun horaire n'est écrit dans le
code**. C'est ce qui rend une mise à jour accessible à une personne non développeuse.

| Fichier | Taille | Contenu | Spécifique à la commune ? |
| --- | --- | --- | --- |
| `plan-2025-2026.json` | 15,6 Ko | 7 lignes, 11 courses, 133 passages, notes, règles confirmées, incertitudes déclarées | **Totalement** |
| `arrets.json` | 5,0 Ko | 17 arrêts sur 8 localités, avec leur niveau de précision | **Totalement** |
| `ecoles.json` | 3,2 Ko | 5 cycles, 5 sites scolaires, 1 maison relais (07:00–18:30) | **Totalement** |
| `adresses-beckerich.json` | 42,2 Ko | 1 162 adresses, 59 rues, 8 localités | Totalement, mais **généré automatiquement** |
| `vacances-lu.json` | 2,2 Ko | 2 années scolaires, 6 périodes de vacances, 3 fériés | **National — réutilisable tel quel** |
| `transport-a-la-demande.json` | 0,8 Ko | Le service de transport à la demande du canton | Régional, trivialement remplaçable |
| `credits.json` | 0,7 Ko | Développement, traducteurs, remerciements | Propre au projet |

Deux fichiers vivent **hors du paquet** et sont relus à chaque ouverture, donc modifiables
sans reconstruire le site : les **perturbations** et la **surcouche de traductions**. C'est
ce qui permet à l'espace commune de publier en une minute.

### 10.2 Ce qu'une personne non développeuse peut déjà faire

`DONNEES.md` (6,6 Ko) documente, pas à pas et sans jargon, les cas réels :

1. **La commune publie un nouveau plan** — copier le fichier de l'année précédente, corriger
   les horaires ligne par ligne en comparant au PDF, mettre à jour l'en-tête. *(Trois
   fichiers de code restent à toucher : c'est la principale aspérité restante.)*
2. **La commune redistribue les cycles entre les écoles** — une ligne à changer ; tous les
   plans des enfants concernés se recalculent d'eux-mêmes.
3. **Nouvelle année de vacances scolaires** — un bloc à ajouter. Tant qu'une année n'est pas
   renseignée, **l'application ne prétend pas savoir s'il y a école : elle l'écrit
   franchement.** C'est voulu.
4. **Corriger la position d'un arrêt** — relever les coordonnées sur OpenStreetMap et passer
   la précision de « approximative » à « vérifiée ».

Le document se termine par deux sections qui disent beaucoup de la méthode du projet :
« Règles confirmées auprès de la commune » (avec leur date, pour savoir plus tard sur quoi
elles reposent) et « Questions encore en suspens » — actuellement, l'arrêt de départ de
13:25 à Beckerich, que le plan officiel ne nomme pas.

### 10.3 Sources des données et licences

| Donnée | Source | Licence |
| --- | --- | --- |
| Horaires du bus scolaire | Brochure communale, rentrée 2025/2026 | **Document communal — propriété de la commune** |
| Répartition des cycles | Site de la commune | Document communal |
| Adresses | BD-Adresses, `data.public.lu` | **CC0** (libre) |
| Coordonnées des arrêts | OpenStreetMap / Nominatim | **ODbL** (attribution + partage à l'identique) |
| Vacances scolaires | Ministère de l'Éducation nationale | Document officiel |
| Code de l'application | — | **MIT** |

La licence ODbL des coordonnées d'arrêts et le statut du plan de bus sont les deux points à
instruire juridiquement avant toute vente. `[À VÉRIFIER]`

### 10.4 Mise en service d'une nouvelle instance

La procédure existe et a été exécutée. Elle tient en quelques commandes, plus la création
des codes d'agents :

```bash
cd worker
npx wrangler secret put SECRET_SESSION   # chaîne aléatoire, non réutilisée
npx wrangler secret put GITHUB_PAT       # jeton restreint, écriture, ce dépôt seul
npx wrangler deploy
./creer-agent.sh "Prénom Nom" "service"  # affiche le code xxxx-xxxx une seule fois
curl https://<serveur>/sante             # doit répondre "commune": true
```

Des scripts guidés existent pour l'installation complète du serveur, la génération des clés
de notification et leur réparation. `ADMIN.md` (18 Ko) documente la publication d'une
urgence et l'activation des notifications.

### 10.5 Chiffres à retenir

| | |
| --- | --- |
| Coût d'infrastructure par an | **≈ 0 €** |
| Langues | **5** (fr, de, lb, pt, en), 751 chaînes chacune |
| Adresses embarquées, hors ligne | **1 162** |
| Arrêts / lignes / courses / passages | 17 / 7 / 11 / 133 |
| Lignes de code (application + serveur) | **20 484**, dont 4 945 de tests |
| Cas de test | **403**, dont 73 sur le moteur de calcul des trajets |
| Dépendances à l'exécution | 7 côté navigateur, **0** côté serveur |
| Délai de publication d'une alerte par la commune | **~1 minute**, sans reconstruction |
| Poids du site | 3,2 Mo, dont 2,1 Mo pour le PDF officiel |
| Durée de développement | 115 commits, du 2026-08-07 au 2026-08-10 |
| Communes couvertes à ce jour | **1** |
| Données d'usage disponibles | **aucune** (voir R35/R36) |

---

## Comment se servir de ce dossier

Ce document décrit un logiciel qui fonctionne, qui est en service dans une commune, dont
l'exploitation ne coûte rien, et dont l'argument de confidentialité est vérifiable. Il
décrit aussi, sans les minimiser, trois obstacles : **personne n'a mesuré l'usage réel**,
**le modèle de données est soudé à une seule commune par le concept de maison relais**, et
**le projet se déclare aujourd'hui indépendant de la commune, ce qu'une vente contredit**.

Un business plan bâti là-dessus devrait, dans cet ordre : lever R7 et R33 (une vraie
notification, cinq vrais parents), instruire la section 9, puis seulement arbitrer entre les
deux trajectoires produit de la section 6.5. Toute recommandation qui saute la section 9
sera une recommandation inventée.
