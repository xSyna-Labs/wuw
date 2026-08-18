// ============================================================
// xSyna — OCR-Boost (v2) (Vorverarbeitung für die Kamera-Erkennung)
// ------------------------------------------------------------
// Läuft VOR extractFromOcr() und repariert typische Tesseract-
// Verwechslungen von Einheiten, damit Etiketten wie
//   „Wasser 1,5 I/1/L/|“   →   „Wasser 1,5 l“
//   „Nutella 450 9/4508“   →   „Nutella 450 g“
//   „750 m1/rnl“           →   „750 ml“
//   „1 k9“                 →   „1 kg“
// korrekt erkannt werden. Zusätzlich werden Mehrfach-Produkte in
// einer Zeile getrennt („2 Tomaten, 1 Gurke, 500 g Mehl“) und
// fehlende Mengen anhand typischer Packungsgrößen geschätzt.
// Reine MHD-/Datum-Zeilen werden entfernt, damit sie nicht als
// Bestand landen.
// ============================================================
import {
  extractFromOcr as baseExtractFromOcr,
  normalize,
  getKnownIngredients,
} from "./synaptic.js";

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Einheit „l“ wird von OCR gern als I, L, 1, | oder i gelesen –
// mit Dezimaltrenner („1,5“) ist Liter eindeutig.
function fixUnits(line) {
  let t = String(line || "").replace(/\s+/g, " ").trim();

  // Zahl+Einheit ohne Leerzeichen normalisieren (1kg -> 1 kg)
  t = t.replace(/\b(\d+(?:[.,]\d+)?)(kg|ml|oz|lb|stk|stück|dose|flasche|glas|bund|el|tl|packung|becher|rolle|liter|gramm|milliliter|kilogramm|g|l)\b/gi, "$1 $2");

  // ml: „750 m1 / m| / mi / rnl“ (komplette Zahl erfassen, nicht nur die letzte Ziffer)
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:rnl|m\s*[1|iIlL])(?=\s|$)/gi, "$1 ml");
  // kg: „1 k9 / kq / ko / k g“
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*k\s*[9gqoO](?=\s|$)/g, "$1 kg");
  // l: Dezimalzahl eindeutig Liter („1,5 I/L/1/|/i“)
  t = t.replace(/(\d[.,]\d+)\s*[I1|iL](?=\s|$)/g, "$1 l");
  // l: Ganzzahl + freistehendes I/1/| („1 I“, „2 1“) – EL/TL bleiben unberührt
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*[I|i](?=\s|$)/g, "$1 l");
  t = t.replace(/(\d+(?:[.,]\d+)?)\s+1\s*$/g, "$1 l");
  // l: Ganzzahl + freistehendes L („1 L“, „2 L“)
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*L(?=\s|$)/g, "$1 l");
  // g: „450 9 / 4509 / 450 8 / 450 q“ am Zeilenende
  t = t.replace(/(^|\s)(\d{2,4})\s*[9q8](?=\s|$)/g, "$1$2 g");

  return t.replace(/\s+/g, " ").trim();
}

// Klare MHD-/Haltbarkeits-Zeilen verwerfen (kein Produkt, kein Bestand).
const NOISE_LINE_RE = /^(?:mhd|mindestens\s+haltbar|haltbar\s+bis|zu\s+verbrauchen\s+bis|abgelaufen\s+am|haltbarkeitsdatum)\b.*$/i;

// Etikett-Beschriftungen vor der Mengenangabe entfernen:
// "Nettofüllmenge 1,5 l" / "Inhalt: 450 g" / "Abtropfgewicht 400 g"
// werden zu reinen Mengenzeilen, damit die Menge dem Produkt darüber
// zugeordnet wird und kein Pseudo-Artikel "Nettofüllmenge" entsteht.
const LABEL_NOISE_PREFIX = /^(?:netto[\s-]*(?:f\u00fcllmenge|fullmenge|inhalt)?|f\u00fcllmenge|fullmenge|inhalt|abtropfgewicht)\s*:?\s*/i;

function stripLabelNoise(line) {
  return String(line || "").replace(LABEL_NOISE_PREFIX, "").trim();
}

// Bekannte Zutaten (Wissensbasis) für die Mehrfach-Produkt-Trennung.
function buildSplitLabelForms() {
  const forms = new Set();
  for (const n of getKnownIngredients()) {
    const s = String(n || "").trim();
    if (s.length >= 3) forms.add(s);
    // Plural -> Singular ("Tomaten" -> "Tomate")
    if (s.endsWith("n") && s.length > 4) forms.add(s.slice(0, -1));
  }
  for (const extra of ["apfel", "ei", "tomate", "gurke", "zwiebel", "karotte", "banane", "orange", "zitrone", "kartoffel", "birne", "limette"]) {
    forms.add(extra);
  }
  return [...forms].sort((a, b) => b.length - a.length);
}

const KNOWN_LABELS = buildSplitLabelForms();

const KNOWN_NORMS = KNOWN_LABELS
  .map((n) => normalize(n))
  .filter((n) => n && n.length >= 3)
  .sort((a, b) => b.length - a.length);

function hasLabel(text) {
  const n = normalize(text);
  for (const name of KNOWN_NORMS) {
    let idx = n.indexOf(name);
    while (idx !== -1) {
      const beforeOk = idx === 0 || n[idx - 1] === " ";
      const end = idx + name.length;
      const afterOk = end >= n.length || n[end] === " ";
      if (beforeOk && afterOk) return true;
      idx = n.indexOf(name, idx + 1);
    }
  }
  return false;
}

