/* Fallback for static hosts that cannot set COOP/COEP. The page reloads once.
 * No offline cache, authentication changes or third-party request interception. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(new URL(event.request.url).origin!==self.location.origin)return;event.respondWith((async()=>{const response=await fetch(event.request);if(response.type==='opaque'||response.status===0)return response;const headers=new Headers(response.headers);headers.set('Cross-Origin-Opener-Policy','same-origin');headers.set('Cross-Origin-Embedder-Policy','require-corp');headers.set('Cross-Origin-Resource-Policy','same-origin');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});})());});
