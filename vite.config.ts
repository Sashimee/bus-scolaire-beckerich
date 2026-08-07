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
        globIgnores: ['**/version.json', '**/plan-bus-*.pdf', '**/urgences.json'],
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
        theme_color: '#1a1b26',
        background_color: '#1a1b26',
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
