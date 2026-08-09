// `vitest/config` plutôt que `vite` : c'est lui qui connaît la clé `test` ci-dessous.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Le chemin de base n'est jamais codé en dur : GitHub Pages sert le site sous
// /bus-scolaire-beckerich/, mais la commune pourrait un jour l'héberger sous un autre
// préfixe ou sur un domaine propre. Une variable d'environnement suffit alors.
const base = process.env.BASE_PATH ?? '/bus-scolaire-beckerich/'

// Empreinte du déploiement. Le hook useVersionCheck relit version.json à intervalles
// réguliers et propose le rechargement quand l'empreinte a changé.
const version = process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'
const dateBuild = new Date().toISOString()

/**
 * Politique de sécurité du contenu, posée en balise `<meta>`.
 *
 * GitHub Pages ne permet pas de définir d'en-tête HTTP : la balise est le seul moyen.
 * Elle est engendrée ici et non écrite en dur dans `index.html`, parce qu'elle doit
 * contenir l'origine du Worker, connue seulement à la construction.
 *
 * Deux directives manquent volontairement. `frame-ancestors` est **ignorée** en balise
 * `<meta>` — la spécification l'exige en en-tête —, l'y écrire donnerait une fausse
 * impression de protection. Et `style-src` autorise `'unsafe-inline'` : Leaflet et le
 * service worker injectent des styles, et une politique qui casse la carte protégerait
 * surtout les parents de leur propre application.
 */
function politiqueSecurite(urlWorker: string): string {
  const worker = urlWorker.replace(/\/$/, '')
  return [
    "default-src 'self'",
    "script-src 'self' https://gc.zgo.at",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.tile.openstreetmap.org",
    // `api.github.com` : TOUT `/admin` passe par là — vérification du jeton, lecture et
    // écriture des urgences, du plan, des textes et des crédits. Son absence rendait la
    // page inutilisable en production sans qu'aucun test ne le voie : `/admin` exige une
    // connexion GitHub, et la vérification de la CSP (lot 11) n'était jamais allée
    // jusque-là. L'échec se lisait « Jeton refusé par GitHub », alors que GitHub n'avait
    // rien reçu du tout.
    //
    // `oauth2.googleapis.com` et `www.googleapis.com` : échange du jeton PKCE et
    // écriture dans l'agenda. Ajoutés inconditionnellement — la CSP est statique,
    // alors que l'ID client peut être posé sans reconstruire cette liste.
    `connect-src 'self' https://gc.zgo.at https://api.github.com https://oauth2.googleapis.com https://www.googleapis.com${worker ? ` ${worker}` : ''}`,
    // L'écran de consentement Google est une navigation, pas une inclusion : seule
    // `form-action` doit s'ouvrir, et uniquement vers Google.
    "form-action 'self' https://accounts.google.com",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    // Aucune raison d'incorporer quoi que ce soit, ni de laisser réécrire les liens
    // relatifs, ni de poster un formulaire ailleurs que chez nous.
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')
}

/**
 * Métadonnées de partage (Open Graph et Twitter Card).
 *
 * Engendrées ici plutôt qu'écrites dans `index.html` : `og:image` et `og:url` exigent
 * des URL ABSOLUES — les crawlers ne résolvent pas les chemins relatifs —, or l'origine
 * n'est connue qu'à la construction.
 *
 * La description répète l'indépendance du site. Un lien partagé dans un groupe de
 * parents s'affiche avec ce texte et rien d'autre : laisser croire à une communication
 * officielle contredirait le premier principe du projet avant même l'ouverture du site.
 *
 * `robots: noindex` reste par ailleurs en place ; il vise les moteurs de recherche, pas
 * les aperçus de lien, et les deux ne se contredisent pas.
 */
function metasPartage(urlPublique: string): string {
  const url = urlPublique.replace(/\/$/, '')
  const titre = 'Bus scolaire Beckerich'
  const description =
    "Les horaires du bus scolaire de la commune de Beckerich, personnalisés pour chaque enfant. " +
    "Site indépendant, sans lien avec la commune ni avec l'école."

  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${titre}" />`,
    `<meta property="og:title" content="${titre}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}/" />`,
    `<meta property="og:image" content="${url}/icones/partage.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${titre} — site indépendant" />`,
    `<meta property="og:locale" content="fr_LU" />`,
    // `summary_large_image` : la vignette occupe toute la largeur de la carte, ce qui
    // rend la mention d'indépendance lisible au lieu d'une miniature carrée.
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${titre}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${url}/icones/partage.png" />`,
  ]
    .map((m) => `    ${m}`)
    .join('\n')
}

