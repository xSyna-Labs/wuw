// ============================================================
// xSyna — xScan (Live-Kamera-Erkennung)
// ------------------------------------------------------------
// Einmal die Kamera freigeben, dann erkennt xScan Produkte in
// Echtzeit: periodisch wird ein Frame an das lokale OCR-Modell
// (Tesseract.js) geschickt und der Text durch das Synaptic-Mini-
// LLM (extractFromOcr) in Produkte + Mengen zerlegt. Erkannte
// Artikel werden gesammelt und können einzeln oder mit
// „Accept all“ in den Bestand übernommen werden.
// ============================================================
import { extractFromOcr } from "./ocr-boost.js";

export function openXscan(api) {
  const {
    inventory,
    persistInventory,
    renderContent,
    toast,
    escapeHtml,
    productIcon,
    formatAmount,
    normalize,
    ICONS,
    uuid,
  } = api;

  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal rec-modal-lg" style="max-width: 720px;">
      <div class="rec-modal-head">
        <h3 style="font-size: 1.05rem;">${ICONS.spark} xScan · Live-Erkennung</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 12px;">
        Einmal die Kamera freigeben – xScan erkennt Produkte in Echtzeit mit dem OCR-Modell + Synaptic-Mini-LLM.
        Erkanntes wird unten gesammelt und kann direkt übernommen werden.
      </p>
      <div class="rec-cam">
        <video id="xscan-video" autoplay playsinline muted style="width: 100%; border-radius: 10px; background: #000; max-height: 320px;"></video>
        <div class="rec-cam-actions">
          <button class="btn btn-secondary btn-sm" id="btn-xscan-toggle">${ICONS.spark} Scan läuft… (Pause)</button>
          <button class="btn btn-lime btn-sm" id="btn-xscan-accept">${ICONS.check} Accept all</button>
        </div>
        <p id="xscan-status" style="color: var(--lime); font-size: 0.78rem; margin-top: 8px; min-height: 18px;">Kamera wird gestartet…</p>
        <div id="xscan-progress" style="display: none; margin-top: 8px;">
          <div class="rec-progress"><div id="xscan-bar" style="width: 0%"></div></div>
        </div>
        <div id="xscan-list" class="rec-xscan-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let running = true;
  let busy = false;
  let worker = null;
  let timer = null;
  let stream = null;
  const seen = new Map();

  const video = overlay.querySelector("#xscan-video");
  const status = overlay.querySelector("#xscan-status");
  const bar = overlay.querySelector("#xscan-bar");
  const progress = overlay.querySelector("#xscan-progress");
  const listEl = overlay.querySelector("#xscan-list");
  const toggleBtn = overlay.querySelector("#btn-xscan-toggle");

  const close = () => {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (worker) { worker.terminate().catch(() => {}); worker = null; }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    overlay.remove();
  };

  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const renderList = () => {
    const items = [...seen.values()];
    if (!items.length) {
      listEl.innerHTML = `<p class="rec-xscan-empty">Noch nichts erkannt – halte ein Produkt-Etikett in die Kamera.</p>`;
      return;
    }
    listEl.innerHTML = items.map((it, idx) => `
      <div class="rec-xscan-item ${it.selected ? "on" : ""}" data-idx="${idx}">
        <span class="rec-product-emoji">${productIcon(it)}</span>
        <span class="rec-name">${escapeHtml(it.name)}</span>
        <span class="rec-amount">${formatAmount(it)}${it.estimated ? " ~" : ""}</span>
        <button class="rec-check ${it.selected ? "on" : ""}" data-tog="${idx}" title="Übernehmen / verwerfen">${it.selected ? ICONS.check : ""}</button>
      </div>`).join("");
    listEl.querySelectorAll("[data-tog]").forEach((b) => b.addEventListener("click", () => {
      const it = items[Number(b.dataset.tog)];
      it.selected = !it.selected;
      renderList();
    }));
  };

  const mergeFound = (found) => {
    for (const it of found) {
      const key = normalize(it.name) + "|" + (it.unit || "");
      const prev = seen.get(key);
      const better = !prev || (prev.amount == null && it.amount != null) || (prev.estimated && !it.estimated);
      if (better) seen.set(key, { ...it, selected: prev ? prev.selected : true });
    }
    renderList();
  };

  const tick = async () => {
    if (!running || busy) return;
    busy = true;
    try {
      if (!worker) {
        const { createWorker } = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm");
        status.textContent = "xScan-Modell wird geladen (erster Scan)…";
        progress.style.display = "block";
        worker = await createWorker("deu+eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text") {
              bar.style.width = Math.round(m.progress * 100) + "%";
              status.textContent = `Text wird erkannt… ${Math.round(m.progress * 100)}%`;
            }
          },
        });
        progress.style.display = "none";
        status.textContent = "xScan aktiv – Produkte in die Kamera halten.";
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const { data } = await worker.recognize(dataUrl);
      const found = extractFromOcr(data.text, []);
      if (found.length) {
        mergeFound(found);
        status.textContent = `${seen.size} Produkt(e) erkannt – „Accept all“ übernimmt alle.`;
      }
    } catch (e) {
      status.textContent = "xScan-Fehler: " + (e && e.message ? e.message : e);
    } finally {
      busy = false;
    }
  };

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "environment" } })
    .then((s) => {
      stream = s;
      video.srcObject = s;
      video.play().catch(() => {});
      timer = setInterval(tick, 1200);
      tick();
    })
    .catch((e) => {
      status.textContent = "Kamera nicht verfügbar: " + (e && e.message ? e.message : e);
    });

  toggleBtn.addEventListener("click", () => {
    running = !running;
    if (running) {
      timer = setInterval(tick, 1200);
      toggleBtn.innerHTML = `${ICONS.spark} Scan läuft… (Pause)`;
      status.textContent = "xScan aktiv – Produkte in die Kamera halten.";
    } else {
      if (timer) { clearInterval(timer); timer = null; }
      toggleBtn.innerHTML = `${ICONS.spark} Scan fortsetzen`;
      status.textContent = "xScan pausiert.";
    }
  });

  overlay.querySelector("#btn-xscan-accept").addEventListener("click", async () => {
    const accepted = [...seen.values()].filter((i) => i.selected);
    if (!accepted.length) { toast("Noch nichts erkannt.", "warning"); return; }
    for (const s of accepted) {
      const existing = inventory.find((i) => i.name === s.name && (i.unit || "") === (s.unit || ""));
      if (existing && s.amount != null && existing.amount != null) {
        existing.amount = Math.round((existing.amount + s.amount) * 100) / 100;
      } else {
        inventory.unshift({
          id: uuid(),
          name: s.name,
          amount: s.amount,
          unit: s.unit || "",
          category: s.category || "Sonstiges",
          source: "camera",
          created_at: new Date().toISOString(),
        });
      }
    }
    await persistInventory();
    toast(`${accepted.length} Produkte in den Bestand übernommen.`, "success");
    seen.clear();
    renderList();
    renderContent();
  });
}
