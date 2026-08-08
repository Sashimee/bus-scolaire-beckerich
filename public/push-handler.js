/*
 * Réception des notifications push, importé par le service worker généré.
 *
 * Volontairement écrit à la main et gardé hors du bundle : Workbox génère le reste du
 * service worker, et ce fichier ne fait qu'ajouter les deux écouteurs qui lui manquent.
 */
/* global self, clients */

self.addEventListener('push', (evenement) => {
  let donnees = {}
  try {
    donnees = evenement.data ? evenement.data.json() : {}
  } catch {
    donnees = { corps: evenement.data ? evenement.data.text() : '' }
  }

  const titre = donnees.titre || 'Bus scolaire Beckerich'
  const alerte = donnees.gravite === 'alerte'
  const options = {
    body: donnees.corps || '',
    icon: donnees.icone || './icones/icone-192.png',
    badge: './icones/icone-192.png',
    // Un identifiant stable évite d'empiler dix fois la même annulation.
    tag: donnees.id || 'urgence',
    renotify: true,
    requireInteraction: alerte,
    // Perceptible là où la bannière ne l'est pas — téléphone dans une poche, sonnerie
    // coupée. C'est, avec `Urgency` côté transport, tout ce qu'une application web
    // peut faire d'elle-même : le reste relève des réglages du système.
    ...(alerte ? { vibrate: [200, 100, 200] } : {}),
    silent: false,
    data: { url: donnees.url || './' },
  }

  evenement.waitUntil(self.registration.showNotification(titre, options))
})

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close()
  const cible = new URL(evenement.notification.data?.url || './', self.location.href).href

  evenement.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      // Si l'application est déjà ouverte, on la remet au premier plan plutôt que
      // d'ouvrir un second onglet.
      for (const fenetre of fenetres) {
        if (fenetre.url.startsWith(cible) && 'focus' in fenetre) return fenetre.focus()
      }
      return clients.openWindow(cible)
    }),
  )
})
