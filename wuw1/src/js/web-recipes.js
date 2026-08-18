// ============================================================
// xSyna — Synaptic Foundation Model · Web-Rezepte & Generierung
// ------------------------------------------------------------
// Ergänzungsmodul zur lokalen Engine (src/js/synaptic.js):
//   • Web-Extraktion   – Rezepte von anderen Websites (JSON-LD/
//                        Schema.org bevorzugt, sonst DOM-Heuristik)
//   • Rezept-Generierung – konkrete Rezepte aus dem Bestand
//                        vorschlagen (Pfanne, Curry, Auflauf, …)
// Beides läuft vollständig lokal im Browser.
// ============================================================
import { normalize, parseLine, parseText, mergeItems, inventoryCoverage } from "./synaptic.js";

// ------------------------------------------------------------
// Web-Rezept-Extraktion
// ------------------------------------------------------------
function htmlDoc(html) {
  try {
    return new DOMParser().parseFromString(String(html || ""), "text/html");
  } catch {
    return null;
  }
}

function jsonLdRecipeNodes(doc) {
  const nodes = [];
  if (!doc) return nodes;
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    let data;
    try {
      data = JSON.parse(s.textContent);
    } catch {
      return;
    }
    const walk = (v) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      if (v["@graph"]) walk(v["@graph"]);
      const types = [].concat(v["@type"] || v.type || []);
      if (types.some((t) => String(t).toLowerCase() === "recipe")) nodes.push(v);
      if (v.mainEntity || v.itemListElement) walk(v.mainEntity || v.itemListElement);
    };
    walk(data);
  });
  return nodes;
}

function jsonLdInstructions(node) {
  const inst = node.recipeInstructions;
  const parts = [];
  const push = (t) => {
    const s = String(t || "").trim();
    if (s) parts.push(s);
  };
  const stepList = (arr) =>
    arr.forEach((x) => {
      if (typeof x === "string") push(x);
      else if (x) push(x.text || x.name);
    });
  if (Array.isArray(inst)) stepList(inst);
  else if (inst && typeof inst === "object") {
    if (Array.isArray(inst.itemListElement)) stepList(inst.itemListElement);
    else push(inst.text || inst.name);
  } else push(inst);
  return parts.join("\n");
}

function jsonLdServings(node) {
  const raw = node.recipeYield;
  if (raw == null) return 2;
  const vals = [].concat(raw);
  for (const v of vals) {
    const m = String(v).match(/(\d+(?:[.,]\d+)?)/);
    if (m) {
      const n = Math.round(Number(m[1].replace(",", ".")));
      if (n > 0 && n < 100) return n;
    }
  }
  return 2;
}

function jsonLdRecipe(node, url) {
  const ingredients = mergeItems(
    [].concat(node.recipeIngredient || node.ingredients || [])
      .map((raw) => parseLine(String(raw).trim()))
      .filter((i) => i.name && i.name.length >= 2)
  ).map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, category: i.category }));
  return {
    title: String(node.name || "").trim().slice(0, 120) || "Unbenanntes Rezept",
    servings: jsonLdServings(node),
    ingredients,
    instructions: jsonLdInstructions(node).slice(0, 4000),
    tags: [].concat(node.recipeCategory || node.keywords || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 6),
    source: "jsonld",
    sourceUrl: url || "",
  };
}

function heuristicRecipe(doc) {
  if (!doc || !doc.body) return null;
  const titleEl = doc.querySelector("h1");
  const title = (titleEl?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) || "Unbenanntes Rezept";

  const ingLines = [];
  const selectors = [
    ".recipe-ingredients li",
    ".ingredients li",
    ".ingredients-list li",
    "[class*='ingredient'] li",
    "[class*='zutat'] li",
    "ul[class*='ingredient'] li",
    "ul[class*='zutaten'] li",
  ];
  doc.querySelectorAll(selectors.join(",")).forEach((li) => {
    const t = (li.textContent || "").replace(/\s+/g, " ").trim();
    if (t && t.length >= 2 && t.length <= 120) ingLines.push(t);
  });

  // Fallback: kurze Zeilen, die wie Zutaten aussehen
  if (!ingLines.length) {
    const seen = new Set();
    (doc.body.innerText || "").split(/\r?\n/).forEach((l) => {
      const t = l.replace(/\s+/g, " ").trim();
      if (!t || t.length < 2 || t.length > 120 || seen.has(t)) return;
      seen.add(t);
      if (/^\d/.test(t) || parseLine(t).confidence >= 0.5) ingLines.push(t);
    });
  }

  const items = mergeItems(
    ingLines.map((l) => parseLine(l)).filter((i) => i.name && i.name.length >= 2)
  ).map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, category: i.category }));

  const steps = [];
  doc.querySelectorAll(
    "ol[class*='instruction'] li, ol[class*='step'] li, .recipe-steps li, .steps li, [class*='instruction'] li, [class*='zubereitung'] li"
  ).forEach((li) => {
    const t = (li.textContent || "").replace(/\s+/g, " ").trim();
    if (t && t.length >= 8) steps.push(t);
  });

  return {
    title,
    servings: 2,
    ingredients: items,
    instructions: steps.slice(0, 20).join("\n"),
    tags: [],
    source: "website",
    sourceUrl: "",
  };
}

