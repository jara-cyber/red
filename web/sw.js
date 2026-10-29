'use strict';
// No API or inventory caching: private data remains behind authentication.
self.addEventListener('push', event => {
  let data = {title:'RED · Aviso', body:'Hay una nueva actividad en tu red.'};
  try { data = {...data, ...event.data.json()}; } catch (_) { /* display fallback */ }
  event.waitUntil(self.registration.showNotification(data.title, {body:data.body,icon:'/icon-192.png',badge:'/icon-192.png',tag:'red-push'}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows => {
    for (const window of windows) if (new URL(window.url).origin === self.location.origin) return window.focus();
    return clients.openWindow('/');
  }));
});
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));
