// ============================================================
// Rezeptliste – App Service Worker (Scope: /recipe-list/)
// ------------------------------------------------------------
// • Offline: precached App-Shell + Core-Module
// • Runtime-Cache für CDN-Assets (Fonts, OCR, Supabase) –
//   cache-first, damit OCR & Fonts auch offline funktionieren
// • PWA-Falle: Jede Navigation innerhalb der App-Domain landet
//   wieder in der App – man kann nicht zur Website wechseln.
// ============================================================

const CACHE_NAME = "xsynarec-v4";
const SHELL_CACHE = "xsynarec-shell-v4";
const RUNTIME_CACHE = "xsynarec-runtime-v4";

const SHELL_URLS = [
  "/recipe-list/",
  "/recipe-list/index.html",
  "/recipe-list/manifest.webmanifest",
  "/src/recipe-list.js",
  "/src/js/synaptic.js",
  "/src/js/web-recipes.js",
  "/src/js/ui.js",
  "/src/index.css",
  "/recipe-list-icon.svg",
];

const APP_SCOPE = "/recipe-list/";

// CDN-Hosts, die wir für Offline-Nutzung cachen (Fonts, Tesseract-OCR, Supabase)
const CACHEABLE_CDN = [
  "cdn.jsdelivr.net",
  "esm.sh",
  "cdn.skypack.dev",
  "unpkg.com",
  "supabase.co",
  "tessdata.projectnaptha.com",
];

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAppShellRequest(url) {
  return url.pathname === APP_SCOPE || url.pathname === APP_SCOPE.replace(/\/$/, "") || url.pathname.endsWith("/recipe-list/index.html");
}

// ----- Install: App-Shell vorcachen -----
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (res && res.ok) await cache.put(url, res);
          } catch (e) {
            // offline beim ersten Install – später nachholbar
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("xsynarec-") && k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // ----------------------------------------------------------
  // PWA-Falle: Navigationen innerhalb der Domain, aber außerhalb
  // der App (/, /news, /auth, /internal-services …) werden auf
  // die App zurückgeführt. Externe Navigationen (andere Domains)
  // werden ignoriert – die App selbst enthält keine Links nach außen.
  // ----------------------------------------------------------
  if (isNavigationRequest(request)) {
    if (sameOrigin(url) && !url.pathname.startsWith(APP_SCOPE)) {
      event.respondWith(
        (async () => {
          const shell = await caches.match(APP_SCOPE);
          if (shell) return shell;
          try {
            const res = await fetch(APP_SCOPE, { cache: "no-store" });
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(APP_SCOPE, res.clone());
            return res;
          } catch {
            return new Response(
              "<!doctype html><meta charset=\"utf-8\"><title>Rezeptliste</title><body style=\"background:#000;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh\"><div style=\"text-align:center\"><h1>Rezeptliste</h1><p style=\"opacity:.6\">Offline – App-Daten sind lokal gespeichert.</p></div></body>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            );
          }
        })()
      );
      return;
    }
  }

  // ----------------------------------------------------------
  // CDN-Assets: cache-first (Fonts, OCR-Modelle, Supabase-Modul)
  // ----------------------------------------------------------
  if (!sameOrigin(url)) {
    const cdnHost = url.hostname;
    if (CACHEABLE_CDN.some((h) => cdnHost === h || cdnHost.endsWith("." + h))) {
      event.respondWith(
        (async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          try {
            const res = await fetch(request);
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          } catch {
            return cached || Response.error();
          }
        })()
      );
      return;
    }
    return; // andere externe Requests normal durchlassen
  }

  // ----------------------------------------------------------
  // Same-Origin: network-first mit Cache-Fallback
  // ----------------------------------------------------------
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await fetch(request, { cache: "no-store" });
        if (res && res.ok) {
          // App-Shell-Requests inkl. querystring-Versionen cachen
          if (isAppShellRequest(url) || request.destination === "script" || request.destination === "style" || request.destination === "font" || request.destination === "image") {
            cache.put(request, res.clone());
          }
        }
        return res;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        // Fallback für die App-Shell selbst
        if (isNavigationRequest(request)) {
          const shell = await cache.match(APP_SCOPE);
          if (shell) return shell;
        }
        return Response.error();
      }
    })()
  );
});