// HTML einer Rezeptseite → Liste von Rezept-Kandidaten
export function extractRecipeFromHtml(html, url) {
  const doc = htmlDoc(html);
  const candidates = [];
  for (const node of jsonLdRecipeNodes(doc)) {
    const r = jsonLdRecipe(node, url);
    if (r.ingredients.length) candidates.push(r);
  }
  if (!candidates.length) {
    const h = heuristicRecipe(doc);
    if (h && h.ingredients.length) candidates.push(h);
  }
  const seen = new Set();
  return candidates.filter((c) => {
    const key = c.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ------------------------------------------------------------
// Rezept-Generierung: Vorschläge aus dem aktuellen Bestand
// ------------------------------------------------------------
// Salz/Pfeffer/Öl gelten als Grundausstattung und fließen nicht
// in die Bestands-Abdeckung ein.
const STAPLES = new Set(["Salz", "Pfeffer", "Olivenöl", "Zucker", "Wasser", "Sonnenblumenöl"]);
const SWEET_FRUITS = new Set([
  "Bananen", "Äpfel", "Birnen", "Orangen", "Erdbeeren", "Himbeeren", "Blaubeeren", "Brombeeren",
  "Weintrauben", "Kirschen", "Pfirsiche", "Nektarinen", "Aprikosen", "Pflaumen", "Mango", "Ananas",
  "Kiwi", "Melone", "Datteln", "Feigen",
]);
const PROTEIN_NAMES = [
  "Hähnchen", "Rinderhack", "Rindfleisch", "Schweinefleisch", "Putenbrust", "Lachs", "Thunfisch",
  "Garnelen", "Seelachs", "Schnitzel", "Steak", "Gyros", "Tofu", "Speck", "Schinken", "Salami",
  "Wurst", "Chicken Wings", "Frikadellen",
];

const GEN_AMOUNT = {
  "Nudeln": [200, "g"], "Spätzle": [250, "g"], "Tortellini": [300, "g"], "Gnocchi": [300, "g"],
  "Lasagneplatten": [8, "Stück"], "Reis": [150, "g"], "Kartoffeln": [500, "g"], "Süßkartoffeln": [500, "g"],
  "Wraps": [4, "Stück"], "Brot": [2, "Scheibe"], "Brötchen": [4, "Stück"], "Baguette": [1, "Stück"],
  "Hähnchen": [250, "g"], "Rinderhack": [300, "g"], "Rindfleisch": [300, "g"], "Schweinefleisch": [300, "g"],
  "Putenbrust": [250, "g"], "Lachs": [250, "g"], "Thunfisch": [200, "g"], "Garnelen": [200, "g"],
  "Seelachs": [250, "g"], "Schnitzel": [300, "g"], "Steak": [300, "g"], "Gyros": [250, "g"],
  "Tofu": [250, "g"], "Speck": [100, "g"], "Schinken": [100, "g"], "Salami": [100, "g"],
  "Wurst": [4, "Stück"], "Chicken Wings": [500, "g"], "Frikadellen": [4, "Stück"], "Eier": [2, "Stück"],
  "Butter": [20, "g"], "Käse": [100, "g"], "Mozzarella": [125, "g"], "Feta": [100, "g"],
  "Sahne": [200, "ml"], "Crème fraîche": [150, "g"], "Schmand": [150, "g"], "Joghurt": [150, "g"],
  "Passierte Tomaten": [400, "ml"], "Gehackte Tomaten": [1, "Dose"], "Kokosmilch": [200, "ml"],
  "Sojasauce": [2, "EL"], "Tomatenmark": [1, "EL"], "Pesto": [3, "EL"], "Brühe": [500, "ml"],
  "Olivenöl": [1, "EL"], "Salz": [1, "Prise"], "Pfeffer": [1, "Prise"], "Paprikapulver": [1, "TL"],
  "Currypulver": [1, "TL"], "Currypaste": [1, "EL"], "Kreuzkümmel": [1, "TL"], "Oregano": [1, "TL"],
  "Thymian": [1, "TL"], "Chilipulver": [1, "TL"], "Muskat": [1, "Prise"], "Zimt": [1, "TL"],
  "Kidneybohnen": [1, "Dose"], "Weiße Bohnen": [1, "Dose"], "Kichererbsen": [1, "Dose"], "Mais": [1, "Dose"],
  "Avocado": [1, "Stück"], "Tomaten": [2, "Stück"], "Zucchini": [1, "Stück"], "Paprika": [1, "Stück"],
  "Möhren": [2, "Stück"], "Zwiebeln": [1, "Stück"], "Knoblauch": [2, "Zehe"], "Lauch": [1, "Stück"],
  "Brokkoli": [1, "Stück"], "Blumenkohl": [1, "Stück"], "Champignons": [150, "g"], "Spinat": [100, "g"],
  "Frischkäse": [100, "g"], "Zitronen": [1, "Stück"], "Limetten": [1, "Stück"], "Gurken": [1, "Stück"],
  "Haferflocken": [60, "g"], "Milch": [200, "ml"], "Hafermilch": [200, "ml"], "Mandelmilch": [200, "ml"],
  "Sojamilch": [200, "ml"], "Milchreis": [100, "g"], "Honig": [1, "EL"], "Marmelade": [2, "EL"],
};

function genIng(name, servings, fallbackUnit) {
  const known = GEN_AMOUNT[name];
  let amount = known ? known[0] : null;
  let unit = known ? known[1] : (fallbackUnit || "Stück");
  if (amount == null) {
    if (unit === "g") amount = 150;
    else if (unit === "ml") amount = 200;
    else if (unit === "l") amount = 0.25;
    else amount = 1;
  }
  const factor = servings / 2;
  amount = factor !== 1 ? Math.round(amount * factor * 100) / 100 : amount;
  return { name, amount, unit };
}

function pick(inv, names) {
  return inv.find((i) => names.includes(i.name)) || null;
}

function savoryVegs(inv, n, exclude = []) {
  const excl = new Set(exclude.filter(Boolean));
  return inv.filter((i) => i.category === "Obst & Gemüse" && !SWEET_FRUITS.has(i.name) && !excl.has(i.name)).slice(0, n);
}

function buildPfanne(inv) {
  const base = pick(inv, ["Nudeln", "Spätzle", "Reis", "Kartoffeln"]);
  const protein = pick(inv, PROTEIN_NAMES);
  const vegs = savoryVegs(inv, 2, [base && base.name, protein && protein.name]);
  if (!protein && !vegs.length) return null;
  const sauce = pick(inv, ["Sojasauce", "Kokosmilch", "Passierte Tomaten", "Sahne"]);
  const ing = [];
  if (base) ing.push(genIng(base.name, 2));
  if (protein) ing.push(genIng(protein.name, 2));
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  if (sauce) ing.push(genIng(sauce.name, 2, sauce.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  if (pick(inv, ["Paprikapulver"])) ing.push(genIng("Paprikapulver", 2));
  const parts = [];
  if (protein) parts.push(protein.name);
  parts.push(...vegs.map((v) => v.name));
  const title = (parts.length ? parts.join("-") : "Gemüse") + "-Pfanne" + (base ? " mit " + base.name : "");
  const steps = [];
  if (base) steps.push(`${base.name} nach Packungsanweisung zubereiten.`);
  if (protein) steps.push(`${protein.name} in mundgerechte Stücke schneiden und im heißen Öl kräftig anbraten.`);
  if (vegs.length) steps.push(`Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) putzen, klein schneiden und mitbraten.`);
  if (sauce) steps.push(`${sauce.name} angießen, mit Salz und Pfeffer${pick(inv, ["Paprikapulver"]) ? " und Paprikapulver" : ""} würzen und 5–8 Minuten fertig garen.`);
  else steps.push("Mit Salz und Pfeffer würzen und 5–8 Minuten garen.");
  steps.push(base ? `Mit ${base.name} servieren.` : "Direkt aus der Pfanne servieren.");
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Pfanne", "Schnell"] };
}

function buildCurry(inv) {
  const base = pick(inv, ["Reis"]);
  const sauce = pick(inv, ["Kokosmilch", "Currypaste"]);
  if (!sauce) return null;
  const protein = pick(inv, PROTEIN_NAMES);
  const vegs = savoryVegs(inv, 2);
  if (!protein && !vegs.length) return null;
  const ing = [];
  if (base) ing.push(genIng("Reis", 2));
  if (protein) ing.push(genIng(protein.name, 2));
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  ing.push(genIng(sauce.name, 2, sauce.unit), genIng("Currypulver", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  if (base) ing.push(genIng("Olivenöl", 2));
  const title = (protein ? protein.name + "-" : "") + "Curry" + (base ? " mit Reis" : "");
  const steps = [];
  if (base) steps.push("Reis nach Packungsanweisung kochen.");
  if (protein) steps.push(`${protein.name} in Stücke schneiden und in heißem Öl anbraten.`);
  if (vegs.length) steps.push(`Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) zugeben und kurz mitbraten.`);
  steps.push(`${sauce.name} angießen, mit Currypulver, Salz und Pfeffer würzen und 10 Minuten sanft köcheln lassen.`);
  if (base) steps.push("Mit Reis servieren.");
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Curry", "Eintopf"] };
}

function buildAuflauf(inv) {
  const base = pick(inv, ["Nudeln", "Kartoffeln", "Spätzle", "Tortellini"]);
  const cheese = pick(inv, ["Käse", "Mozzarella", "Feta", "Sahne", "Schmand", "Crème fraîche"]);
  if (!base || !cheese) return null;
  const vegs = savoryVegs(inv, 2, [base.name]);
  if (!vegs.length) return null;
  const ing = [];
  ing.push(genIng(base.name, 2));
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  ing.push(genIng(cheese.name, 2, cheese.unit), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${vegs.map((v) => v.name).join("-")}-${base.name}-Auflauf`;
  const steps = [
    `${base.name} bissfest vorkochen und abtropfen lassen.`,
    `Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) klein schneiden.`,
    `Alles in eine Auflaufform schichten, mit ${cheese.name} übergießen/bestreuen und mit Salz und Pfeffer würzen.`,
    "Bei 190 °C ca. 25 Minuten goldbraun backen.",
  ];
  return { title, servings: 3, ingredients: ing, instructions: steps.join("\n"), tags: ["Auflauf", "Ofen"] };
}

function buildSuppe(inv) {
  const broth = pick(inv, ["Brühe"]);
  const kartoffeln = pick(inv, ["Kartoffeln"]);
  const vegs = savoryVegs(inv, 2, kartoffeln ? [kartoffeln.name] : []);
  if (!broth || (!kartoffeln && !vegs.length)) return null;
  const ing = [];
  if (kartoffeln) ing.push(genIng("Kartoffeln", 4));
  for (const v of vegs) ing.push(genIng(v.name, 4, v.unit));
  ing.push(genIng("Brühe", 4), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = kartoffeln ? "Kartoffelsuppe" : "Gemüsesuppe";
  const steps = [
    kartoffeln ? "Kartoffeln schälen und würfeln." : "Gemüse putzen und klein schneiden.",
    "Alles in einen Topf geben, mit Brühe aufgießen und ca. 25 Minuten weich kochen.",
    `Mit Salz und Pfeffer abschmecken${kartoffeln ? " und nach Wunsch fein pürieren" : ""}.`,
  ];
  return { title, servings: 4, ingredients: ing, instructions: steps.join("\n"), tags: ["Suppe", "Eintopf"] };
}

function buildSalat(inv) {
  const vegs = savoryVegs(inv, 3);
  if (vegs.length < 2) return null;
  const cheese = pick(inv, ["Feta", "Käse", "Mozzarella"]);
  const ing = [];
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  if (cheese) ing.push(genIng(cheese.name, 2, cheese.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${vegs.map((v) => v.name).join("-")}-Salat`;
  const steps = [
    `Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) waschen und in mundgerechte Stücke schneiden.`,
    cheese ? `Gewürfelten ${cheese.name} unterheben.` : "",
    "Aus Olivenöl, Salz und Pfeffer ein Dressing rühren und unterheben.",
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.filter(Boolean).join("\n"), tags: ["Salat", "Frisch"] };
}

function buildPasta(inv) {
  const base = pick(inv, ["Nudeln", "Spätzle", "Tortellini", "Gnocchi"]);
  if (!base) return null;
  const sauce = pick(inv, ["Pesto", "Passierte Tomaten", "Sahne", "Käse", "Mozzarella", "Thunfisch"]);
  if (!sauce) return null;
  const ing = [];
  ing.push(genIng(base.name, 2));
  ing.push(genIng(sauce.name, 2, sauce.unit));
  if (sauce.name === "Thunfisch") ing.push(genIng("Zwiebeln", 2));
  ing.push(genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${base.name} mit ${sauce.name === "Passierte Tomaten" ? "Tomatensauce" : sauce.name}`;
  const steps = [
    `${base.name} al dente kochen, etwas Nudelwasser aufheben.`,
    sauce.name === "Thunfisch"
      ? "Zwiebel fein würfeln und andünsten, Thunfisch zugeben."
      : `${sauce.name} in einem Topf erwärmen.`,
    `Sauce mit etwas Nudelwasser verfeinern, mit Salz und Pfeffer würzen und unter die ${base.name.toLowerCase()} heben.`,
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Pasta", "Schnell"] };
}

function buildEier(inv) {
  const eier = pick(inv, ["Eier"]);
  if (!eier) return null;
  const filling = pick(inv, ["Käse", "Feta", "Tomaten", "Spinat", "Champignons", "Frühlingszwiebeln", "Paprika"]);
  const brot = pick(inv, ["Brot", "Brötchen", "Baguette"]);
  const ing = [];
  ing.push(genIng("Eier", 2));
  if (filling) ing.push(genIng(filling.name, 2, filling.unit));
  if (brot) ing.push(genIng(brot.name, 2, brot.unit));
  ing.push(genIng("Butter", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `Omelett${filling ? " mit " + filling.name : ""}`;
  const steps = [
    "Eier verquirlen und mit Salz und Pfeffer würzen.",
    filling ? `${filling.name} klein schneiden und kurz anbraten.` : "",
    filling
      ? "Eier in der Pfanne stocken lassen, Füllung darauf verteilen und zusammenklappen."
      : "Eier in der Pfanne von beiden Seiten goldbraun braten.",
    brot ? `Mit ${brot.name} servieren.` : "",
  ];
  return { title, servings: 1, ingredients: ing, instructions: steps.filter(Boolean).join("\n"), tags: ["Frühstück", "Schnell"] };
}

function buildOfen(inv) {
  const vegs = savoryVegs(inv, 3);
  if (vegs.length < 2) return null;
  const feta = pick(inv, ["Feta", "Käse"]);
  const ing = [];
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  if (feta) ing.push(genIng(feta.name, 2, feta.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2), genIng("Paprikapulver", 2));
  const title = "Ofengemüse" + (feta ? " mit " + feta.name : "");
  const steps = [
    `Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) in grobe Stücke schneiden.`,
    "Mit Olivenöl, Salz, Pfeffer und Paprikapulver mischen und auf einem Blech verteilen.",
    `Bei 200 °C ca. 25 Minuten backen.${feta ? ` Zum Schluss ${feta.name} darüberbröseln und kurz weitergaren.` : ""}`,
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Ofen", "Vegetarisch"] };
}

function buildBowl(inv) {
  const reis = pick(inv, ["Reis"]);
  if (!reis) return null;
  const toppings = inv
    .filter((i) => ["Kidneybohnen", "Weiße Bohnen", "Kichererbsen", "Mais", "Avocado", "Tomaten", "Gurken", "Feta", "Eier"].includes(i.name))
    .slice(0, 3);
  if (!toppings.length) return null;
  const ing = [];
  ing.push(genIng("Reis", 2));
  for (const t of toppings) ing.push(genIng(t.name, 2, t.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${toppings.map((t) => t.name).join("-")}-Bowl mit Reis`;
  const steps = [
    "Reis nach Packungsanweisung kochen.",
    `${toppings.map((t) => t.name).join(", ")} vorbereiten (würfeln, abtropfen, garen).`,
    "Alles in Schüsseln schichten, mit Salz, Pfeffer und Olivenöl abschmecken.",
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Bowl", "Reis"] };
}

function buildWrap(inv) {
  const wrap = pick(inv, ["Wraps"]);
  if (!wrap) return null;
  const filling = pick(inv, ["Käse", "Feta", "Hähnchen", "Eier", "Thunfisch", "Avocado"]);
  const vegs = savoryVegs(inv, 2);
  if (!filling && !vegs.length) return null;
  const ing = [];
  ing.push(genIng("Wraps", 2));
  if (filling) ing.push(genIng(filling.name, 2, filling.unit));
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  const fillNames = [];
  if (filling) fillNames.push(filling.name);
  fillNames.push(...vegs.map((v) => v.name));
  const title = "Wrap mit " + fillNames.join(" & ");
  const steps = [
    filling ? `${filling.name} vorbereiten und kurz anbraten/garen.` : "",
    `Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) in Streifen schneiden.`,
    "Wraps mit der Füllung belegen, würzen, aufrollen und in der Pfanne von beiden Seiten knusprig braten.",
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.filter(Boolean).join("\n"), tags: ["Schnell", "Wrap"] };
}

function buildToast(inv) {
  const base = pick(inv, ["Brot", "Brötchen", "Baguette", "Wraps", "Pita"]);
  const topping = pick(inv, ["Käse", "Schinken", "Salami", "Speck", "Eier", "Avocado", "Frischkäse", "Pesto", "Thunfisch", "Marmelade", "Honig"]);
  if (!base || !topping) return null;
  const sweet = topping.name === "Marmelade" || topping.name === "Honig";
  const ing = [genIng(base.name, 2), genIng(topping.name, 2, topping.unit)];
  if (topping.name === "Eier") ing.push(genIng("Butter", 2));
  if (!sweet) ing.push(genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${base.name} mit ${topping.name}`;
  const steps = [
    `${base.name} toasten oder aufbacken.`,
    topping.name === "Eier" ? "Eier braten oder kochen und auflegen." : `${topping.name} auf dem ${base.name.toLowerCase()} verteilen.`,
    sweet ? "Direkt genießen." : "Mit Salz und Pfeffer abschmecken.",
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Schnell", "Brotzeit"] };
}

function buildOats(inv) {
  const oats = pick(inv, ["Haferflocken"]);
  const liquid = pick(inv, ["Milch", "Joghurt", "Hafermilch", "Mandelmilch", "Sojamilch"]);
  if (!oats || !liquid) return null;
  const fruit = pick(inv, ["Bananen", "Äpfel", "Himbeeren", "Blaubeeren", "Erdbeeren"]);
  const ing = [genIng("Haferflocken", 1), genIng(liquid.name, 1, liquid.unit)];
  if (fruit) ing.push(genIng(fruit.name, 1, fruit.unit));
  if (pick(inv, ["Honig"])) ing.push(genIng("Honig", 1));
  const title = "Haferflocken-" + (liquid.name === "Joghurt" ? "Joghurt" : "Porridge") + (fruit ? " mit " + fruit.name : "");
  const steps = [
    `Haferflocken mit ${liquid.name.toLowerCase()} verrühren.`,
    fruit ? `${fruit.name} klein schneiden und unterheben.` : "Kurz ziehen lassen und genießen.",
    pick(inv, ["Honig"]) ? "Nach Belieben mit Honig süßen." : "Nach Belieben süßen.",
  ];
  return { title, servings: 1, ingredients: ing, instructions: steps.join("\n"), tags: ["Frühstück", "Schnell"] };
}

function buildMilchreis(inv) {
  const milk = pick(inv, ["Milch"]);
  const rice = pick(inv, ["Milchreis", "Reis"]);
  if (!milk || !rice) return null;
  const ing = [genIng(rice.name, 2, "g"), genIng("Milch", 2), genIng("Zucker", 2)];
  if (pick(inv, ["Zimt"])) ing.push(genIng("Zimt", 2));
  const steps = [
    `Milch aufkochen, ${rice.name.toLowerCase()} einrühren und bei kleiner Hitze unter Rühren quellen lassen.`,
    "Mit Zucker (und Zimt) abschmecken und warm servieren.",
  ];
  return { title: "Milchreis", servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Süß", "Frühstück"] };
}

const GENERATORS = [buildPfanne, buildCurry, buildAuflauf, buildSuppe, buildSalat, buildPasta, buildEier, buildOfen, buildBowl, buildWrap, buildToast, buildOats, buildMilchreis];

// Bestand → konkrete Rezept-Vorschläge (inkl. Bestands-Abdeckung)
export function generateRecipeSuggestions(inventory, { limit = 4 } = {}) {
  const inv = inventory || [];
  if (!inv.length) return [];
  const seen = new Set();
  const out = [];
  for (const gen of GENERATORS) {
    try {
      const recipe = gen(inv);
      if (!recipe) continue;
      const key = recipe.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const nonStaples = recipe.ingredients.filter((i) => !STAPLES.has(i.name));
      const cov = inventoryCoverage(nonStaples, inv);
      if (cov.have === 0) continue; // nutzt nichts aus dem Bestand
      out.push({
        recipe: {
          ...recipe,
          id: "sugg-" + out.length + "-" + Date.now(),
          is_public: false,
          generated: true,
          created_at: new Date().toISOString(),
        },
        ...cov,
      });
    } catch {
      // einzelner Vorschlag übersprungen
    }
  }
  out.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);
  return out.slice(0, limit);
}

// ============================================================
// Web-Rezept-Quellen mit öffentlicher API (kostenlos, ohne Schlüssel)
// ------------------------------------------------------------
// Definierte Quellen, die eine offene JSON-API anbieten. Neue
// Quellen können hier ergänzt werden (gleiche Schnittstelle).
// ============================================================
const THEMEALDB = "https://www.themealdb.com/api/json/v1/1/";
const THECOCKTAILDB = "https://www.thecocktaildb.com/api/json/v1/1/";
const DUMMYJSON = "https://dummyjson.com/";

// Gemeinsamer Zutaten-Extraktor für die „…DB“-Familie (strIngredient1..N)
function dbIngredients(m, max) {
  const ings = [];
  for (let i = 1; i <= max; i++) {
    const ing = String(m["strIngredient" + i] || "").trim();
    const meas = String(m["strMeasure" + i] || "").trim();
    if (!ing || ing === "0" || /^[\s]*$/.test(ing)) continue;
    const line = meas && meas !== "0" ? `${meas} ${ing}` : ing;
    const p = parseLine(line);
    if (!p.name || p.name.length < 2) continue;
    ings.push({ name: p.name, amount: p.amount, unit: p.unit, category: p.category });
  }
  return mergeItems(ings);
}

function themealdbMeal(m) {
  return {
    id: "themealdb-" + m.idMeal,
    title: String(m.strMeal || "").trim().slice(0, 120) || "Unbenanntes Rezept",
    servings: Math.max(1, Math.min(24, Number(m.strServings) || 2)),
    ingredients: dbIngredients(m, 20),
    instructions: String(m.strInstructions || "").trim().slice(0, 5000),
    tags: [String(m.strCategory || "").trim(), String(m.strArea || "").trim()].filter(Boolean).slice(0, 6),
    image: String(m.strMealThumb || "").trim(),
    sourceUrl: String(m.strSource || m.strYoutube || "").trim(),
    provider: "TheMealDB",
  };
}

function cocktaildbDrink(m) {
  return {
    id: "cocktaildb-" + m.idDrink,
    title: String(m.strDrink || "").trim().slice(0, 120) || "Unbenannter Drink",
    servings: 1,
    ingredients: dbIngredients(m, 15),
    instructions: String(m.strInstructions || "").trim().slice(0, 5000),
    tags: [String(m.strCategory || "").trim(), String(m.strAlcoholic || "").trim()].filter(Boolean).slice(0, 6),
    image: String(m.strDrinkThumb || "").trim(),
    sourceUrl: "",
    provider: "TheCocktailDB",
  };
}

function dummyjsonRecipe(m) {
  const ingredients = mergeItems(
    [].concat(m.ingredients || [])
      .map((raw) => {
        const line = String(raw || "").trim();
        if (!line || line.length < 2) return null;
        const p = parseLine(line);
        if (!p.name || p.name.length < 2) return null;
        return { name: p.name, amount: p.amount, unit: p.unit, category: p.category };
      })
      .filter(Boolean)
  ).map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, category: i.category }));
  return {
    id: "dummyjson-" + m.id,
    title: String(m.name || "").trim().slice(0, 120) || "Unbenanntes Rezept",
    servings: Math.max(1, Math.min(24, Number(m.servings) || 2)),
    ingredients,
    instructions: [].concat(m.instructions || []).map((s) => String(s || "").trim()).filter(Boolean).join("\n").slice(0, 5000),
    tags: [].concat(m.cuisine || [], m.tags || [], m.mealType || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 6),
    image: String(m.image || "").trim(),
    sourceUrl: "",
    provider: "DummyJSON",
  };
}

// ------------------------------------------------------------
// xSyna Rezepte — kuratierte Klassiker, komplett offline
// (dritte „Rezeptseite“ ohne Schlüssel und ohne Netz nötig)
// ------------------------------------------------------------
const CURATED_RECIPES = [
  {
    title: "Käsespätzle",
    servings: 3,
    tags: ["Klassiker", "Vegetarisch", "Pasta"],
    ingredients: "500 g Spätzle\n200 g Käse\n2 Zwiebeln\n50 g Butter\nSchnittlauch\nSalz\nPfeffer",
    instructions: "Spätzle nach Packungsanweisung kochen und abtropfen lassen. In einer Pfanne schichtweise Spätzle und Käse einschichten, Butterflöckchen verteilen und kurz schmelzen lassen. Mit gerösteten Zwiebeln und Schnittlauch servieren.",
  },
  {
    title: "Gulaschsuppe",
    servings: 4,
    tags: ["Suppe", "Eintopf", "Klassiker"],
    ingredients: "500 g Rindfleisch\n2 Zwiebeln\n2 Paprika\n2 EL Tomatenmark\n1 EL Paprikapulver\n1 l Brühe\n2 Knoblauchzehen\n2 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Fleisch würfeln und im Öl scharf anbraten. Zwiebeln, Knoblauch und Paprika zugeben. Tomatenmark und Paprikapulver einrühren, Brühe angießen und 1,5 Stunden leise schmoren. Mit Salz und Pfeffer abschmecken.",
  },
  {
    title: "Kartoffelpuffer",
    servings: 4,
    tags: ["Klassiker", "Vegetarisch", "Schnell"],
    ingredients: "1 kg Kartoffeln\n2 Eier\n2 EL Mehl\n1 Zwiebel\nSalz\nPfeffer\n3 EL Pflanzenöl",
    instructions: "Kartoffeln und Zwiebel reiben, mit Eiern und Mehl verrühren und würzen. In heißem Öl portionsweise goldbraun ausbacken. Mit Apfelmus oder Kräuterquark servieren.",
  },
  {
    title: "Erbsensuppe",
    servings: 4,
    tags: ["Suppe", "Eintopf", "Winter"],
    ingredients: "500 g Erbsen\n2 Möhren\n1 Zwiebel\n1 Stange Lauch\n1 l Brühe\n2 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Zwiebel und Lauch im Öl anschwitzen. Möhren und Erbsen zugeben, Brühe angießen und 40 Minuten leise köcheln. Mit Salz und Pfeffer abschmecken.",
  },
  {
    title: "Apfelkuchen",
    servings: 8,
    tags: ["Backen", "Süß", "Dessert"],
    ingredients: "4 Äpfel\n200 g Mehl\n100 g Butter\n100 g Zucker\n2 Eier\n1 Packung Backpulver\n1 TL Zimt",
    instructions: "Butter, Zucker und Eier schaumig rühren, Mehl mit Backpulver unterheben. Äpfel in Spalten schneiden und unter den Teig heben. In eine Form füllen, mit Zimt bestreuen und bei 175 °C 45 Minuten backen.",
  },
  {
    title: "Maultaschen-Pfanne",
    servings: 2,
    tags: ["Schnell", "Pfanne", "Vegetarisch"],
    ingredients: "400 g Maultaschen\n1 Zwiebel\n2 Eier\n2 EL Butter\nSchnittlauch\nSalz\nPfeffer",
    instructions: "Maultaschen in Scheiben schneiden und mit Zwiebeln in Butter anbraten. Eier verquirlen, darübergeben und stocken lassen. Mit Salz, Pfeffer und Schnittlauch servieren.",
  },
  {
    title: "Milchreis",
    servings: 2,
    tags: ["Süß", "Frühstück", "Klassiker"],
    ingredients: "200 g Milchreis\n1 l Milch\n2 EL Zucker\n1 TL Zimt\n1 Prise Salz",
    instructions: "Milch mit Zucker und Salz aufkochen, Reis einrühren und bei kleiner Hitze unter Rühren 30 Minuten quellen lassen. Mit Zimt und Zucker servieren.",
  },
  {
    title: "Bohneneintopf",
    servings: 4,
    tags: ["Eintopf", "Winter", "Klassiker"],
    ingredients: "2 Dosen Grüne Bohnen\n500 g Kartoffeln\n1 Zwiebel\n100 g Speck\n1 l Brühe\n1 EL Paprikapulver\nSalz\nPfeffer",
    instructions: "Speck und Zwiebeln anbraten, Kartoffelwürfel und Bohnen zugeben. Brühe angießen und 25 Minuten köcheln. Mit Paprikapulver, Salz und Pfeffer würzen.",
  },
  {
    title: "Zwiebelkuchen",
    servings: 6,
    tags: ["Backen", "Klassiker", "Herzhaft"],
    ingredients: "1 Packung Pizzateig\n4 Zwiebeln\n100 g Speck\n200 g Schmand\n3 Eier\nSalz\nPfeffer\nKümmel",
    instructions: "Teig ausrollen und in eine Form legen. Zwiebeln und Speck anbraten, mit Schmand und Eiern verrühren und würzen. Auf den Teig geben und bei 200 °C 35 Minuten backen.",
  },
  {
    title: "Semmelknödel",
    servings: 4,
    tags: ["Beilage", "Vegetarisch", "Klassiker"],
    ingredients: "6 Brötchen\n250 ml Milch\n2 Eier\n1 Zwiebel\nPetersilie\nSalz\nMuskat",
    instructions: "Brötchen würfeln und mit warmer Milch übergießen. Zwiebelwürfel, Eier und Petersilie zugeben, würzen und zu Knödeln formen. In siedendem Wasser 20 Minuten gar ziehen lassen.",
  },
];

function curatedRecipe(r) {
  return {
    id: "xsyna-" + String(r.title).toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-"),
    title: r.title,
    servings: r.servings || 2,
    ingredients: mergeItems(parseText(r.ingredients)).map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, category: i.category })),
    instructions: r.instructions || "",
    tags: r.tags || [],
    image: "",
    sourceUrl: "",
    provider: "xSyna",
  };
}

export const WEB_PROVIDERS = [
  {
    id: "themealdb",
    name: "TheMealDB",
    tagline: "Rezepte aus aller Welt – kostenlos, kein Schlüssel",
    searchUrl: (q) => THEMEALDB + "search.php?s=" + encodeURIComponent(q),
    ingredientUrl: (q) => THEMEALDB + "filter.php?i=" + encodeURIComponent(q),
    categoryUrl: (c) => THEMEALDB + "filter.php?c=" + encodeURIComponent(c),
    randomUrl: () => THEMEALDB + "random.php",
    lookupUrl: (id) => THEMEALDB + "lookup.php?i=" + encodeURIComponent(id),
    categoriesUrl: () => THEMEALDB + "list.php?c=list",
    parseMeals: (json) => (json && json.meals) || [],
    parseMeal: (json) => (json && json.meals && json.meals[0]) || null,
    parseCategories: (json) => ((json && json.meals) || []).map((m) => String(m.strCategory || "").trim()).filter(Boolean),
    idOf: (m) => m.idMeal,
    toRecipe: themealdbMeal,
  },
  {
    id: "cocktaildb",
    name: "TheCocktailDB",
    tagline: "Getränke & Cocktails – kostenlos, kein Schlüssel",
    searchUrl: (q) => THECOCKTAILDB + "search.php?s=" + encodeURIComponent(q),
    ingredientUrl: (q) => THECOCKTAILDB + "filter.php?i=" + encodeURIComponent(q),
    categoryUrl: (c) => THECOCKTAILDB + "filter.php?c=" + encodeURIComponent(c),
    randomUrl: () => THECOCKTAILDB + "random.php",
    lookupUrl: (id) => THECOCKTAILDB + "lookup.php?i=" + encodeURIComponent(id),
    categoriesUrl: () => THECOCKTAILDB + "list.php?c=list",
    parseMeals: (json) => (json && json.drinks) || [],
    parseMeal: (json) => (json && json.drinks && json.drinks[0]) || null,
    parseCategories: (json) => ((json && json.drinks) || []).map((m) => String(m.strCategory || "").trim()).filter(Boolean),
    idOf: (m) => m.idDrink,
    toRecipe: cocktaildbDrink,
  },
  {
    id: "dummyjson",
    name: "DummyJSON",
    tagline: "50 internationale Rezepte – kostenlos, kein Schlüssel",
    fullOnList: true,
    searchUrl: (q) => DUMMYJSON + "recipes/search?q=" + encodeURIComponent(q),
    ingredientUrl: (q) => DUMMYJSON + "recipes/search?q=" + encodeURIComponent(q),
    categoryUrl: (c) => DUMMYJSON + "recipes/search?q=" + encodeURIComponent(c),
    randomUrl: () => DUMMYJSON + "recipes?limit=1&skip=" + Math.floor(Math.random() * 50),
    lookupUrl: (id) => DUMMYJSON + "recipes/" + encodeURIComponent(id),
    categoriesUrl: () => DUMMYJSON + "recipes/tags",
    parseMeals: (json) => (json && Array.isArray(json.recipes)) ? json.recipes : [],
    parseMeal: (json) => {
      if (!json) return null;
      if (Array.isArray(json.recipes)) return json.recipes[0] || null;
      return json.id != null ? json : null;
    },
    parseCategories: (json) => (Array.isArray(json) ? json : []).map((t) => String(t).trim()).filter(Boolean),
    idOf: (m) => m.id,
    toRecipe: dummyjsonRecipe,
  },
  {
    id: "xsyna",
    name: "xSyna Rezepte",
    tagline: "Kuratierte Klassiker – funktioniert komplett offline",
    type: "local",
    localRecipes: CURATED_RECIPES.map(curatedRecipe),
    localCategories: ["Klassiker", "Schnell", "Suppe", "Backen", "Vegetarisch"],
    toRecipe: (m) => m,
  },
];

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Kategorie-/Zutaten-Treffer liefern nur Kurz-Infos → Details nachladen
async function withLookups(provider, shortMeals, limit) {
  const out = [];
  for (const m of (shortMeals || []).slice(0, limit)) {
    try {
      const full = provider.parseMeal(await fetchJson(provider.lookupUrl(provider.idOf(m))));
      if (full) out.push(full);
    } catch {
      /* einzelnes Rezept übersprungen */
    }
  }
  return out;
}

// Einheitliche Suche über die definierten Web-Quellen.
// Ergebnisform: { id, title, servings, ingredients, instructions, tags, image, sourceUrl, provider }
export async function searchWebRecipes({ query = "", ingredient = "", category = "", providerId = "themealdb", limit = 12 } = {}) {
  const provider = WEB_PROVIDERS.find((p) => p.id === providerId) || WEB_PROVIDERS[0];

  if (provider.type === "local") {
    const q = normalize(query);
    const ing = normalize(ingredient);
    const cat = String(category || "").trim().toLowerCase();
    let list = provider.localRecipes || [];
    if (q) {
      list = list.filter((r) => {
        const hay = normalize((r.title || "") + " " + (r.tags || []).join(" ") + " " + (r.ingredients || []).map((i) => i.name).join(" "));
        return hay.includes(q);
      });
    }
    if (ing) {
      list = list.filter((r) => (r.ingredients || []).some((i) => normalize(i.name).includes(ing) || ing.includes(normalize(i.name))));
    }
    if (cat) {
      list = list.filter((r) => (r.tags || []).some((t) => String(t).toLowerCase() === cat || String(t).toLowerCase().includes(cat)));
    }
    return list.slice(0, limit);
  }

  let meals = [];
  if (query) {
    const json = await fetchJson(provider.searchUrl(query));
    meals = provider.parseMeals(json);
  } else if (ingredient) {
    const json = await fetchJson(provider.ingredientUrl(ingredient));
    meals = provider.fullOnList
      ? provider.parseMeals(json)
      : await withLookups(provider, provider.parseMeals(json), Math.min(limit, 8));
  } else if (category) {
    const json = await fetchJson(provider.categoryUrl(category));
    meals = provider.fullOnList
      ? provider.parseMeals(json)
      : await withLookups(provider, provider.parseMeals(json), Math.min(limit, 8));
  } else {
    // Startansicht: mehrere zufällige Rezepte (latest.php ist nicht mehr offen)
    const seen = new Set();
    for (let i = 0; i < Math.min(limit, 4); i++) {
      try {
        const json = await fetchJson(provider.randomUrl());
        const m = provider.parseMeal(json);
        const mid = provider.idOf(m);
        if (m && mid != null && !seen.has(mid)) {
          seen.add(mid);
          meals.push(m);
        }
      } catch {
        /* einzelner Zufallstreffer übersprungen */
      }
    }
  }
  return (meals || []).map((m) => provider.toRecipe(m)).slice(0, limit);
}

export async function fetchWebCategories(providerId = "themealdb") {
  const provider = WEB_PROVIDERS.find((p) => p.id === providerId) || WEB_PROVIDERS[0];
  if (provider.type === "local") return provider.localCategories || [];
  const json = await fetchJson(provider.categoriesUrl());
  return provider.parseCategories(json);
}
