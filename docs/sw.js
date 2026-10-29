'use strict';
// Scoped to /red/: never intercept /casa/ or cache network diagnostics/private data.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(clients.claim()));