/**
 * Insère la politique et les métadonnées dans `index.html`, au plus près de l'ouverture
 * du `<head>`.
 *
 * **Construction uniquement.** En développement, `@vitejs/plugin-react` injecte un
 * préambule inline pour le rechargement à chaud ; `script-src 'self'` le bloque, et
 * l'application ne démarre plus du tout — page blanche et « can't detect preamble »
 * dans la console. Assouplir la politique pour satisfaire le serveur de développement
 * reviendrait à affaiblir celle qui protège les parents ; on ne la pose donc qu'au
 * build, qui est le seul artefact publié.
 */
function pluginCsp() {
  return {
    name: 'bus-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      const csp = politiqueSecurite(process.env.VITE_URL_WORKER ?? '')
      // Origine publique du site. Le défaut couvre GitHub Pages ; une commune qui
      // hébergerait le site ailleurs pose la variable, comme pour `BASE_PATH`.
      const urlPublique =
        process.env.URL_PUBLIQUE ?? `https://sashimee.github.io${base.replace(/\/$/, '')}`
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n` +
          `${metasPartage(urlPublique)}`,
      )
    },
  };
}

/** Écrit version.json dans le build pour que l'app installée détecte les nouveaux déploiements. */
function pluginVersion() {
  return {
    name: 'bus-version',
    closeBundle() {
      writeFileSync(
        resolve(import.meta.dirname, 'dist/version.json'),
        JSON.stringify({ version, dateBuild }, null, 2),
      )
    },
  }
}

export default defineConfig({
  base,
  define: {
    __VERSION__: JSON.stringify(version),
    __DATE_BUILD__: JSON.stringify(dateBuild),
  },
  plugins: [
    react(),
    pluginCsp(),
    pluginVersion(),
    VitePWA({
      registerType: 'autoUpdate',
      // Le service worker prend la main immédiatement : un push sur main doit se refléter
      // dans la webapp installée sans que le parent ait à la désinstaller.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // `version.json` sert justement à détecter les nouveaux déploiements : le
        // mettre en cache le rendrait aveugle. Le PDF, lui, pèse 2,2 Mo — l'imposer
        // à l'installation coûterait cher en données mobiles pour un fichier que
        // beaucoup de parents n'ouvriront jamais.
        // `traductions.json` obéit à la même règle que les urgences : précaché, il
        // figerait au déploiement les corrections qu'il sert justement à publier sans
        // reconstruction.
        globIgnores: [
          '**/version.json',
          '**/plan-bus-*.pdf',
          '**/urgences.json',
          '**/traductions.json',
        ],
        /*
         * Ce qui ne doit JAMAIS être remplacé par `index.html`.
         *
         * Un clic sur un lien `download` est une requête de navigation : sans cette
         * liste, la `NavigationRoute` de Workbox l'interceptait et renvoyait la page
         * de l'application. Le parent qui cliquait « Télécharger le plan officiel »
         * récupérait donc un fichier HTML nommé `.pdf`, illisible par tout lecteur.
         */
        navigateFallbackDenylist: [
          /\.pdf$/,
          /\.json$/,
          /^\/[^/]*\/icones\//,
          // Le point d'entrée du Worker n'est pas une page de l'application.
          /\/sw\.js$/,
        ],
        // Ajoute les écouteurs push au service worker généré par Workbox.
        importScripts: ['push-handler.js'],
        runtimeCaching: [
          {
            // Les urgences doivent toujours être relues en ligne ; le cache ne sert
            // que de filet hors réseau, pour ne pas perdre une annulation déjà connue.
            urlPattern: /urgences\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'urgences',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Même traitement pour les corrections de traduction : relues en ligne,
            // avec le cache pour seul filet hors réseau.
            urlPattern: /traductions\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'traductions',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Les tuiles de carte sont le seul appel réseau récurrent de l'app : on
            // les garde au fil de l'eau, mais leur absence ne casse jamais une page.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tuiles-osm',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Le plan officiel est mis en cache dès la première consultation : un
            // parent qui l'a ouvert une fois y a ensuite accès hors ligne.
            urlPattern: /plan-bus-.*\.pdf$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'plan-officiel',
              expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Bus scolaire Beckerich',
        short_name: 'Bus scolaire',
        description:
          "Horaires du bus scolaire de la commune de Beckerich, personnalisés par enfant. Site indépendant, sans lien avec la commune.",
        lang: 'fr',
        dir: 'ltr',
        theme_color: '#14161f',
        background_color: '#14161f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        categories: ['education', 'travel', 'utilities'],
        icons: [
          { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icones/icone-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})