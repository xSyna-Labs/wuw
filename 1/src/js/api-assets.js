// ============================================================
// xSyna API Asset Loader
// ------------------------------------------------------------
// Reads  https://api.xsyna.de/index.txt  (key=url lines) and
// applies remote branding with PRIORITY over the built-in
// "Notdesign" fallback (src/index.css + inline SVG logos).
//
// Behaviour:
//   - index.txt not found / not reachable (HTTP error) -> banner "API_404"
//   - index.txt found, but a listed asset file is missing  -> banner "API_800"
//   - nothing available -> built-in "Notdesign" (default styles)
// ============================================================

const API_BASE = "https://api.xsyna.de";
const INDEX_PATH = "/index.txt";
const LS_INDEX_KEY = "xsyna_api_index_cache";
const LS_INDEX_TS_KEY = "xsyna_api_index_ts";
const FETCH_TIMEOUT = 7000;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Known asset keys (can be extended). Each maps to a "kind" that decides
// how the value is applied.
const ASSET_KINDS = {
  "xsyna-logo": "logo-xsyna",
  "xsyn-logo": "logo-xsyn",
  "neuromorphic": "css",
};

/**
 * Pure parser for index.txt content. Returns { key: url }.
 * Lines look like:  xsyna-logo=https://api.xsyna.de/logo.png
 */
export function parseIndexText(text) {
  const assets = {};
  if (!text) return assets;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (key && value) assets[key] = value;
  }
  return assets;
}

function readCache() {
  try {
    const ts = Number(localStorage.getItem(LS_INDEX_TS_KEY) || 0);
    if (Date.now() - ts > CACHE_TTL) return null;
    return localStorage.getItem(LS_INDEX_KEY);
  } catch {
    return null;
  }
}

function writeCache(text) {
  try {
    localStorage.setItem(LS_INDEX_KEY, text);
    localStorage.setItem(LS_INDEX_TS_KEY, String(Date.now()));
  } catch {
    /* ignore quota errors */
  }
}

async function fetchIndex() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(API_BASE + INDEX_PATH, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      writeCache(text);
      return { text, status: "ok" };
    }
    return { text: null, status: "http", code: res.status };
  } catch {
    // Network error (offline, CORS blocked, DNS, ...) -> try cache
    const cached = readCache();
    if (cached) return { text: cached, status: "cache" };
    // If we are online but the API did not answer, treat it as "index not found" (API_404).
    // If we are offline, fall back to the built-in Notdesign silently.
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    return { text: null, status: online ? "http" : "network", code: 0 };
  }
}

/** Show a fixed, dismissible banner at the top of the page. */
function showBanner(code, message, tone) {
  // Standalone-Apps (z. B. Rezeptliste) zeigen keine API-Banner – (edit-check)
  // Branding wird still angewendet, Fehler bleiben unsichtbar.
  if (document.documentElement.dataset.app === "standalone") return;
  if (document.getElementById("xs-api-banner")) return;
  const el = document.createElement("div");
  el.id = "xs-api-banner";
  const bg = tone === "error" ? "rgba(239,68,68,0.95)" : "rgba(251,191,36,0.95)";
  el.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;" +
    "display:flex;align-items:center;justify-content:center;gap:10px;" +
    "padding:8px 16px;font-size:0.8rem;font-weight:600;color:#0a0a0a;" +
    "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;" +
    `background:${bg};box-shadow:0 4px 20px rgba(0,0,0,0.4);`;
  const label = document.createElement("strong");
  label.textContent = code;
  const msg = document.createElement("span");
  msg.textContent = message;
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Schließen");
  close.style.cssText =
    "margin-left:4px;background:rgba(0,0,0,0.2);border:none;color:#0a0a0a;" +
    "width:22px;height:22px;border-radius:6px;cursor:pointer;font-weight:700;line-height:1;";
  close.addEventListener("click", () => el.remove());
  el.appendChild(label);
  el.appendChild(msg);
  el.appendChild(close);
  (document.body || document.documentElement).prepend(el);
}

