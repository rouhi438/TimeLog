// No private pages, auth responses or employee records are cached.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('gastronomia-shell-'))await caches.delete(k);await self.clients.claim();})()));