// Mehrere Produkte in EINER OCR-Zeile erkennen und in Einzelzeilen
// zerlegen, damit jedes Produkt seine eigene Menge behält:
//   „2 Tomaten, 1 Gurke, 500 g Mehl“ → 3 Zeilen
//   „2x Tomaten 3x Zwiebeln“         → 2 Zeilen
//   „Tomaten 2 Zwiebeln“             → 2 Zeilen
function splitMultiProductLines(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  const out = [];
  const labelSrc = KNOWN_LABELS.map(escapeRegExp).join("|");
  const countSplitRe = labelSrc
    ? new RegExp("(" + labelSrc + ")\\s+(\\d+)\\s+(?=" + labelSrc + "\\b)", "gi")
    : null;

  for (const rawLine of lines) {
    let line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 2) continue;

    // „2x Tomaten“ / „3× Zwiebeln“ → Zählmenge ohne Multiplikator
    line = line.replace(/(\d+)\s*[x×]\s*/gi, "$1 ");

    // Klare Trennzeichen (Komma/Semikolon/…) mit >= 2 Labels → aufteilen
    const parts = line.split(/\s*(?:,|;|·|•|\|)\s*/).filter(Boolean);
    if (parts.length >= 2 && parts.filter(hasLabel).length >= 2) {
      out.push(...parts);
      continue;
    }

    // Zählmenge ohne Einheit zwischen zwei Labels („Tomaten 2 Zwiebeln“)
    if (countSplitRe) {
      const split = line.replace(countSplitRe, "$1\n$2 ");
      if (split !== line) {
        out.push(...split.split(/\n+/).map((p) => p.trim()).filter(Boolean));
        continue;
      }
    }

    out.push(line);
  }
  return out.join("\n");
}

export function preprocessOcrText(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2 && !NOISE_LINE_RE.test(line))
    .map(stripLabelNoise)
    .map(fixUnits)
    .filter(Boolean)
    .join("\n");
}

// Standardmengen je Einheit + Sonderfaelle (lokale "Mini-LLM"-Heuristik),
// wenn die OCR ein Etikett erkennt, aber kein Mass lesen konnte.
const ESTIMATED_UNIT = {
  l: 1, ml: 500, g: 500, kg: 1, lb: 1,
  "St\u00fcck": 1, Packung: 1, Pck: 1, Dose: 1, Bund: 1, Prise: 1,
  EL: 1, TL: 1, Tasse: 1, Scheibe: 1, Flasche: 1, Glas: 1,
  Zehe: 1, Beutel: 1, Becher: 1, Rolle: 1, Zweig: 1, Blatt: 1,
  Kopf: 1, Spritzer: 1, Schuss: 1, Stange: 1, "D\u00f6schen": 1,
  Portion: 1, Schale: 1, "T\u00fcte": 1, "P\u00e4ckchen": 1, "Fl\u00e4schchen": 1, Tube: 1, "W\u00fcrfel": 1,
};

// Typische Packungsgrößen, wenn das Label bekannt ist, aber keine Menge
// gelesen werden konnte. Verbessert die Schätzung für Alltagsprodukte.
const TYPICAL_SIZE = {
  wasser: { amount: 1.5, unit: "l" },
  milch: { amount: 1, unit: "l" },
  nutella: { amount: 450, unit: "g" },
  schokocreme: { amount: 400, unit: "g" },
  erdnussbutter: { amount: 350, unit: "g" },
  mehl: { amount: 1000, unit: "g" },
  zucker: { amount: 1000, unit: "g" },
  reis: { amount: 500, unit: "g" },
  nudeln: { amount: 500, unit: "g" },
  olivenöl: { amount: 500, unit: "ml" },
  joghurt: { amount: 500, unit: "g" },
  "käse": { amount: 200, unit: "g" },
  kaffee: { amount: 500, unit: "g" },
  haferflocken: { amount: 500, unit: "g" },
  tomaten: { amount: 500, unit: "g" },
  kartoffeln: { amount: 1000, unit: "g" },
  sahne: { amount: 200, unit: "ml" },
  butter: { amount: 250, unit: "g" },
  eier: { amount: 6, unit: "Stück" },
};

function estimateQuantity(name, unit) {
  const u = unit || "";
  const n = normalize(name);
  if (n === "eier") return { amount: 6, unit: "St\u00fcck", estimated: true };
  if (n === "butter" && (u === "g" || u === "")) return { amount: 250, unit: "g", estimated: true };
  if (n === "sahne" && (u === "ml" || u === "")) return { amount: 200, unit: "ml", estimated: true };
  const typical = TYPICAL_SIZE[n];
  if (typical && (u === "" || u === typical.unit)) {
    return { amount: typical.amount, unit: typical.unit, estimated: true };
  }
  if (ESTIMATED_UNIT[u] != null) return { amount: ESTIMATED_UNIT[u], unit: u, estimated: true };
  return { amount: null, unit: u, estimated: false };
}

// Gleiche Signatur wie synaptic.js, aber mit Vorverarbeitung davor
// und anschliessender Mengen-Schaetzung ("estimated" = in der UI als ca.).
export function extractFromOcr(raw, vocab) {
  const cleaned = preprocessOcrText(splitMultiProductLines(raw));
  const items = baseExtractFromOcr(cleaned, vocab);
  return items.map((it) => {
    if (!it.sure || it.amount != null) return it;
    const est = estimateQuantity(it.name, it.unit);
    if (est.amount == null) return it;
    return { ...it, amount: est.amount, unit: est.unit || it.unit, estimated: true };
  });
}
