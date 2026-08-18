// Global UI helpers for xSyna

const TOAST_CONTAINER_ID = "xs-toast-container"; // id

function getContainer() {
  let el = document.getElementById(TOAST_CONTAINER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOAST_CONTAINER_ID;
    el.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 320px;
      pointer-events: none;
    `;
    document.body.appendChild(el);
  }
  return el;
}

export function toast(message, type = "info", duration = 4000) {
  const container = getContainer();
  const el = document.createElement("div");
  const colors = {
    info: "border-color: var(--cyan); color: var(--cyan); background: rgba(34, 211, 238, 0.08);",
    success: "border-color: #22c55e; color: #22c55e; background: rgba(34, 197, 94, 0.08);",
    warning: "border-color: var(--amber); color: var(--amber); background: rgba(251, 191, 36, 0.08);",
    error: "border-color: #ef4444; color: #ef4444; background: rgba(239, 68, 68, 0.08);",
  };
  el.style.cssText = `
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid;
    font-size: 0.85rem;
    font-weight: 500;
    box-shadow: var(--shadow-lg);
    opacity: 0;
    transform: translateX(20px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    pointer-events: auto;
    ${colors[type] || colors.info}
  `;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateX(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export function confirmModal(message) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    `;
    const box = document.createElement("div");
    box.style.cssText = `
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      max-width: 400px;
      width: 100%;
      box-shadow: var(--shadow-lg);
    `;
    box.innerHTML = `
      <p style="margin-bottom: 24px; color: var(--text);">${message}</p>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <button id="modal-cancel" class="btn btn-secondary btn-sm">Abbrechen</button>
        <button id="modal-confirm" class="btn btn-primary btn-sm">OK</button>
      </div>
    `;
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    box.querySelector("#modal-cancel").addEventListener("click", () => {
      backdrop.remove();
      resolve(false);
    });
    box.querySelector("#modal-confirm").addEventListener("click", () => {
      backdrop.remove();
      resolve(true);
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
        resolve(false);
      }
    });
  });
}

export function initTheme() {
  const stored = localStorage.getItem("xsyna_theme");
  const theme = stored || "system";
  applyTheme(theme);
  return theme;
}

export function applyTheme(theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("light", !isDark);
  localStorage.setItem("xsyna_theme", theme);
}

export function toggleTheme() {
  const current = localStorage.getItem("xsyna_theme") || "system";
  const order = { system: "light", light: "dark", dark: "system" };
  const next = order[current] || "system";
  applyTheme(next);
  toast(`Theme: ${next === "system" ? "System" : next === "dark" ? "Dunkel" : "Hell"}`, "info");
  return next;
}

export function initKeyboardShortcuts(handlers = {}) {
  document.addEventListener("keydown", (e) => {
    if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable) return;
    const key = e.key.toLowerCase();
    if (handlers[key]) {
      e.preventDefault();
      handlers[key]();
    }
  });
}

export function initInactivityTimeout(signOutFn, timeoutMs = 30 * 60 * 1000) {
  let timeout;
  function reset() {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      toast("Du wurdest wegen Inaktivität abgemeldet.", "warning");
      if (typeof signOutFn === "function") signOutFn();
    }, timeoutMs);
  }
  ["mousedown", "keydown", "touchstart", "scroll"].forEach((evt) => {
    document.addEventListener(evt, reset, { passive: true });
  });
  reset();
}

export function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