function setNotdesign() {
  document.documentElement.classList.add("notdesign");
  window.__XSYNA_BRAND = window.__XSYNA_BRAND || {};
  window.__XSYNA_BRAND.source = "notdesign";
}

/** Probe an image URL using a real <img> load (no CORS required for display). */
function probeImage(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (!done) {
        done = true;
        resolve(ok);
      }
    };
    const img = new Image();
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), FETCH_TIMEOUT);
  });
}

/** Probe a stylesheet URL using a <link> load/error (no CORS required). */
function probeStylesheet(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (!done) {
        done = true;
        resolve(ok);
      }
    };
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    document.head.appendChild(link);
    // Some older browsers never fire link.onerror; assume success on timeout
    // only if no error fired, so we don't flag false "API_800".
    setTimeout(() => finish(true), FETCH_TIMEOUT);
  });
}

/** Replace an element with (or inject) a remote logo <img>. */
function applyLogoImage(el, url, size) {
  if (!el) return;
  if (el.tagName === "IMG") {
    el.src = url;
    return;
  }
  const img = document.createElement("img");
  img.src = url;
  img.alt = "xSyna";
  img.setAttribute("data-api-logo", "true");
  const h = size || el.getAttribute("data-logo-size") || "24";
  img.style.height = h + "px";
  img.style.width = "auto";
  img.style.display = "inline-block";
  img.style.verticalAlign = "middle";
  if (el.tagName === "svg") {
    img.style.height = (el.getAttribute("height") || h) + "px";
    el.replaceWith(img);
  } else {
    el.innerHTML = "";
    el.appendChild(img);
  }
}

function updateFavicon(url) {
  try {
    let link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = url;
  } catch {
    /* ignore */
  }
}

async function applyAssets(assets) {
  const missing = [];
  let appliedCss = false;
  let appliedLogo = false;
  let appliedXsynLogo = false;

  for (const [key, url] of Object.entries(assets)) {
    const kind = ASSET_KINDS[key];
    if (!kind) continue;
    if (kind === "css") {
      const ok = await probeStylesheet(url);
      if (ok) appliedCss = true;
      else missing.push(key);
    } else if (kind === "logo-xsyna") {
      const ok = await probeImage(url);
      if (ok) {
        appliedLogo = true;
        document.querySelectorAll('[data-brand-logo="xsyna"]').forEach((el) => applyLogoImage(el, url));
        updateFavicon(url);
      } else {
        missing.push(key);
      }
    } else if (kind === "logo-xsyn") {
      const ok = await probeImage(url);
      if (ok) {
        appliedXsynLogo = true;
        document.querySelectorAll('[data-brand-logo="xsyn"]').forEach((el) => applyLogoImage(el, url));
      } else {
        missing.push(key);
      }
    }
  }

  window.__XSYNA_BRAND = {
    source: "api",
    base: API_BASE,
    css: appliedCss ? assets["neuromorphic"] : null,
    logo: appliedLogo ? assets["xsyna-logo"] : null,
    xsynLogo: appliedXsynLogo ? assets["xsyn-logo"] : null,
    missing,
  };

  if (missing.length > 0) {
    showBanner("API_800", "Assets fehlen: " + missing.join(", "), "warn");
  }
  if (!appliedCss && !appliedLogo && !appliedXsynLogo) setNotdesign();
}

export async function initApiAssets() {
  if (typeof document === "undefined") return;
  try {
    const result = await fetchIndex();
    if (result.status === "ok" || result.status === "cache") {
      const assets = parseIndexText(result.text);
      if (Object.keys(assets).length === 0) {
        setNotdesign();
        return;
      }
      await applyAssets(assets);
    } else if (result.status === "http") {
      // index.txt exists-check failed with an HTTP status (incl. 404)
      showBanner("API_404", "Design-Index nicht gefunden (api.xsyna.de/index.txt).", "error");
      setNotdesign();
    } else {
      // offline, no cache -> silent Notdesign
      setNotdesign();
    }
  } catch (e) {
    console.error("[xSyna API assets] init failed:", e);
    setNotdesign();
  }
}

// Auto-run when loaded in a browser.
if (typeof document !== "undefined") {
  initApiAssets();
}
