// ============================================================
// xSyna — Rezeptliste (/recipe-list) v2
// Bestand verwalten · Rezepte finden · Einkaufslisten smart bauen
// Powered by Synaptic Foundation Model (lokal im Browser)
//
// STANDALONE: Die App funktioniert komplett ohne Account und
// offline. Alle Daten liegen lokal (localStorage) und sind jederzeit
// exportierbar. Wenn ein xSyna-Account angemeldet ist, wird still
// ein Cloud-Backup geschrieben – ohne dass man sich anmelden muss.//   Es gibt keine Links zurück zur Website (PWA-Falle). Die App
//   registriert ihren eigenen Service Worker (/recipe-list/sw.js),
//   der jede Navigation innerhalb der Domain wieder zur App
//   zurückführt – installiert ist man quasi in der App gefangen.
// ============================================================
import "./js/api-assets.js";
import { toast, confirmModal, escapeHtml } from "./js/ui.js";
import {
  Synaptic,
  normalize,
  parseLine,
  parseText,
  mergeItems,
  inventoryCoverage,
  suggestRecipes,
  buildShoppingList,
  groupByCategory,
  formatAmount,
  scaleIngredients,
  modelInfo,
  kbStats,
  searchLabels,
  CATEGORIES,
} from "./js/synaptic.js";
import { extractFromOcr } from "./js/ocr-boost.js";
import {
  extractRecipeFromHtml,
  generateRecipeSuggestions,
  searchWebRecipes,
  fetchWebCategories,
  WEB_PROVIDERS,
} from "./js/web-recipes.js";
import { openXscan } from "./js/xscan.js";

const $ = (id) => document.getElementById(id);
const LS = {
  inventory: "xsynarec_inventory",
  recipes: "xsynarec_recipes",
  lists: "xsynarec_lists",
  selected: "xsynarec_selected",
  current: "xsynarec_current",
  currentTitle: "xsynarec_current_title",
  plan: "xsynarec_plan",
  history: "xsynarec_history",
  favs: "xsynarec_favs",
  servings: "xsynarec_servings",
};

const state = {
  user: null,
  cloudOk: false,
  inventory: [],
  recipes: [],
  lists: [],
  selectedRecipes: new Set(),
  tab: "bestand",
  hideDone: false,
  invFilter: "all",
  recipeFilter: { query: "", ingredient: "", status: "any", sort: "match" },
  currentSuggestions: [],
  plan: {},
  history: [],
  favs: new Set(),
  servings: {},
  planWeekOffset: 0,
};

let currentListItems = [];
let currentListTitle = "Einkaufsliste";

const ICONS = {
  box: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
  book: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  cart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  camera: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  barcode: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14"/><path d="M7 5v14"/><path d="M11 5v14"/><path d="M15 5v14"/><path d="M19 5v14"/><path d="M21 5v14"/></svg>',
  mic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  type: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5l-2 2m-7 7l-2 2m11 0l-2-2m-7-7l-2-2"/><circle cx="12" cy="12" r="3"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
};

// Produkt-Icons je Kategorie (im Bestand, im Einkaufsmodus und in Rezeptdetails)
const CATEGORY_ICON = {
  "Obst & Gemüse": "🥦",
  "Milchprodukte": "🥛",
  "Fleisch & Fisch": "🍗",
  "Backwaren": "🍞",
  "Nudeln & Getreide": "🍝",
  "Konserven & Saucen": "🥫",
  "Gewürze": "🧂",
  "Öle & Fette": "🫒",
  "Getränke": "🥤",
  "Süßes & Snacks": "🍫",
  "Tiefkühl": "❄️",
  "Haushalt": "🧻",
  "Pflege & Körper": "🧴",
  "Tierbedarf": "🐾",
  "Sonstiges": "📦",
};

function productIcon(item) {
  return CATEGORY_ICON[item && item.category] || "📦";
}

// ============================================================
// Supabase ist OPTIONAL (Cloud-Backup). Die App startet und
// funktioniert komplett ohne Account, ohne Netz und ohne CDN.
// Das Modul wird erst geladen, wenn es wirklich gebraucht wird.
// ============================================================
let _supabase = null;
let _supabaseFailedAt = 0;

async function getSupabase() {
  if (_supabase) return _supabase;
  // Backoff: nach einem Fehlschlag 30 s warten, statt bei jedem
  // persist() einen Netzwerk-Request zu feuern (wichtig offline).
  if (Date.now() - _supabaseFailedAt < 30000) return null;
  try {
    const mod = await import("./js/supabase.js");
    _supabase = mod.supabase || null;
    if (!_supabase) _supabaseFailedAt = Date.now();
    return _supabase;
  } catch (e) {
    _supabaseFailedAt = Date.now();
    console.warn("[Rezeptliste] Cloud-Backup nicht verfügbar – App läuft lokal weiter.", e);
    return null;
  }
}

// init() referenziert weiterhin `supabase.auth.onAuthStateChange`. Das
// Supabase-Modul wird aber erst bei Bedarf (Cloud-Backup) geladen – dieser
// kleine Shim verdrahtet den Auth-Listener lazy, damit die App ohne CDN und
// ohne Account startet und trotzdem ein Backup bekommt, sobald verfügbar.
const supabase = {
  auth: {
    onAuthStateChange: (cb) => {
      getSupabase().then((sb) => {
        if (sb) sb.auth.onAuthStateChange(cb);
      });
      return { data: { subscription: null } };
    },
  },
};

// PWA-Bootstrap: eigener App-Service-Worker + Deep-Link-Tab
// (z. B. /recipe-list/?tab=einkauf aus den Manifest-Shortcuts).
(function setupAppBootstrap() {
  const tabParam = new URLSearchParams(window.location.search).get("tab");
  if (tabParam === "bestand" || tabParam === "rezepte" || tabParam === "einkauf" || tabParam === "plan" || tabParam === "stats") {
    state.tab = tabParam;
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/recipe-list/sw.js")
        .then((reg) => console.log("[Rezeptliste SW] registered:", reg.scope))
        .catch((e) => console.warn("[Rezeptliste SW] registration failed:", e));
    });
  }
})();

// xScan-Button im Header verdrahten (standalone Live-Erkennung).
$("btn-xscan")?.addEventListener("click", () => openXscan({
  inventory: state.inventory,
  persistInventory,
  renderContent,
  toast,
  escapeHtml,
  productIcon,
  formatAmount,
  normalize,
  ICONS,
  uuid,
}));

// ============================================================
// Beispielrezepte (Seed-Daten) – Zutaten werden beim Laden
// durch die Synaptic-Engine normalisiert & kategorisiert.
// ============================================================
const SEED_RECIPES = [
  {
    title: "Spaghetti Bolognese",
    servings: 4,
    ingredients: "400 g Spaghetti\n2 Zwiebeln\n2 Knoblauchzehen\n400 g Rinderhack\n800 ml Passierte Tomaten\n2 EL Tomatenmark\n1 TL Oregano\nSalz\nPfeffer\n1 EL Olivenöl",
    instructions: "Zwiebeln und Knoblauch fein würfeln und im Öl glasig dünsten. Hackfleisch zugeben und krümelig braten. Tomatenmark einrühren, Passierte Tomaten und Gewürze zugeben und 20 Minuten köcheln lassen. Spaghetti al dente kochen, mit der Sauce servieren.",
    tags: ["Pasta", "Fleisch", "Italienisch"],
  },
  {
    title: "Pfannkuchen",
    servings: 2,
    ingredients: "2 Eier\n250 ml Milch\n125 g Mehl\n1 Prise Salz\n1 EL Zucker\n1 EL Butter",
    instructions: "Eier, Milch, Mehl, Salz und Zucker zu einem glatten Teig verrühren. Butter in der Pfanne erhitzen, dünne Pfannkuchen nacheinander goldbraun ausbacken.",
    tags: ["Süß", "Schnell", "Vegetarisch"],
  },
  {
    title: "Gemüsecurry mit Reis",
    servings: 3,
    ingredients: "200 g Reis\n1 Zwiebel\n2 Möhren\n1 Paprika\n1 Zucchini\n400 ml Kokosmilch\n2 EL Currypulver\n1 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Gemüse würfeln und im Öl anbraten. Currypulver kurz mitrösten, Kokosmilch angießen und 15 Minuten sanft köcheln. Mit Salz und Pfeffer abschmecken und mit Reis servieren.",
    tags: ["Vegetarisch", "Curry", "Schnell"],
  },
  {
    title: "Kartoffelsuppe",
    servings: 4,
    ingredients: "800 g Kartoffeln\n1 Zwiebel\n2 Möhren\n1 Stange Lauch\n1 l Gemüsebrühe\n200 ml Sahne\n1 EL Butter\nSalz\nPfeffer\nMuskat",
    instructions: "Kartoffeln, Möhren und Lauch würfeln, Zwiebel andünsten. Gemüse zugeben, Brühe angießen und 25 Minuten weich kochen. Pürieren, Sahne einrühren und mit Muskat abschmecken.",
    tags: ["Suppe", "Vegetarisch", "Herbst"],
  },
  {
    title: "Hähnchen-Gemüse-Pfanne",
    servings: 2,
    ingredients: "400 g Hähnchen\n1 Paprika\n1 Zucchini\n1 Zwiebel\n2 EL Sojasauce\n1 EL Olivenöl\n1 TL Paprikapulver\nPfeffer",
    instructions: "Hähnchen in Streifen schneiden und im Öl anbraten. Gemüse zugeben, mitbraten. Sojasauce und Gewürze zugeben, 5 Minuten fertig garen.",
    tags: ["Fleisch", "Schnell", "Wok"],
  },
  {
    title: "Nudelsalat",
    servings: 4,
    ingredients: "300 g Nudeln\n2 Tomaten\n1 Gurke\n1 Paprika\n150 g Mais\n3 EL Essig\n4 EL Olivenöl\n1 EL Senf\nSalz\nPfeffer\n1 Bund Petersilie",
    instructions: "Nudeln kochen und abkühlen lassen. Gemüse klein schneiden und untermischen. Aus Essig, Öl, Senf und Gewürzen ein Dressing rühren, unterheben und mindestens 30 Minuten ziehen lassen.",
    tags: ["Salat", "Vegetarisch", "Grillen"],
  },
  {
    title: "Chili con Carne",
    servings: 4,
    ingredients: "400 g Rinderhack\n1 Zwiebel\n2 Knoblauchzehen\n1 Paprika\n2 Dosen Gehackte Tomaten\n1 Dose Kidneybohnen\n1 Dose Mais\n2 TL Paprikapulver\n1 TL Kreuzkümmel\n1 TL Chilipulver\n1 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Zwiebeln und Knoblauch anbraten, Hackfleisch krümelig braten. Paprika zugeben, Tomaten und Bohnen mit Flüssigkeit angießen. 30 Minuten köcheln, würzen und mit Mais servieren.",
    tags: ["Eintopf", "Fleisch", "Mexikanisch"],
  },
  {
    title: "Ofengemüse mit Feta",
    servings: 2,
    ingredients: "1 Zucchini\n1 Paprika\n2 Möhren\n1 Süßkartoffel\n200 g Feta\n2 EL Olivenöl\n1 TL Paprikapulver\n1 TL Oregano\nSalz\nPfeffer",
    instructions: "Gemüse in grobe Stücke schneiden, mit Öl und Gewürzen mischen und bei 200 °C 25 Minuten backen. Feta darüberbröseln und weitere 10 Minuten backen.",
    tags: ["Vegetarisch", "Ofen", "Einfach"],
  },
  {
    title: "Tomatensuppe",
    servings: 3,
    ingredients: "800 ml Passierte Tomaten\n1 Zwiebel\n2 Knoblauchzehen\n1 EL Olivenöl\n1 TL Zucker\n200 ml Sahne\nBasilikum\nSalz\nPfeffer",
    instructions: "Zwiebel und Knoblauch im Öl anschwitzen, Passierte Tomaten und Zucker zugeben, 15 Minuten köcheln. Sahne einrühren, mit Salz, Pfeffer und Basilikum abschmecken.",
    tags: ["Suppe", "Vegetarisch", "Schnell"],
  },
  {
    title: "Rührei mit Toast",
    servings: 1,
    ingredients: "3 Eier\n2 Scheiben Brot\n1 EL Butter\nSalz\nPfeffer\n1 EL Schnittlauch",
    instructions: "Eier verquirlen und würzen. Butter in der Pfanne zerlassen, Eier stockend rühren. Toast rösten, mit Rührei und Schnittlauch servieren.",
    tags: ["Frühstück", "Schnell", "Vegetarisch"],
  },
  {
    title: "Ofen-Lasagne",
    servings: 4,
    ingredients: "12 Lasagneplatten\n400 g Rinderhack\n800 ml Passierte Tomaten\n2 Zwiebeln\n2 Knoblauchzehen\n2 Möhren\n2 EL Tomatenmark\n500 ml Milch\n50 g Butter\n50 g Mehl\n150 g Käse\n1 EL Olivenöl\nSalz\nPfeffer\nMuskat",
    instructions: "Zwiebeln, Knoblauch und Möhren fein würfeln und im Öl anbraten. Hackfleisch zugeben und krümelig braten, Tomatenmark einrühren, Passierte Tomaten angießen und 15 Minuten köcheln. Aus Butter, Mehl und Milch eine Béchamel kochen und mit Muskat, Salz und Pfeffer würzen. Lasagneplatten, Hack-Sauce und Béchamel schichten, mit Käse bestreuen und bei 180 °C 35 Minuten backen.",
    tags: ["Pasta", "Ofen", "Fleisch"],
  },
  {
    title: "Shakshuka",
    servings: 2,
    ingredients: "4 Eier\n400 ml Passierte Tomaten\n1 Paprika\n1 Zwiebel\n2 Knoblauchzehen\n1 TL Kreuzkümmel\n1 TL Paprikapulver\n1 Bund Petersilie\n1 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Zwiebel, Knoblauch und Paprika im Öl weich dünsten. Gewürze kurz mitrösten, Passierte Tomaten angießen und 10 Minuten einkochen. Mulden formen, Eier hineinschlagen und zugedeckt 5–7 Minuten stocken lassen. Mit Petersilie servieren.",
    tags: ["Eier", "Vegetarisch", "Orientalisch"],
  },
  {
    title: "Kürbissuppe",
    servings: 4,
    ingredients: "600 g Kürbis\n1 Zwiebel\n2 Möhren\n1 l Brühe\n200 ml Sahne\n1 Stück Ingwer\nMuskat\nSalz\nPfeffer",
    instructions: "Kürbis, Möhren und Zwiebel würfeln und kurz anschwitzen. Ingwer zugeben, Brühe angießen und 25 Minuten weich kochen. Fein pürieren, Sahne einrühren und mit Muskat, Salz und Pfeffer abschmecken.",
    tags: ["Suppe", "Vegetarisch", "Herbst"],
  },
  {
    title: "Pesto-Pasta",
    servings: 2,
    ingredients: "400 g Nudeln\n1 Glas Pesto\n100 g Parmesan\n2 Tomaten\n1 EL Olivenöl",
    instructions: "Nudeln al dente kochen, etwas Nudelwasser aufheben. Pesto mit dem Nudelwasser verrühren und unter die Nudeln heben. Mit Tomatenwürfeln und gehobeltem Parmesan servieren.",
    tags: ["Pasta", "Vegetarisch", "Schnell"],
  },
  {
    title: "Griechischer Salat",
    servings: 2,
    ingredients: "3 Tomaten\n1 Gurke\n200 g Feta\n100 g Oliven\n1 Zwiebel\n1 TL Oregano\n2 EL Olivenöl\n1 EL Essig\nSalz\nPfeffer",
    instructions: "Tomaten, Gurke und Zwiebel in grobe Stücke schneiden. Oliven und gewürfelten Feta zugeben. Aus Öl, Essig, Oregano, Salz und Pfeffer ein Dressing rühren und unterheben.",
    tags: ["Salat", "Vegetarisch", "Schnell"],
  },
  {
    title: "Linsensuppe",
    servings: 4,
    ingredients: "250 g Linsen\n2 Möhren\n1 Zwiebel\n1 Stange Lauch\n1 l Brühe\n2 EL Tomatenmark\n2 Lorbeerblätter\n1 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Zwiebel und Lauch im Öl anschwitzen, Tomatenmark einrühren. Möhren, Linsen und Lorbeer zugeben, Brühe angießen und 40 Minuten leise köcheln. Lorbeer entfernen und mit Salz und Pfeffer abschmecken.",
    tags: ["Suppe", "Vegetarisch", "Winter"],
  },
  {
    title: "Burrito Bowl",
    servings: 2,
    ingredients: "200 g Reis\n1 Dose Kidneybohnen\n1 Dose Mais\n2 Tomaten\n1 Avocado\n1 Zwiebel\n1 Limette\n1 Bund Koriander (frisch)\nSalz",
    instructions: "Reis kochen. Kidneybohnen und Mais abspülen, Tomaten und Zwiebel würfeln. Alles in Schüsseln schichten, Avocado daraufsetzen und mit Limettensaft und Koriander toppen.",
    tags: ["Reis", "Vegetarisch", "Mexikanisch"],
  },
  {
    title: "Thai Curry mit Hähnchen",
    servings: 3,
    ingredients: "400 g Hähnchen\n1 Paprika\n1 Zucchini\n2 Möhren\n2 EL Currypaste\n400 ml Kokosmilch\n200 g Reis\n1 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Hähnchen in Streifen schneiden und im Öl anbraten. Gemüse zugeben und mitbraten. Currypaste einrühren, Kokosmilch angießen und 10 Minuten köcheln. Mit Reis servieren.",
    tags: ["Curry", "Fleisch", "Asiatisch"],
  },
  {
    title: "Ramen",
    servings: 2,
    ingredients: "200 g Ramen\n2 Eier\n4 Frühlingszwiebeln\n1 Möhre\n2 EL Sojasauce\n1 EL Sesamöl\n1 Stück Ingwer\n2 Knoblauchzehen\n1 l Hühnerbrühe",
    instructions: "Brühe mit Sojasauce, Sesamöl, Ingwer und Knoblauch aufkochen und die Ramen darin gar ziehen lassen. Eier 6 Minuten kochen und halbieren. Suppe mit Eiern, Möhrenstreifen und Frühlingszwiebeln anrichten.",
    tags: ["Suppe", "Fleisch", "Asiatisch"],
  },
  {
    title: "Pizza Margherita",
    servings: 2,
    ingredients: "1 Packung Pizzateig\n400 ml Passierte Tomaten\n200 g Mozzarella\n1 Bund Basilikum\n1 EL Olivenöl\nSalz",
    instructions: "Teig ausrollen, mit Passierten Tomaten bestreichen und mit Mozzarella belegen. Bei 220 °C 12–15 Minuten backen und mit Basilikum und Olivenöl anrichten.",
    tags: ["Ofen", "Vegetarisch", "Italienisch"],
  },
  {
    title: "Kartoffelgratin",
    servings: 4,
    ingredients: "1 kg Kartoffeln\n200 ml Sahne\n150 g Käse\n1 Zehe Knoblauch\nMuskat\nSalz\nPfeffer",
    instructions: "Kartoffeln in dünne Scheiben hobeln. Mit Sahne, Knoblauch, Muskat, Salz und Pfeffer mischen und in eine Auflaufform schichten. Mit Käse bestreuen und bei 180 °C 50 Minuten backen.",
    tags: ["Ofen", "Vegetarisch", "Beilage"],
  },
  {
    title: "Nudelauflauf",
    servings: 4,
    ingredients: "400 g Nudeln\n3 Tomaten\n1 Zucchini\n200 g Schmand\n150 g Käse\n1 EL Oregano\nSalz\nPfeffer",
    instructions: "Nudeln bissfest kochen. Tomaten und Zucchini würfeln und mit Nudeln und Schmand mischen und würzen. In eine Form geben, mit Käse bestreuen und bei 190 °C 25 Minuten backen.",
    tags: ["Pasta", "Ofen", "Vegetarisch"],
  },
  {
    title: "Flammkuchen",
    servings: 2,
    ingredients: "1 Packung Pizzateig\n200 g Crème fraîche\n150 g Speck\n2 Zwiebeln\nSalz\nPfeffer\nMuskat",
    instructions: "Teig dünn ausrollen. Crème fraîche mit Salz, Pfeffer und Muskat verrühren und auf dem Teig verteilen. Mit Speckwürfeln und Zwiebelringen belegen und bei 250 °C 12 Minuten knusprig backen.",
    tags: ["Ofen", "Schnell", "Klassiker"],
  },
  {
    title: "Quesadillas",
    servings: 2,
    ingredients: "4 Wraps\n150 g Käse\n1 Paprika\n1 Dose Mais\n1 Zwiebel\n1 EL Olivenöl",
    instructions: "Paprika und Zwiebel würfeln und kurz im Öl anbraten. Wraps mit Käse, Gemüse und Mais belegen, zusammenklappen und in der Pfanne von beiden Seiten goldbraun backen.",
    tags: ["Schnell", "Vegetarisch", "Mexikanisch"],
  },
  {
    title: "Bratkartoffeln",
    servings: 2,
    ingredients: "800 g Kartoffeln\n2 Zwiebeln\n100 g Speck\n1 EL Paprikapulver\nSalz\nPfeffer",
    instructions: "Gekochte Kartoffeln in Scheiben schneiden. Speck und Zwiebeln anbraten, Kartoffeln zugeben und knusprig braten. Mit Paprikapulver, Salz und Pfeffer würzen.",
    tags: ["Beilage", "Fleisch", "Klassiker"],
  },
  {
    title: "Gulasch",
    servings: 4,
    ingredients: "800 g Rindfleisch\n3 Zwiebeln\n2 Paprika\n2 EL Tomatenmark\n1 EL Paprikapulver\n500 ml Brühe\n2 Knoblauchzehen\n1 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Fleisch würfeln und im Öl scharf anbraten. Zwiebeln, Knoblauch und Paprika zugeben. Tomatenmark und Paprikapulver einrühren, Brühe angießen und 1,5 Stunden leise schmoren. Mit Salz und Pfeffer abschmecken.",
    tags: ["Eintopf", "Fleisch", "Ungarisch"],
  },
  {
    title: "Ratatouille",
    servings: 4,
    ingredients: "2 Zucchini\n1 Aubergine\n2 Paprika\n4 Tomaten\n1 Zwiebel\n2 Knoblauchzehen\n1 TL Thymian\n2 EL Olivenöl\nSalz\nPfeffer",
    instructions: "Alle Gemüse würfeln. Zwiebel und Knoblauch im Öl anschwitzen, Gemüse zugeben und 25 Minuten sanft schmoren. Mit Thymian, Salz und Pfeffer würzen.",
    tags: ["Vegetarisch", "Ofen", "Französisch"],
  },
  {
    title: "Apfelstrudel",
    servings: 6,
    ingredients: "4 Äpfel\n1 Packung Blätterteig\n50 g Zucker\n50 g Rosinen\n1 TL Zimt\n50 g Butter\n1 Ei",
    instructions: "Äpfel schälen und in feine Scheiben schneiden, mit Zucker, Rosinen und Zimt mischen. Blätterteig ausrollen, Füllung darauf verteilen, einrollen und mit verquirltem Ei bestreichen. Bei 180 °C 35 Minuten goldbraun backen.",
    tags: ["Süß", "Ofen", "Dessert"],
  },
  {
    title: "Overnight Oats",
    servings: 1,
    ingredients: "60 g Haferflocken\n150 g Joghurt\n100 ml Milch\n1 EL Chiasamen\n1 EL Honig\n100 g Himbeeren",
    instructions: "Haferflocken, Joghurt, Milch, Chiasamen und Honig im Glas verrühren. Über Nacht kalt stellen und am Morgen mit Himbeeren toppen.",
    tags: ["Frühstück", "Vegetarisch", "Schnell"],
  },
  {
    title: "French Toast",
    servings: 2,
    ingredients: "4 Scheiben Brot\n2 Eier\n100 ml Milch\n1 EL Zucker\n1 TL Zimt\n20 g Butter",
    instructions: "Eier mit Milch, Zucker und Zimt verquirlen. Brotscheiben darin einweichen und in Butter von beiden Seiten goldbraun braten.",
    tags: ["Frühstück", "Süß", "Schnell"],
  },
  {
    title: "Bananenbrot",
    servings: 8,
    ingredients: "3 Bananen\n200 g Mehl\n100 g Zucker\n2 Eier\n80 g Butter\n1 Packung Backpulver\n1 TL Zimt\n50 g Nüsse",
    instructions: "Bananen zerdrücken. Butter und Zucker schaumig rühren, Eier und Bananen zugeben. Mehl, Backpulver und Zimt unterheben, Nüsse einrühren. Bei 175 °C 55 Minuten backen.",
    tags: ["Süß", "Backen", "Snack"],
  },
  {
    title: "Schokoladenkuchen",
    servings: 10,
    ingredients: "200 g Schokolade\n150 g Butter\n150 g Zucker\n3 Eier\n150 g Mehl\n2 EL Kakaopulver\n1 Packung Backpulver",
    instructions: "Schokolade mit Butter schmelzen. Zucker und Eier unterrühren. Mehl, Kakaopulver und Backpulver einarbeiten. In eine Form füllen und bei 175 °C 35 Minuten backen.",
    tags: ["Süß", "Backen", "Dessert"],
  },
  {
    title: "Risotto",
    servings: 3,
    ingredients: "300 g Reis\n1 Zwiebel\n1 l Brühe\n100 ml Weißwein\n50 g Parmesan\n50 g Butter\nSalz\nPfeffer",
    instructions: "Zwiebel in der Hälfte der Butter glasig dünsten. Reis zugeben und kurz mitrösten, mit Weißwein ablöschen. Nach und nach heiße Brühe angießen und unter Rühren 20 Minuten cremig kochen. Parmesan und restliche Butter unterrühren und würzen.",
    tags: ["Reis", "Vegetarisch", "Italienisch"],
  },
  {
    title: "Käsespätzle",
    servings: 3,
    ingredients: "500 g Spätzle\n200 g Käse\n2 Zwiebeln\n50 g Butter\nSchnittlauch",
    instructions: "Spätzle nach Packungsanweisung kochen und abtropfen lassen. In einer Pfanne schichtweise Spätzle und Käse einschichten, Butterflöckchen verteilen und kurz schmelzen lassen. Mit gerösteten Zwiebeln und Schnittlauch servieren.",
    tags: ["Pasta", "Vegetarisch", "Klassiker"],
  },
];

// ============================================================
// Einkaufsmodus – große Touch-Flächen zum Abhaken im Laden
// ============================================================
function openShoppingMode() {
  const overlay = document.createElement("div");
  overlay.className = "shop-overlay";
  overlay.innerHTML = `
    <div class="shop-head">
      <div>
        <div style="font-weight:700;">Einkaufsmodus</div>
        <div style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);" id="shop-pct"></div>
      </div>
      <button class="btn btn-secondary btn-sm" id="shop-exit">Beenden</button>
    </div>
    <div class="shop-progress"><div style="width:0%"></div></div>
    <div class="shop-scroll"></div>
    <div class="shop-footer">
      <button class="btn btn-secondary btn-sm" id="shop-all">Alle abhaken</button>
      <button class="btn btn-secondary btn-sm" id="shop-unall">Zurücksetzen</button>
      <div class="shop-hint">Tippen = abhaken · Gedrückt halten = aus der Liste entfernen</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const render = () => {
    const total = currentListItems.length;
    const done = currentListItems.filter((i) => i.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const scroll = overlay.querySelector(".shop-scroll");
    const pctEl = overlay.querySelector("#shop-pct");
    const bar = overlay.querySelector(".shop-progress > div");
    if (pctEl) pctEl.textContent = `${done}/${total} · ${pct}%`;
    if (bar) bar.style.width = pct + "%";

    if (pct === 100) {
      scroll.innerHTML = `
        <div class="shop-done-banner">
          ${ICONS.check}
          <h2 style="font-size:1.4rem; margin-bottom:8px;">Alles erledigt!</h2>
          <p style="color:var(--text-secondary); max-width:420px; margin:0 auto;">${total} Positionen abgehakt. Du kannst die gekauften Artikel jetzt in deinen Bestand übernehmen.</p>
          <div style="display:flex; gap:10px; justify-content:center; margin-top:20px; flex-wrap:wrap;">
            <button class="btn btn-lime" id="shop-consume">${ICONS.box} In Bestand übernehmen</button>
            <button class="btn btn-secondary" id="shop-close">Fertig</button>
          </div>
        </div>`;
      scroll.querySelector("#shop-consume")?.addEventListener("click", () => { overlay.remove(); consumeDoneItems(); });
      scroll.querySelector("#shop-close")?.addEventListener("click", () => { overlay.remove(); renderContent(); });
      return;
    }

    const groups = groupByCategory(currentListItems);
    scroll.innerHTML = groups.map(([cat, items]) => `
      <div class="rec-group">
        <div class="shop-cat"><span>${escapeHtml(cat)}</span><span class="rec-group-count">${items.filter((i) => i.done).length}/${items.length}</span></div>
        ${items.map((i) => `
          <div class="shop-item ${i.done ? "done" : ""}" data-key="${escapeHtml(itemKey(i))}">
            <span class="shop-check ${i.done ? "on" : ""}">${i.done ? ICONS.check : ""}</span>
            <span class="shop-emoji">${productIcon(i)}</span>
            <span class="shop-name">${escapeHtml(i.name)}</span>
            <span class="shop-amount">${formatAmount(i)}</span>
          </div>`).join("")}
      </div>`).join("");

    scroll.querySelectorAll(".shop-item").forEach((row) => {
      let pressTimer = null;
      let longPressed = false;
      const clearPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
      row.addEventListener("pointerdown", () => {
        clearPress();
        longPressed = false;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          longPressed = true;
          if (navigator.vibrate) navigator.vibrate([25, 50, 25]);
          const item = currentListItems.find((i) => itemKey(i) === row.dataset.key);
          if (item) {
            currentListItems = currentListItems.filter((i) => itemKey(i) !== row.dataset.key);
            persistCurrentList();
            toast(`„${item.name}“ entfernt.`, "info");
            render();
          }
        }, 650);
      });
      row.addEventListener("pointerup", clearPress);
      row.addEventListener("pointerleave", clearPress);
      row.addEventListener("pointercancel", clearPress);
      row.addEventListener("contextmenu", (e) => e.preventDefault());
      row.addEventListener("click", () => {
        if (longPressed) { longPressed = false; return; }
        const item = currentListItems.find((i) => itemKey(i) === row.dataset.key);
        if (item) item.done = !item.done;
        if (navigator.vibrate) navigator.vibrate(10);
        persistCurrentList();
        render();
      });
    });
  };

  overlay.querySelector("#shop-exit").addEventListener("click", () => { overlay.remove(); renderContent(); });
  overlay.querySelector("#shop-all").addEventListener("click", () => { currentListItems.forEach((i) => (i.done = true)); persistCurrentList(); render(); });
  overlay.querySelector("#shop-unall").addEventListener("click", () => { currentListItems.forEach((i) => (i.done = false)); persistCurrentList(); render(); });
  render();
}

// ============================================================
// Gekaufte Artikel → Bestand übernehmen
// ============================================================
async function consumeDoneItems() {
  const done = currentListItems.filter((i) => i.done);
  if (!done.length) { toast("Erst Artikel abhaken.", "warning"); return; }
  for (const d of done) {
    const existing = state.inventory.find((i) => i.name === d.name && (i.unit || "") === (d.unit || ""));
    if (existing && d.amount != null && existing.amount != null) {
      existing.amount = Math.round((existing.amount + d.amount) * 100) / 100;
    } else if (existing && existing.amount == null && d.amount != null) {
      existing.amount = d.amount;
    } else {
      state.inventory.unshift({
        id: uuid(),
        name: d.name,
        amount: d.amount,
        unit: d.unit || "",
        category: d.category || "Sonstiges",
        source: "shopping",
        created_at: new Date().toISOString(),
      });
    }
  }
  const nowIso = new Date().toISOString();
  state.history.unshift(...done.map((d) => ({ name: d.name, category: d.category || "Sonstiges", amount: d.amount, unit: d.unit || "", date: nowIso })));
  state.history = state.history.slice(0, 500);
  writeLS(LS.history, state.history);

  currentListItems = currentListItems.filter((i) => !i.done);
  persistCurrentList();
  await persistInventory();
  renderContent();
  toast(`${done.length} Artikel in den Bestand übernommen.`, "success");
}

// ============================================================
// Beispielrezepte (Seed-Daten) laden
// ============================================================
async function seedRecipes() {
  if (state.recipes.length) return;
  const added = [];
  for (const seed of SEED_RECIPES) {
    const ingredients = mergeItems(parseText(seed.ingredients)).map((i) => ({
      name: i.name, amount: i.amount, unit: i.unit, category: i.category,
    }));
    state.recipes.push({
      id: uuid(),
      title: seed.title,
      servings: seed.servings || 2,
      ingredients,
      instructions: seed.instructions || "",
      tags: seed.tags || [],
      is_public: false,
      created_at: new Date().toISOString(),
    });
    added.push(seed.title);
  }
  await persistRecipes();
  renderContent();
  toast(`${added.length} Beispielrezepte geladen: ${added.slice(0, 3).join(", ")}${added.length > 3 ? " …" : ""}`, "success");
}

// ============================================================
// Store — lokal first, optionales Cloud-Backup
// ============================================================
function uuid() {
  return (crypto.randomUUID && crypto.randomUUID()) || "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function readLS(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* voll */ }
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount != null ? Number(row.amount) : null,
    unit: row.unit || "",
    category: row.category || "Sonstiges",
    source: row.source || "manual",
    created_at: row.created_at,
  };
}

function mapRecipe(r) {
  return {
    id: r.id,
    title: r.title,
    servings: r.servings || 2,
    ingredients: r.ingredients || [],
    instructions: r.instructions || "",
    tags: r.tags || [],
    is_public: !!r.is_public,
    created_at: r.created_at,
    source: r.source || "manual",
    sourceUrl: r.sourceUrl || "",
    provider: r.provider || "",
  };
}

// Normalisiert ein Rezept aus Import/Altbestand auf das aktuelle Schema.
function normalizeRecipe(r) {
  return {
    id: r.id || uuid(),
    title: r.title || "Unbenanntes Rezept",
    servings: Number(r.servings) || 2,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    instructions: r.instructions || "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    is_public: !!r.is_public,
    created_at: r.created_at || new Date().toISOString(),
    source: r.source || "manual",
    sourceUrl: r.sourceUrl || r.source_url || "",
    provider: r.provider || "",
  };
}

function mapList(l) {
  return { id: l.id, title: l.title, items: l.items || [], created_at: l.created_at };
}

async function cloudBackup(table, rows) {
  const sb = await getSupabase();
  if (!sb || !state.user) return;
  try {
    await sb.from(table).delete().eq("user_id", state.user.id);
    if (rows.length) {
      const { error } = await sb.from(table).insert(rows.map((r) => ({ user_id: state.user.id, ...r })));
      if (error) throw error;
    }
    state.cloudOk = true;
  } catch (e) {
    console.warn("[Rezeptliste] Backup fehlgeschlagen:", table, e);
    state.cloudOk = false;
  }
  renderStatus();
}

async function persistInventory() {
  writeLS(LS.inventory, state.inventory);
  await cloudBackup("recipe_inventory", state.inventory.map((i) => ({
    name: i.name, amount: i.amount, unit: i.unit, category: i.category, source: i.source,
  })));
}

async function persistRecipes() {
  writeLS(LS.recipes, state.recipes);
  await cloudBackup("recipes", state.recipes.map((r) => ({
    title: r.title, servings: r.servings || 2, ingredients: r.ingredients || [],
    instructions: r.instructions || "", tags: r.tags || [], is_public: !!r.is_public,
  })));
}

async function persistLists() {
  writeLS(LS.lists, state.lists);
  await cloudBackup("shopping_lists", state.lists.map((l) => ({ title: l.title, items: l.items || [] })));
}

function persistCurrentList() {
  writeLS(LS.current, currentListItems);
  writeLS(LS.currentTitle, currentListTitle);
}

function persistServings() {
  writeLS(LS.servings, state.servings);
}

async function loadAll() {
  state.inventory = readLS(LS.inventory, []);
  state.recipes = readLS(LS.recipes, []);
  state.lists = readLS(LS.lists, []);
  state.selectedRecipes = new Set(readLS(LS.selected, []));
  currentListItems = readLS(LS.current, []);
  currentListTitle = readLS(LS.currentTitle, "Einkaufsliste");
  state.plan = readLS(LS.plan, {});
  state.history = readLS(LS.history, []);
  state.favs = new Set(readLS(LS.favs, []));
  state.servings = readLS(LS.servings, {});
  for (const rid of Object.keys(state.servings)) {
    if (!state.recipes.some((r) => r.id === rid)) delete state.servings[rid];
  }
  // Verwaiste Plan-Einträge (gelöschte Rezepte) aufräumen
  for (const iso of Object.keys(state.plan)) {
    const day = state.plan[iso];
    for (const meal of ["fruehstueck", "mittag", "abend"]) {
      if (day[meal] && !state.recipes.some((r) => r.id === day[meal])) delete day[meal];
    }
  }

  state.user = null;
  state.cloudOk = false;
  const sb = await getSupabase();
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    if (data?.session?.user) {
      state.user = data.session.user;
      const [{ data: inv }, { data: rec }, { data: lists }] = await Promise.all([
        sb.from("recipe_inventory").select("*"),
        sb.from("recipes").select("*"),
        sb.from("shopping_lists").select("*"),
      ]);
      if (inv?.length && !state.inventory.length) state.inventory = inv.map(mapRow);
      if (rec?.length && !state.recipes.length) state.recipes = rec.map(mapRecipe);
      if (lists?.length && !state.lists.length) state.lists = lists.map(mapList);
      state.cloudOk = true;
    }
  } catch (e) {
    console.warn("[Rezeptliste] Backup-Sync nicht möglich (unkritisch):", e);
  }
  renderStatus();
}

// ============================================================
// Status-Chips & Banner
// ============================================================
function renderStatus() {
  const banner = $("offline-banner");
  if (banner) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      banner.style.display = "flex";
      banner.textContent = "Offline – Änderungen bleiben auf diesem Gerät und werden automatisch gespeichert.";
    } else {
      banner.style.display = "none";
    }
  }
  const sync = $("sync-status");
  if (sync) {
    if (state.user && state.cloudOk) {
      sync.style.display = "inline-flex";
      sync.textContent = "☁ Backup aktiv";
      sync.className = "sync-chip ok";
      sync.title = "Automatisches Cloud-Backup über deinen xSyna-Account";
    } else if (state.user && !state.cloudOk) {
      sync.style.display = "inline-flex";
      sync.textContent = "☁ Backup pausiert";
      sync.className = "sync-chip warn";
      sync.title = "Backup gerade nicht möglich – Daten bleiben sicher lokal";
    } else {
      sync.style.display = "none";
    }
  }
}

// ============================================================
// Export / Import
// ============================================================
function exportData() {
  const data = {
    app: "xsyna-rezeptliste",
    version: 3,
    schema: "xsynarec-v3",
    exportedAt: new Date().toISOString(),
    inventory: state.inventory,
    recipes: state.recipes,
    lists: state.lists,
    current: currentListItems,
    currentTitle: currentListTitle,
    plan: state.plan,
    history: state.history,
    favs: [...state.favs],
    servings: state.servings,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rezeptliste-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Backup exportiert.", "success");
}

function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "xsyna-rezeptliste") {
        toast("Keine gültige Rezeptliste-Datei.", "error");
        return;
      }
      if (!(await confirmModal("Der Import ersetzt ALLE lokalen Daten (Bestand, Rezepte, Listen). Fortfahren?"))) return;
      // Migration: alte Backups (v1/v2) werden auf das aktuelle
      // Schema normalisiert – fehlende IDs/Datumsangaben ergänzt.
      state.inventory = (data.inventory || []).map((i) => ({
        id: i.id || uuid(),
        name: i.name,
        amount: i.amount != null ? Number(i.amount) : null,
        unit: i.unit || "",
        category: i.category || "Sonstiges",
        source: i.source || "manual",
        created_at: i.created_at || new Date().toISOString(),
      }));
      state.recipes = (data.recipes || []).map(normalizeRecipe);
      state.lists = (data.lists || []).map((l) => ({
        id: l.id || uuid(),
        title: l.title || "Einkaufsliste",
        items: l.items || [],
        created_at: l.created_at || new Date().toISOString(),
      }));
      currentListItems = data.current || [];
      currentListTitle = data.currentTitle || "Einkaufsliste";
      state.plan = data.plan || {};
      state.history = Array.isArray(data.history) ? data.history : [];
      state.favs = new Set(Array.isArray(data.favs) ? data.favs : []);
      state.servings = data.servings && typeof data.servings === "object" ? data.servings : {};
      await persistInventory();
      await persistRecipes();
      await persistLists();
      persistCurrentList();
      renderContent();
      toast(`Import fertig: ${state.inventory.length} Artikel, ${state.recipes.length} Rezepte.`, "success");
    } catch (e) {
      toast("Import fehlgeschlagen: " + e.message, "error");
    }
  };
  input.click();
}

function printList() {
  const w = window.open("", "_blank");
  if (!w) { toast("Popup wurde blockiert.", "error"); return; }
  const rows = currentListItems.length
    ? currentListItems.map((i) => `<li class="${i.done ? "done" : ""}">${i.done ? "[x]" : "[ ]"} ${escapeHtml(formatAmount(i))} ${escapeHtml(i.name)}</li>`).join("")
    : "<li>Leere Liste.</li>";
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Einkaufsliste</title>
    <style>body{font-family:system-ui,-apple-system,sans-serif;padding:40px;color:#111}h1{font-size:20px;margin:0 0 6px}.meta{color:#666;font-size:12px;margin-bottom:24px}ul{list-style:none;padding:0;margin:0}li{padding:10px 4px;border-bottom:1px solid #e5e5e5;font-size:15px}.done{text-decoration:line-through;color:#999}</style></head>
    <body><h1>${escapeHtml(currentListTitle)}</h1><p class="meta">xSyna Rezeptliste · ${new Date().toLocaleDateString("de-DE")} · ${currentListItems.filter((i) => i.done).length}/${currentListItems.length} erledigt</p><ul>${rows}</ul></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ============================================================
// Tabs
// ============================================================
// ============================================================
// Rezept-Import von Websites & Synaptic-Vorschläge (UI)
// ------------------------------------------------------------
// • „Von Website“: Rezept-URL oder HTML importieren. Die
//   Synaptic-Engine extrahiert Titel, Zutaten und Zubereitung
//   (JSON-LD/Schema.org bevorzugt, sonst DOM-Heuristik).
// • „Synaptic-Vorschläge“: aus dem aktuellen Bestand generierte
//   Rezepte, die direkt gespeichert oder zur Einkaufsliste
//   hinzugefügt werden können.
// ============================================================

let importCandidates = [];
let importSelectedIdx = -1;

const CORS_PROXIES = [
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
];

async function fetchUrlText(url) {
  let lastErr = null;
  for (const proxy of CORS_PROXIES) {
    try {
      const timeout = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
      const res = await fetch(proxy(url), { signal: timeout });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 200) return text;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Alle Import-Proxys fehlgeschlagen.");
}

// Nach jedem Rendern des Rezepte-Tabs: URL-Button einfügen und
// Synaptic-Vorschläge berechnen + einhängen (idempotent).
function ensureRecipeExtras() {
  if (!$("btn-import-url")) {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-sm";
    btn.id = "btn-import-url";
    btn.title = "Rezept von einer Website importieren (URL oder HTML)";
    btn.innerHTML = `${ICONS.link} Von Website`;
    btn.addEventListener("click", openUrlImportModal);
    const target = $("btn-new-recipe");
    if (target && target.parentNode) target.parentNode.insertBefore(btn, target);
    else document.querySelector("#app-content .rec-toolbar")?.appendChild(btn);
  }

  if (!$("btn-web-recipes")) {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-sm";
    btn.id = "btn-web-recipes";
    btn.title = "Rezepte von Websites mit öffentlicher API suchen (TheMealDB, TheCocktailDB, DummyJSON, xSyna)";
    btn.innerHTML = `🔎 Web-Rezepte`;
    btn.addEventListener("click", openWebRecipesModal);
    const target = $("btn-import-recipe") || $("btn-new-recipe");
    if (target && target.parentNode) target.parentNode.insertBefore(btn, target);
    else document.querySelector("#app-content .rec-toolbar")?.appendChild(btn);
  }

  syncOcrVocab();

  const html = synaiSuggestionsHtml();
  const old = document.getElementById("sugg-section");
  if (old) old.remove();
  if (!html) return;
  const cards = document.querySelector("#app-content .rec-cards");
  if (cards) cards.insertAdjacentHTML("beforebegin", html);
  else document.querySelector("#app-content")?.insertAdjacentHTML("beforeend", html);
  bindSuggestionActions();
}

// SynAI-Empfehlungen (Synaptic Foundation Model) aus dem Bestand.
// Werden im Rezepte-Tab und im Bestand-Tab angezeigt, damit die
// Empfehlung sofort sichtbar ist, sobald >= 2 Artikel im Bestand sind. (hero)
function synaiSuggestionsHtml() {
  state.currentSuggestions = state.inventory.length >= 2
    ? generateRecipeSuggestions(state.inventory, { limit: 1 })
    : [];
  if (!state.currentSuggestions.length) return "";
  return renderSuggestionSection(state.currentSuggestions);
}

// ============================================================
// OCR-Vokabular: mögliche Zutaten aus den Rezepten, damit die
// Kamera-Erkennung (extractFromOcr) nur echte Zutaten übernimmt
// statt jedes einzelne Zeichen einer Etikett-/Kassenfoto-Zeile.
// ============================================================
function syncOcrVocab() {
  try {
    // Nur Rezept-TITEL erweitern das Kamera-Vokabular – nicht die Zutaten.
    // So erkennt die OCR keine beliebigen Wörter aus importierten Rezepten
    // als Bestand, sondern bleibt bei der Wissensbasis plus Rezeptnamen.
    const titles = [];
    for (const r of state.recipes) {
      if (r && r.title) titles.push(r.title);
    }
    const key = titles.join("|");
    if (key !== (window.__XSYNA_RECIPE_VOCAB_KEY || "")) {
      window.__XSYNA_RECIPE_VOCAB_KEY = key;
      window.__XSYNA_RECIPE_VOCAB = titles;
    }
  } catch {
    /* ignore */
  }
}

// Hintergrund-Sync: hält das OCR-Vokabular aktuell, auch wenn
// Rezepte importiert oder angelegt werden, ohne den Rezepte-Tab
// zu öffnen (z. B. über das Cloud-Backup beim Start).
if (typeof window !== "undefined") {
  setInterval(syncOcrVocab, 3000);
}

// ============================================================
// Web-Rezepte (öffentliche APIs) — suchen, mit Bestand abgleichen,
// fehlende Zutaten direkt in die Einkaufsliste packen, importieren
// ============================================================
const WEB_LS_CATS = "xsynarec_web_categories";

async function fetchWebCategoriesCached(providerId = "themealdb") {
  const key = WEB_LS_CATS + "_" + providerId;
  try {
    const cached = readLS(key, null);
    if (Array.isArray(cached) && cached.length) return cached;
    const cats = await fetchWebCategories(providerId);
    writeLS(key, cats);
    return cats;
  } catch {
    return [];
  }
}

function webCoverage(rec) {
  return inventoryCoverage(rec.ingredients || [], state.inventory);
}

function renderWebCard(rec, cov, openId) {
  const missing = cov.missing.slice(0, 4);
  const more = cov.missing.length - missing.length;
  const open = openId === rec.id;
  return `
    <div class="card rec-recipe web-card" data-web="${escapeHtml(rec.id)}" style="display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; gap:14px; align-items:flex-start;">
        ${rec.image ? `<img src="${rec.image}" alt="" loading="lazy" style="width:88px; height:88px; object-fit:cover; border-radius:10px; flex-shrink:0; border:1px solid var(--border);" onerror="this.style.display='none'" />` : ""}
        <div style="flex:1; min-width:0;">
          <h3 style="font-size:1rem; font-weight:600; line-height:1.35; margin-bottom:6px;">${escapeHtml(rec.title)}</h3>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
            ${(rec.tags || []).map((t) => `<span class="rec-chip">${escapeHtml(t)}</span>`).join("")}
            <span class="rec-chip muted">${escapeHtml(rec.provider || "Web")}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="rec-coverage ${cov.complete ? "ok" : ""}" title="${cov.have}/${cov.total} Zutaten im Bestand">${cov.complete ? ICONS.check + " " : ""}${cov.have}/${cov.total} im Bestand</span>
            ${cov.complete ? `<span class="rec-chip ok">✅ Alles vorhanden</span>` : ""}
          </div>
          ${!cov.complete && cov.missing.length ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; align-items:center;">
              <span style="font-size:0.72rem; color:var(--text-muted);">Fehlt:</span>
              ${missing.map((m) => `<span class="rec-chip">${escapeHtml(m.name)}</span>`).join("")}
              ${more ? `<span class="rec-chip muted">+${more} mehr</span>` : ""}
            </div>` : ""}
        </div>
      </div>
      <div class="rec-recipe-actions">
        <button class="btn btn-secondary btn-sm" data-act="web-details">${open ? "Weniger" : "Details"}</button>
        <button class="btn btn-secondary btn-sm" data-act="web-shop" ${cov.missing.length ? "" : "disabled"}>${ICONS.cart} Fehlendes kaufen</button>
        <button class="btn btn-lime btn-sm" data-act="web-import">${ICONS.plus} Importieren</button>
      </div>
      ${open ? `
        <div style="border-top:1px solid var(--border); padding-top:12px; max-height:220px; overflow:auto; font-size:0.85rem; color:var(--text-secondary); line-height:1.6; white-space:pre-wrap;">
          <div style="font-weight:600; color:var(--text); margin-bottom:6px;">Zutaten</div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:10px;">
            ${rec.ingredients.map((i) => { const amt = formatAmount(i); return `<span>· ${amt ? escapeHtml(amt) + " " : ""}${escapeHtml(i.name)}</span>`; }).join("")}
          </div>
          ${rec.instructions ? `<div style="font-weight:600; color:var(--text); margin-bottom:6px;">Zubereitung</div>${escapeHtml(rec.instructions)}` : ""}
          ${rec.sourceUrl ? `<p style="margin-top:10px; font-size:0.75rem;"><a href="${escapeHtml(rec.sourceUrl)}" target="_blank" rel="noopener" style="color:var(--lime);">Original-Rezept öffnen ↗</a></p>` : ""}
        </div>` : ""}
    </div>
  `;
}

async function openWebRecipesModal() {
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal rec-modal-lg">
      <div class="rec-modal-head">
        <h3 style="font-size:1.05rem;">🔎 Web-Rezepte finden</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <p style="color:var(--text-muted); font-size:0.78rem; margin-bottom:12px; line-height:1.5;">
        Rezepte aus öffentlichen Quellen (ohne Schlüssel) – Ergebnisse werden automatisch mit deinem Bestand abgeglichen. Fehlende Zutaten kannst du direkt auf die Einkaufsliste packen.
      </p>
      <div id="web-providers" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;"></div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <input id="web-query" class="rec-input" placeholder="Rezept suchen (z. B. Spaghetti, Chicken, Curry)…" style="flex:1; min-width:180px;" />
        <button class="btn btn-lime btn-sm" id="btn-web-search">${ICONS.spark} Suchen</button>
      </div>
      <div id="web-cats" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;"></div>
      <div id="web-status" style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px;">Rezepte werden geladen…</div>
      <div id="web-results" style="display:flex; flex-direction:column; gap:12px; max-height:58vh; overflow:auto; padding-right:4px;"></div>
      <div class="rec-modal-foot">
        <span id="web-source-note" style="font-size:0.72rem; color:var(--text-muted); margin-right:auto;"></span>
        <button class="btn btn-secondary btn-sm" data-close2>Schließen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-close2]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const status = overlay.querySelector("#web-status");
  const resultsEl = overlay.querySelector("#web-results");
  const catsEl = overlay.querySelector("#web-cats");
  const providersEl = overlay.querySelector("#web-providers");
  const noteEl = overlay.querySelector("#web-source-note");
  let openId = null;
  let activeProvider = "themealdb";
  const providerName = () => (WEB_PROVIDERS.find((p) => p.id === activeProvider) || WEB_PROVIDERS[0]).name;

  providersEl.innerHTML = WEB_PROVIDERS.map((p) =>
    `<button class="rec-filter ${p.id === activeProvider ? "active" : ""}" data-provider="${escapeHtml(p.id)}" title="${escapeHtml(p.tagline)}">${escapeHtml(p.name)}</button>`
  ).join("");
  providersEl.querySelectorAll("[data-provider]").forEach((b) => {
    b.addEventListener("click", () => {
      activeProvider = b.dataset.provider;
      providersEl.querySelectorAll(".rec-filter").forEach((x) => x.classList.toggle("active", x === b));
      noteEl.textContent = providerName() + " · Daten werden lokal verarbeitet";
      loadCategories();
      load({});
    });
  });
  noteEl.textContent = providerName() + " · Daten werden lokal verarbeitet";

  const render = (recipes) => {
    if (!recipes.length) {
      resultsEl.innerHTML = `<div class="card rec-empty" style="padding:32px; text-align:center;">${ICONS.book}<h3>Keine Rezepte gefunden</h3><p style="color:var(--text-muted); font-size:0.85rem;">Anderen Suchbegriff probieren oder eine Kategorie wählen.</p></div>`;
      return;
    }
    const withCov = recipes.map((r) => ({ rec: r, cov: webCoverage(r) }));
    withCov.sort((a, b) => (b.cov.complete ? 1 : 0) - (a.cov.complete ? 1 : 0) || b.cov.score - a.cov.score || b.cov.have - a.cov.have);
    const complete = withCov.filter((x) => x.cov.complete).length;
    resultsEl.innerHTML =
      (complete ? `<div style="font-size:0.78rem; color:var(--lime); margin-bottom:6px;">✅ ${complete} Rezept(e), die du direkt kochen kannst</div>` : "") +
      withCov.map(({ rec, cov }) => renderWebCard(rec, cov, openId)).join("");
    resultsEl.querySelectorAll("[data-act]").forEach((btn) => {
      const card = btn.closest(".web-card");
      if (!card) return;
      const id = card.dataset.web;
      const entry = withCov.find((x) => x.rec.id === id);
      if (!entry) return;
      if (btn.dataset.act === "web-details") {
        btn.addEventListener("click", () => { openId = openId === id ? null : id; render(withCov.map((x) => x.rec)); });
      } else if (btn.dataset.act === "web-shop") {
        btn.addEventListener("click", () => { addWebMissingToList(entry.rec); close(); });
      } else if (btn.dataset.act === "web-import") {
        btn.addEventListener("click", async () => { await importWebRecipe(entry.rec); render(withCov.map((x) => x.rec)); });
      }
    });
  };

  const load = async (opts) => {
    status.textContent = "⏳ Rezepte werden geladen…";
    status.style.color = "var(--text-muted)";
    try {
      const recipes = await searchWebRecipes({ ...opts, providerId: activeProvider });
      status.textContent = recipes.length ? `${recipes.length} Rezepte von ${providerName()} geladen.` : "Keine Treffer.";
      render(recipes);
    } catch (e) {
      status.textContent = "❌ Web-Rezepte nicht erreichbar (offline oder API blockiert).";
      status.style.color = "var(--error)";
      resultsEl.innerHTML = `<div class="card rec-empty" style="padding:32px; text-align:center;">${ICONS.book}<h3>Keine Verbindung</h3><p style="color:var(--text-muted); font-size:0.85rem;">Web-Rezepte brauchen Internet. Deine lokalen Rezepte funktionieren weiterhin – auch offline.</p></div>`;
    }
  };

  const loadCategories = () => {
    fetchWebCategoriesCached(activeProvider).then((cats) => {
      if (!cats.length || !overlay.isConnected) { catsEl.innerHTML = ""; return; }
      catsEl.innerHTML = `<button class="rec-filter active" data-cat="">Alle / Neueste</button>` +
        cats.map((c) => `<button class="rec-filter" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
      catsEl.querySelectorAll("[data-cat]").forEach((b) => {
        b.addEventListener("click", () => {
          catsEl.querySelectorAll(".rec-filter").forEach((x) => x.classList.toggle("active", x === b));
          load({ category: b.dataset.cat || "" });
        });
      });
    });
  };

  overlay.querySelector("#btn-web-search").addEventListener("click", () => {
    const q = overlay.querySelector("#web-query").value.trim();
    load({ query: q });
  });
  overlay.querySelector("#web-query").addEventListener("keydown", (e) => {
    if (e.key === "Enter") overlay.querySelector("#btn-web-search").click();
  });

  loadCategories();
  load({});
}

async function importWebRecipe(rec) {
  const existing = state.recipes.some((r) => r.title.toLowerCase() === rec.title.toLowerCase());
  if (existing) { toast("Dieses Rezept ist bereits gespeichert.", "warning"); return; }
  const r = normalizeRecipe({
    id: uuid(),
    title: rec.title,
    servings: rec.servings || 2,
    ingredients: (rec.ingredients || []).map((i) => ({ name: i.name, amount: i.amount, unit: i.unit || "", category: i.category || "Sonstiges" })),
    instructions: rec.instructions || "",
    tags: rec.tags || [],
    is_public: false,
    source: "web",
    provider: rec.provider || "",
    sourceUrl: rec.sourceUrl || "",
    created_at: new Date().toISOString(),
  });
  state.recipes.unshift(r);
  await persistRecipes();
  syncOcrVocab();
  renderContent();
  toast(`Rezept „${rec.title}“ in deine Rezepte übernommen.`, "success");
}

function addWebMissingToList(rec) {
  const cov = webCoverage(rec);
  if (!cov.missing.length) { toast("Alles vorhanden – nichts zu kaufen.", "success"); return; }
  const items = mergeItems(cov.missing.map((m) => ({ name: m.name, amount: m.amount, unit: m.unit || "", category: m.category || "Sonstiges", done: false })));
  currentListItems = mergeItems([...currentListItems, ...items]);
  persistCurrentList();
  state.tab = "einkauf";
  renderTabs();
  renderContent();
  toast(`${items.length} fehlende Zutaten zur Einkaufsliste hinzugefügt.`, "success");
}

// bindRecipes wird bei jedem Rendern des Rezepte-Tabs aufgerufen
// (Tab-Wechsel, Filter, Import …) – hier hängen wir die Extras an.
const __origBindRecipes = bindRecipes;
bindRecipes = function () {
  __origBindRecipes();
  ensureRecipeExtras();
};

function renderSuggestionSection(suggestions) {
  return `
    <div class="rec-sugg" id="sugg-section" style="margin-bottom: 30px;">
      <div class="rec-group-head" style="margin-bottom: 10px;">
        <span style="display: inline-flex; align-items: center; gap: 6px;">${ICONS.spark} SynAI empfiehlt – passend zu deinem Bestand</span>
        <span class="rec-group-count">${suggestions.length} ${suggestions.length === 1 ? "Idee" : "Ideen"}</span>
      </div>
      <div class="rec-cards">${suggestions.map(renderSuggestionCard).join("")}</div>
    </div>
  `;
}

function renderSuggestionCard(s) {
  const r = s.recipe;
  const missingChips = s.missing.slice(0, 3).map((m) => `<span class="rec-chip">${escapeHtml(m.name)}</span>`).join("");
  const more = s.missing.length > 3 ? `<span class="rec-chip muted">+${s.missing.length - 3} mehr</span>` : "";
  return `
    <div class="card rec-recipe rec-sugg-card" data-sugg="${escapeHtml(r.id)}">
      <div class="rec-recipe-head">
        <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
          <span class="rec-sugg-badge" title="Von Synaptic FM aus deinem Bestand generiert">${ICONS.spark}</span>
          <h3 style="font-size: 1rem; font-weight: 600;">${escapeHtml(r.title)}</h3>
        </div>
        <span class="rec-coverage ${s.complete ? "ok" : ""}" title="${s.have}/${s.total} Zutaten im Bestand">
          ${s.complete ? ICONS.check : ""} ${s.have}/${s.total}
        </span>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px;">
        ${(r.tags || []).map((t) => `<span class="rec-chip">${escapeHtml(t)}</span>`).join("")}
        ${s.complete ? `<span class="rec-chip ok">✅ Alles vorhanden</span>` : missingChips + more}
      </div>
      <div class="rec-recipe-actions">
        <button class="btn btn-secondary btn-sm" data-act="view-sugg">Details</button>
        <button class="btn btn-secondary btn-sm" data-act="shop-sugg" title="Fehlende Zutaten zur Einkaufsliste hinzufügen">${ICONS.cart} Einkaufsliste</button>
        <button class="btn btn-lime btn-sm" data-act="save-sugg">${ICONS.plus} Speichern</button>
      </div>
    </div>
  `;
}

function bindSuggestionActions() {
  document.querySelectorAll(".rec-sugg-card[data-sugg]").forEach((card) => {
    const id = card.dataset.sugg;
    const findS = () => state.currentSuggestions.find((x) => x.recipe.id === id);
    card.querySelector('[data-act="view-sugg"]')?.addEventListener("click", () => {
      const s = findS();
      if (s) openSuggestionModal(s);
    });
    card.querySelector('[data-act="shop-sugg"]')?.addEventListener("click", () => {
      const s = findS();
      if (s) addSuggestionToList(s);
    });
    card.querySelector('[data-act="save-sugg"]')?.addEventListener("click", async () => {
      const s = findS();
      if (s) await saveSuggestion(s);
    });
  });
}

function addSuggestionToList(s) {
  const items = mergeItems(s.missing.map((m) => ({ ...m, done: false })));
  currentListItems = mergeItems([...currentListItems, ...items]);
  persistCurrentList();
  toast(`${items.length} fehlende Zutaten zur Einkaufsliste hinzugefügt.`, "success");
  state.tab = "einkauf";
  renderTabs();
  renderContent();
}

async function saveSuggestion(s) {
  const existing = state.recipes.some((r) => r.title.toLowerCase() === s.recipe.title.toLowerCase());
  if (existing) {
    toast("Ein Rezept mit diesem Titel existiert bereits.", "warning");
    return;
  }
  const r = normalizeRecipe({ ...s.recipe, id: uuid(), created_at: new Date().toISOString(), source: "synai" });
  state.recipes.unshift(r);
  await persistRecipes();
  syncOcrVocab();
  renderContent();
  toast(`Rezept „${r.title}“ gespeichert.`, "success");
}

function openSuggestionModal(s) {
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal rec-modal-lg">
      <div class="rec-modal-head">
        <h3 style="font-size: 1rem;">${ICONS.spark} Synaptic-Vorschlag</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <div id="sugg-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const body = overlay.querySelector("#sugg-body");
  const render = (servings) => {
    body.innerHTML = renderRecipeDetail(s.recipe, servings) + `
      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-sm" data-cancel>Schließen</button>
        <button class="btn btn-secondary btn-sm" data-shop>${ICONS.cart} Einkaufsliste</button>
        <button class="btn btn-lime btn-sm" data-save>${ICONS.plus} Als Rezept speichern</button>
      </div>`;
    body.querySelectorAll("[data-edit], [data-del]").forEach((b) => (b.style.display = "none"));
    body.querySelector("#svc-minus")?.addEventListener("click", () => { if (servings > 1) render(servings - 1); });
    body.querySelector("#svc-plus")?.addEventListener("click", () => { if (servings < 20) render(servings + 1); });
    body.querySelector("[data-cancel]").addEventListener("click", close);
    body.querySelector("[data-shop]").addEventListener("click", () => addSuggestionToList(s));
    body.querySelector("[data-save]").addEventListener("click", async () => {
      await saveSuggestion(s);
      close();
    });
  };
  render(s.recipe.servings || 2);
}

// Rezept-Import-Modal: URL oder HTML einfügen
function openUrlImportModal() {
  importCandidates = [];
  importSelectedIdx = -1;
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal rec-modal-lg">
      <div class="rec-modal-head">
        <h3 style="font-size: 1rem;">${ICONS.link} Rezept von Website importieren</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 14px; line-height: 1.6;">
        Gib eine Rezept-URL ein oder füge den HTML-Code einer Rezeptseite ein. Die Synaptic-Engine extrahiert Titel, Zutaten und Zubereitung (JSON-LD wird bevorzugt).<br />
        <span style="font-size: 0.72rem;">Hinweis: Einige Websites blockieren automatische Zugriffe – dann „HTML einfügen“ oder den Text-Import nutzen.</span>
      </p>
      <div class="rec-import-tabs">
        <button class="rec-import-tab active" data-panel="url">URL</button>
        <button class="rec-import-tab" data-panel="html">HTML einfügen</button>
      </div>
      <div id="imp-url">
        <div style="display: flex; gap: 8px;">
          <input id="imp-url-input" class="rec-input" placeholder="https://www.chefkoch.de/rezepte/…" style="flex: 1;" />
          <button class="btn btn-lime btn-sm" id="btn-fetch-url">${ICONS.link} Importieren</button>
        </div>
        <p id="imp-url-status" style="color: var(--text-muted); font-size: 0.78rem; margin-top: 8px; min-height: 18px;"></p>
      </div>
      <div id="imp-html" style="display: none;">
        <textarea id="imp-html-input" class="rec-input" rows="6" placeholder="HTML der Rezeptseite hier einfügen (Browser: Rechtsklick → Seitenquelltext anzeigen, Strg+A, Strg+C)…" style="width: 100%; font-family: var(--font-mono); font-size: 0.75rem;"></textarea>
        <button class="btn btn-secondary btn-sm" id="btn-parse-html" style="margin-top: 8px;">${ICONS.spark} Parsen</button>
      </div>
      <div id="imp-results" style="margin-top: 14px;"></div>
      <div class="rec-modal-foot">
        <button class="btn btn-secondary btn-sm" data-close2>Schließen</button>
        <button class="btn btn-lime btn-sm" id="btn-import-selected" disabled>${ICONS.plus} Rezept speichern</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-close2]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelectorAll(".rec-import-tab").forEach((t) => {
    t.addEventListener("click", () => {
      overlay.querySelectorAll(".rec-import-tab").forEach((x) => x.classList.toggle("active", x === t));
      overlay.querySelector("#imp-url").style.display = t.dataset.panel === "url" ? "block" : "none";
      overlay.querySelector("#imp-html").style.display = t.dataset.panel === "html" ? "block" : "none";
    });
  });

  const status = overlay.querySelector("#imp-url-status");
  const results = overlay.querySelector("#imp-results");
  const saveBtn = overlay.querySelector("#btn-import-selected");

  const renderResults = () => {
    if (!importCandidates.length) {
      results.innerHTML = "";
      saveBtn.disabled = true;
      return;
    }
    results.innerHTML = `
      <div class="rec-group-head" style="margin-bottom: 8px;"><span>Gefunden (${importCandidates.length}) – Rezept wählen</span></div>
      <div class="rec-rows">${importCandidates.map((c, i) => `
        <div class="rec-row" data-cand="${i}" style="cursor: pointer; ${i === importSelectedIdx ? "border-color: var(--lime); background: var(--lime-soft);" : ""}">
          <button class="rec-check ${i === importSelectedIdx ? "on" : ""}" data-cand="${i}">${i === importSelectedIdx ? ICONS.check : ""}</button>
          <span class="rec-name">
            <span style="font-weight: 600;">${escapeHtml(c.title)}</span>
            <span style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">
              ${c.source === "jsonld" ? "JSON-LD" : "Heuristik"} · ${c.servings} Portionen · ${c.ingredients.length} Zutaten${c.duplicate ? " · <span style='color: var(--amber);'>bereits vorhanden</span>" : ""}
            </span>
          </span>
        </div>`).join("")}
      </div>`;
    results.querySelectorAll("[data-cand]").forEach((el) => {
      el.addEventListener("click", () => {
        importSelectedIdx = Number(el.dataset.cand);
        saveBtn.disabled = false;
        renderResults();
      });
    });
  };

  const showCandidates = (html, url) => {
    try {
      importCandidates = extractRecipeFromHtml(html, url);
    } catch (e) {
      status.textContent = "Parsing fehlgeschlagen: " + e.message;
      importCandidates = [];
    }
    if (!importCandidates.length) {
      status.textContent = "Kein Rezept gefunden. Viele Websites verstecken Rezepte hinter dynamischen Scripts – versuche die HTML-Ansicht oder den Text-Import.";
      results.innerHTML = "";
      saveBtn.disabled = true;
      return;
    }
    const existing = new Set(state.recipes.map((r) => r.title.toLowerCase()));
    importCandidates.forEach((c) => { c.duplicate = existing.has(c.title.toLowerCase()); });
    status.textContent = `${importCandidates.length} Rezept(e) gefunden.`;
    importSelectedIdx = -1;
    saveBtn.disabled = true;
    renderResults();
  };

  overlay.querySelector("#btn-fetch-url").addEventListener("click", async () => {
    const raw = overlay.querySelector("#imp-url-input").value.trim();
    let url;
    try {
      url = new URL(raw);
    } catch {
      status.textContent = "Bitte eine gültige URL eingeben (https://…).";
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      status.textContent = "Nur http(s)-URLs werden unterstützt.";
      return;
    }
    status.textContent = "⏳ Seite wird geladen (CORS-Proxy)…";
    saveBtn.disabled = true;
    try {
      const html = await fetchUrlText(url.href);
      status.textContent = "✅ Seite geladen – extrahiere Rezept…";
      showCandidates(html, url.href);
    } catch (e) {
      status.textContent = "Import fehlgeschlagen: Die Website blockiert automatische Zugriffe oder ist offline. Tipp: Öffne die Seite, kopiere den HTML-Quelltext und nutze „HTML einfügen“.";
    }
  });

  overlay.querySelector("#btn-parse-html").addEventListener("click", () => {
    const html = overlay.querySelector("#imp-html-input").value;
    if (!html.trim()) {
      status.textContent = "Bitte HTML einfügen.";
      return;
    }
    status.textContent = "⏳ Parsing…";
    showCandidates(html, "");
  });

  saveBtn.addEventListener("click", async () => {
    const c = importCandidates[importSelectedIdx];
    if (!c) return;
    if (c.duplicate && !(await confirmModal(`„${c.title}“ existiert bereits. Trotzdem importieren?`))) return;
    const r = normalizeRecipe({ ...c, id: uuid(), created_at: new Date().toISOString() });
    state.recipes.unshift(r);
    await persistRecipes();
    close();
    renderContent();
    toast(`Rezept „${r.title}“ importiert (${r.ingredients.length} Zutaten).`, "success");
  });
}

const TABS = [
  { id: "bestand", label: "Bestand", icon: ICONS.box },
  { id: "rezepte", label: "Rezepte", icon: ICONS.book },
  { id: "plan", label: "Plan", icon: ICONS.calendar },
  { id: "einkauf", label: "Einkaufsliste", icon: ICONS.cart },
  { id: "stats", label: "Statistik", icon: ICONS.chart },
];

function renderTabs() {
  const el = $("tab-bar");
  if (!el) return;
  el.innerHTML = TABS.map(
    (t) => `
    <button class="rec-tab ${state.tab === t.id ? "active" : ""}" data-tab="${t.id}">
      ${t.icon} ${t.label}
      ${t.id === "einkauf" && state.selectedRecipes.size ? `<span class="rec-badge">${state.selectedRecipes.size}</span>` : ""}
      ${t.id === "plan" && planWeekCount() ? `<span class="rec-badge">${planWeekCount()}</span>` : ""}
    </button>`
  ).join("");
  el.querySelectorAll(".rec-tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
}

function switchTab(tab) {
  state.tab = tab;
  renderTabs();
  renderContent();
}

function renderContent() {
  const el = $("app-content");
  if (!el) return;
  if (state.tab === "bestand") el.innerHTML = renderInventory();
  else if (state.tab === "rezepte") el.innerHTML = renderRecipes();
  else if (state.tab === "plan") el.innerHTML = renderPlan();
  else if (state.tab === "stats") el.innerHTML = renderStats();
  else el.innerHTML = renderShopping();
  bindCurrentTab();
}

// ============================================================
// BESTAND
// ============================================================
function renderInventory() {
  const filter = state.invFilter;
  const list = state.inventory;
  const filtered = list.filter((i) => {
    const exp = expiryInfo(i);
    if (filter === "expired") return !!exp && exp.expired;
    if (filter === "soon") return !!exp && !exp.expired && exp.soon;
    if (filter === "none") return !i.expires;
    return true;
  });
  const groups = groupByCategory(filtered);
  const total = list.length;
  const expired = list.filter((i) => { const e = expiryInfo(i); return !!e && e.expired; }).length;
  const soon = list.filter((i) => { const e = expiryInfo(i); return !!e && !e.expired && e.soon; }).length;
  const noMhd = list.filter((i) => !i.expires).length;
  const cards = CATEGORIES.map((c) => {
    const count = list.filter((i) => i.category === c).length;
    return count ? `<span class="rec-kpi">${escapeHtml(c)}: <b style="color: var(--lime);">${count}</b></span>` : "";
  }).filter(Boolean).join("");

  if (!total) {
    return `
      <div class="card rec-empty">
        ${ICONS.box}
        <h3>Dein Bestand ist leer</h3>
        <p style="color: var(--text-secondary); max-width: 460px; margin: 0 auto 24px;">Trage ein, was du vorrätig hast – manuell, per Kamera (Etiketten-Scan) oder per Sprache. Die Synaptic-Engine erkennt Labels automatisch.</p>
        <button class="btn btn-lime" id="btn-add-item">${ICONS.plus} Ersten Artikel hinzufügen</button>
        <p style="margin-top: 14px; font-size: 0.75rem; color: var(--text-muted);">Du hast schon ein Backup? <button class="rec-link" id="btn-import">Hier importieren</button></p>
      </div>
    `;
  }

  const chips = [
    ["all", "Alle", total],
    ["expired", "✕ Abgelaufen", expired],
    ["soon", "⚠ Läuft bald ab", soon],
    ["none", "Ohne MHD", noMhd],
  ].map(([id, label, n]) => `<button class="rec-filter ${filter === id ? "active" : ""}" data-filter="${id}">${label} <span class="rec-filter-count">${n}</span></button>`).join("");

  return `
    <div class="rec-toolbar">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="inv-search" class="rec-input" placeholder="Bestand durchsuchen…" style="width: 220px;" />
        <span class="rec-kpi">${total} Artikel</span>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-sm" id="btn-export" title="Alle Daten als JSON sichern">${ICONS.download} Export</button>
        <button class="btn btn-secondary btn-sm" id="btn-import" title="Daten aus JSON wiederherstellen">${ICONS.upload} Import</button>
        <button class="btn btn-lime btn-sm" id="btn-add-item">${ICONS.plus} Hinzufügen</button>
      </div>
    </div>
    ${expired ? `
      <div class="card rec-warning-strip" style="margin-bottom:16px; padding:12px 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; border-color: rgba(239,68,68,0.35);">
        <span style="color: var(--error); font-weight: 600;">${expired} ${expired === 1 ? "Artikel ist" : "Artikel sind"} abgelaufen</span>
        <span style="color: var(--text-muted); font-size: 0.8rem;">Mindesthaltbarkeit prüfen und aussortieren.</span>
        <button class="rec-link" id="btn-show-expired" style="margin-left: auto;">Anzeigen</button>
      </div>` : ""}
    <div class="rec-kpis">${cards}</div>
    <div class="rec-filter-chips">${chips}</div>
    ${synaiSuggestionsHtml()}
    <div id="inv-groups">${groups.map(([cat, items]) => renderInvGroup(cat, items)).join("")}</div>
  `;
}
function renderInvGroup(cat, items) {
  return `
    <div class="rec-group">
      <div class="rec-group-head"><span>${escapeHtml(cat)}</span><span class="rec-group-count">${items.length}</span></div>
      <div class="rec-rows">
        ${items.map(renderInvRow).join("")}
      </div>
    </div>
  `;
}

function renderInvRow(item) {
  const srcIcon = item.source === "camera" ? ICONS.camera : item.source === "mic" ? ICONS.mic : item.source === "barcode" ? ICONS.barcode : ICONS.type;
  const srcTitle = item.source === "camera" ? "per Kamera erfasst" : item.source === "mic" ? "per Sprache erfasst" : item.source === "barcode" ? "per Barcode erfasst" : "manuell erfasst";
  const exp = expiryInfo(item);
  const expChip = exp
    ? `<span class="rec-expiry ${exp.expired ? "expired" : exp.soon ? "soon" : "ok"}" title="Mindesthaltbarkeit: ${formatDate(item.expires)}${exp.expired ? " – abgelaufen" : exp.soon ? " – läuft bald ab" : ""}">${exp.expired ? "✕ " : exp.soon ? "⚠ " : "✓ "}${formatDate(item.expires)}</span>`
    : "";
  return `
    <div class="rec-row" data-id="${item.id}">
      <span class="rec-product-emoji" title="${escapeHtml(item.category)}">${productIcon(item)}</span>
      <span class="rec-src" title="${srcTitle}">${srcIcon}</span>
      <span class="rec-name">${escapeHtml(item.name)}</span>
      <span class="rec-amount">${formatAmount(item)}</span>
      ${expChip}
      <button class="rec-icon-btn" data-act="edit" title="Menge ändern">${ICONS.edit}</button>
      <button class="rec-icon-btn danger" data-act="del" title="Löschen">${ICONS.trash}</button>
    </div>
  `;
}
// ============================================================
// REZEPTE
// ============================================================
function renderRecipes() {
  const f = state.recipeFilter;
  let scored = suggestRecipes(state.recipes, state.inventory, f);
  if (f.status === "fav") scored = scored.filter((s) => state.favs.has(s.recipe.id));
  if (f.sort === "fav") {
    scored.sort((a, b) => (state.favs.has(b.recipe.id) ? 1 : 0) - (state.favs.has(a.recipe.id) ? 1 : 0) || b.score - a.score);
  }
  state.currentSuggestions = state.inventory.length >= 2 ? generateRecipeSuggestions(state.inventory, { limit: 4 }) : [];
  const recipesTotal = state.recipes.length;
  const machbar = scored.filter((s) => s.complete).length;

  return `
    <div class="rec-toolbar">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="rec-search" class="rec-input" placeholder="Rezepte suchen…" style="width: 190px;" value="${escapeHtml(f.query)}" />
        <input id="rec-ingredient" class="rec-input" placeholder="Zutat filtern (z. B. Tomaten)" style="width: 180px;" value="${escapeHtml(f.ingredient)}" />
        <select id="rec-status" class="rec-input" style="width: auto;">
          <option value="any" ${f.status === "any" ? "selected" : ""}>Alle</option>
          <option value="complete" ${f.status === "complete" ? "selected" : ""}>Nur machbar (nichts fehlt)</option>
          <option value="missing" ${f.status === "missing" ? "selected" : ""}>Es fehlt etwas</option>
          <option value="fav" ${f.status === "fav" ? "selected" : ""}>Nur Favoriten</option>
        </select>
        <select id="rec-sort" class="rec-input" style="width: auto;">
          <option value="match" ${f.sort === "match" ? "selected" : ""}>Passend zum Bestand</option>
          <option value="new" ${f.sort === "new" ? "selected" : ""}>Neueste</option>
          <option value="az" ${f.sort === "az" ? "selected" : ""}>A–Z</option>
          <option value="fav" ${f.sort === "fav" ? "selected" : ""}>Favoriten zuerst</option>
        </select>
      </div>
      ${!state.recipes.length ? `<button class="btn btn-secondary btn-sm" id="btn-seed">${ICONS.spark} Beispielrezepte laden</button>` : ""}
      <button class="btn btn-secondary btn-sm" id="btn-import-recipe" title="Rezept aus kopiertem Text importieren (wird automatisch geparst)">${ICONS.upload} Aus Text</button>
      <button class="btn btn-lime btn-sm" id="btn-new-recipe">${ICONS.plus} Neues Rezept</button>
    </div>

    <div class="rec-kpis">
      <span class="rec-kpi">${recipesTotal} Rezepte</span>
      <span class="rec-kpi">${machbar} machbar mit deinem Bestand</span>
      <span class="rec-kpi">${ICONS.star} ${state.favs.size} Favoriten</span>
    </div>

    ${scored.length ? `<div class="rec-cards">${scored.map(renderRecipeCard).join("")}</div>` : renderEmptyRecipes()}
  `;
}

function renderEmptyRecipes() {
  return `
    <div class="card rec-empty">
      ${ICONS.book}
      <h3>Keine Rezepte gefunden</h3>
      <p style="color: var(--text-secondary); max-width: 440px; margin: 0 auto 24px;">Lege deine ersten Rezepte an – die Synaptic-Engine parst die Zutatenliste automatisch und gleicht sie mit deinem Bestand ab.</p>
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button class="btn btn-lime" id="btn-new-recipe">${ICONS.plus} Rezept anlegen</button>
        <button class="btn btn-secondary" id="btn-seed">${ICONS.spark} Beispielrezepte laden</button>
      </div>
    </div>
  `;
}

function recipeSourceLabel(r) {
  if (!r) return "";
  if (r.provider) return r.provider;
  if (r.source === "web") return "Website";
  if (r.source === "jsonld") return "Website (JSON-LD)";
  if (r.source === "website") return "Website";
  if (r.source === "synai") return "SynAI (Synaptic FM)";
  if (r.source === "shopping") return "Einkauf";
  return "";
}

function recipeSourceChip(r) {
  const label = recipeSourceLabel(r);
  if (!label && !r.sourceUrl) return "";
  const text = label || "Quelle";
  if (r.sourceUrl) {
    return `<a class="rec-chip muted" href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener" title="Original-Rezept öffnen" style="text-decoration:none;">${ICONS.link} ${escapeHtml(text)}</a>`;
  }
  return `<span class="rec-chip muted">${ICONS.link} ${escapeHtml(text)}</span>`;
}

function renderRecipeCard(s) {
  const r = s.recipe;
  const missingChips = s.missing.slice(0, 3).map((m) => `<span class="rec-chip">${escapeHtml(m.name)}</span>`).join("");
  const more = s.missing.length > 3 ? `<span class="rec-chip muted">+${s.missing.length - 3} mehr</span>` : "";
  const selected = state.selectedRecipes.has(r.id);
  const fav = state.favs.has(r.id);
  return `
    <div class="card rec-recipe ${s.complete ? "ok" : ""}" data-id="${r.id}">
      <div class="rec-recipe-head">
        <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
          <h3 style="font-size: 1rem; font-weight: 600;">${escapeHtml(r.title)}</h3>
          <button class="rec-icon-btn ${fav ? "fav" : ""}" data-act="fav" title="${fav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}">${ICONS.star}</button>
        </div>
        <span class="rec-coverage ${s.complete ? "ok" : ""}" title="${s.have}/${s.total} Zutaten vorhanden">
          ${s.complete ? ICONS.check : ""} ${s.have}/${s.total}
        </span>
      </div>
      ${(r.tags || []).length ? `<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;">${r.tags.map((t) => `<span class="rec-chip">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px;">
        ${s.complete ? `<span class="rec-chip ok">✅ Alles vorhanden</span>` : ""}
        ${missingChips}${more}
        ${recipeSourceChip(r)}
      </div>
      <div class="rec-recipe-actions">
        <button class="btn btn-secondary btn-sm" data-act="view">Details</button>
        <button class="btn ${selected ? "btn-lime" : "btn-secondary"} btn-sm" data-act="toggleshop">${ICONS.cart} ${selected ? "Ausgewählt" : "Einkaufsliste"}</button>
      </div>
    </div>
  `;
}

// ============================================================
// EINKAUFSLISTE
// ============================================================
function selectedRecipeObjects() {
  return state.recipes.filter((r) => state.selectedRecipes.has(r.id));
}

// Rezepte inkl. gewählter Portionen (skaliert) für die Einkaufsliste
function scaledSelectedRecipes() {
  return selectedRecipeObjects().map((r) => {
    const servings = state.servings[r.id] || r.servings || 2;
    const factor = servings / (r.servings || 2);
    return { ...r, servings, ingredients: scaleIngredients(r.ingredients || [], factor) };
  });
}

// Zutaten aus dem Bestand abziehen („Kochen“); aufgebrauchte Artikel entfernen
function subtractIngredients(scaledIngredients) {
  let removed = 0;
  for (const ing of scaledIngredients) {
    if (ing.amount == null) continue;
    const match = state.inventory.find((i) => labelLike(i.name, ing.name));
    if (!match || match.amount == null) continue;
    match.amount = Math.max(0, Math.round((match.amount - ing.amount) * 100) / 100);
    if (match.amount === 0) {
      state.inventory = state.inventory.filter((i) => i.id !== match.id);
      removed++;
    }
  }
  return removed;
}
function renderShopping() {
  const selected = selectedRecipeObjects();
  const saved = state.lists;
  const total = currentListItems.length;
  const done = currentListItems.filter((i) => i.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const visible = state.hideDone ? currentListItems.filter((i) => !i.done) : currentListItems;
  const groups = groupByCategory(visible);

  return `
    <div class="rec-toolbar">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="list-title" class="rec-input" value="${escapeHtml(currentListTitle)}" style="width: 200px;" placeholder="Listenname" />
        <span class="rec-kpi">${total} Positionen · ${done} erledigt</span>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-lime btn-sm" id="btn-shop-mode" ${total ? "" : "disabled"} title="Große Touch-Buttons zum Abhaken im Laden">${ICONS.cart} Einkaufsmodus</button>
        <button class="btn btn-lime btn-sm" id="btn-recalc">${ICONS.spark} Smart neu berechnen</button>
        <button class="btn btn-secondary btn-sm" id="btn-add-manual">${ICONS.plus} Manuell</button>
        <button class="btn btn-secondary btn-sm" id="btn-copy-list" title="Liste als Text in die Zwischenablage kopieren">${ICONS.copy} Kopieren</button>
        ${navigator.share ? `<button class="btn btn-secondary btn-sm" id="btn-share-list">${ICONS.share} Teilen</button>` : ""}
        <button class="btn btn-secondary btn-sm" id="btn-print">${ICONS.print} Drucken</button>
        <button class="btn btn-secondary btn-sm" id="btn-save-list">Speichern</button>
        <button class="btn btn-secondary btn-sm" id="btn-clear-list" ${total ? "" : "disabled"} title="Alle Positionen der aktuellen Einkaufsliste löschen" style="color: var(--error); border-color: rgba(239,68,68,0.4);">${ICONS.trash} Liste leeren</button>
      </div>
    </div>

    ${total ? `
      <div class="card rec-progress-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Einkaufsfortschritt</span>
          <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--lime);">${done}/${total} · ${pct}%</span>
        </div>
        <div class="rec-progress"><div style="width: ${pct}%"></div></div>
        ${pct === 100 ? `<p style="margin-top: 10px; color: var(--lime); font-size: 0.85rem; font-weight: 500;">🎉 Alles erledigt – nichts mehr einzupacken!</p>` : ""}
        ${done > 0 ? `<div style="display:flex; gap:8px; margin-top: 12px; flex-wrap: wrap;"><button class="btn btn-secondary btn-sm" id="btn-consume">${ICONS.box} ${done} gekauft → Bestand übernehmen</button></div>` : ""}
      </div>` : ""}

    ${selected.length ? `
      <div class="card" style="padding: 14px 16px; margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        <span style="font-size: 0.8rem; color: var(--text-muted); margin-right: 4px;">Rezepte:</span>
        ${selected.map((r) => {
          const sv = state.servings[r.id];
          const svText = sv ? ` <span class="rec-chip-sub">${sv} Port.</span>` : "";
          return `<span class="rec-chip">${escapeHtml(r.title)}${svText} <button class="rec-chip-x" data-recipe="${r.id}">×</button></span>`;
        }).join("")}
        <label style="margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-secondary); cursor: pointer;">
          <input type="checkbox" id="hide-done" ${state.hideDone ? "checked" : ""} /> Erledigte ausblenden
        </label>
        <button class="btn btn-secondary btn-sm" id="btn-clear-selection">Auswahl leeren</button>
      </div>` : `
      <div class="card rec-empty" style="margin-bottom: 16px;">
        ${ICONS.cart}
        <h3>Noch keine Rezepte ausgewählt</h3>
        <p style="color: var(--text-secondary); max-width: 460px; margin: 0 auto;">Gehe zu <b>Rezepte</b> und wähle Rezepte aus – die Einkaufsliste wird automatisch aus den Zutaten gebaut, die in deinem Bestand fehlen. Oder füge Artikel manuell hinzu.</p>
      </div>`}

    ${groups.length ? `
      <div style="margin-bottom: 24px;">
        <div class="rec-group-head" style="margin-bottom: 8px;"><span>${state.hideDone ? "Offene Positionen" : "Fehlende Zutaten"} (${visible.length})</span>
          <span style="display:flex; gap:10px;"><button class="rec-link" id="btn-check-all">Alle abhaken</button><button class="rec-link" id="btn-uncheck-all">Zurücksetzen</button></span>
        </div>
        ${groups.map(([cat, items]) => `
          <div class="rec-group">
            <div class="rec-group-head"><span>${escapeHtml(cat)}</span><span class="rec-group-count">${items.length}</span></div>
            <div class="rec-rows">
              ${items.map((i) => `
                <div class="rec-row ${i.done ? "done" : ""}" data-key="${escapeHtml(itemKey(i))}">
                  <button class="rec-check ${i.done ? "on" : ""}" data-key="${escapeHtml(itemKey(i))}">${i.done ? ICONS.check : ""}</button>
                  <span class="rec-name" style="${i.done ? "text-decoration: line-through; color: var(--text-muted);" : ""}">${escapeHtml(i.name)}</span>
                  <span class="rec-amount">${formatAmount(i)}</span>
                  <button class="rec-icon-btn danger" data-key="${escapeHtml(itemKey(i))}" data-remove title="Entfernen">${ICONS.trash}</button>
                </div>`).join("")}
            </div>
          </div>`).join("")}
      </div>` : `
      <div class="card rec-empty">
        ${ICONS.spark}
        <h3>${selected.length ? "Alles vorhanden! 🎉" : "Liste ist leer"}</h3>
        <p style="color: var(--text-secondary);">${selected.length ? "Für die ausgewählten Rezepte fehlt nichts in deinem Bestand." : "Klicke auf „Smart neu berechnen“, um die Liste aus deinen Rezepten zu bauen, oder füge Artikel manuell hinzu."}</p>
      </div>`}

    ${saved.length ? `
      <div class="rec-group" style="margin-top: 32px;">
        <div class="rec-group-head"><span>Gespeicherte Listen</span></div>
        <div class="rec-rows">
          ${saved.map((l) => `
            <div class="rec-row" data-list="${l.id}">
              <span class="rec-name">${escapeHtml(l.title)}</span>
              <span class="rec-amount">${l.items.length} Positionen</span>
              <button class="rec-icon-btn" data-load="${l.id}" title="Laden">${ICONS.link}</button>
              <button class="rec-icon-btn danger" data-dellist="${l.id}" title="Löschen">${ICONS.trash}</button>
            </div>`).join("")}
        </div>
      </div>` : ""}
  `;
}

// ============================================================
// Bindings
// ============================================================
function bindCurrentTab() {
  if (state.tab === "bestand") bindInventory();
  else if (state.tab === "rezepte") bindRecipes();
  else if (state.tab === "plan") bindPlan();
  else if (state.tab === "stats") bindStats();
  else bindShopping();
}

function bindInventory() {
  $("btn-add-item")?.addEventListener("click", () => openAddModal());
  $("btn-export")?.addEventListener("click", exportData);
  $("btn-import")?.addEventListener("click", importData);
  const search = $("inv-search");
  if (search) {
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      let items = q
        ? state.inventory.filter((i) => i.name.toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q))
        : state.inventory;
      items = items.filter((i) => {
        const exp = expiryInfo(i);
        if (state.invFilter === "expired") return !!exp && exp.expired;
        if (state.invFilter === "soon") return !!exp && !exp.expired && exp.soon;
        if (state.invFilter === "none") return !i.expires;
        return true;
      });
      const groups = groupByCategory(items);
      $("inv-groups").innerHTML = groups.map(([cat, items2]) => renderInvGroup(cat, items2)).join("");
      bindInvRows();
    });
  }
  document.querySelectorAll("#app-content .rec-filter").forEach((b) => {
    b.addEventListener("click", () => {
      state.invFilter = b.dataset.filter;
      renderContent();
    });
  });
  $("btn-show-expired")?.addEventListener("click", () => {
    state.invFilter = "expired";
    renderContent();
  });
  bindInvRows();
  bindSuggestionActions();
}
function bindInvRows() {
  document.querySelectorAll("#app-content .rec-row[data-id]").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-act="del"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(await confirmModal("Diesen Artikel aus dem Bestand entfernen?"))) return;
      state.inventory = state.inventory.filter((i) => i.id !== id);
      await persistInventory();
      renderContent();
      toast("Artikel entfernt.", "success");
    });
    row.querySelector('[data-act="edit"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = state.inventory.find((i) => i.id === id);
      if (item) openAmountEditor(item);
    });
  });
}

function bindRecipes() {
  $("btn-new-recipe")?.addEventListener("click", () => openRecipeModal());
  $("btn-seed")?.addEventListener("click", seedRecipes);
  $("btn-import-recipe")?.addEventListener("click", () => openImportRecipeModal());
  const f = state.recipeFilter;
  const q = $("rec-search");
  if (q) q.addEventListener("input", () => { f.query = q.value; rerenderRecipes(); });
  const ing = $("rec-ingredient");
  if (ing) ing.addEventListener("input", () => { f.ingredient = ing.value; rerenderRecipes(); });
  const status = $("rec-status");
  if (status) status.addEventListener("change", () => { f.status = status.value; rerenderRecipes(); });
  const sort = $("rec-sort");
  if (sort) sort.addEventListener("change", () => { f.sort = sort.value; rerenderRecipes(); });

  document.querySelectorAll("#app-content .rec-recipe").forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-act="view"]')?.addEventListener("click", () => openRecipeModal(id));
    card.querySelector('[data-act="fav"]')?.addEventListener("click", () => {
      if (state.favs.has(id)) { state.favs.delete(id); toast("Aus Favoriten entfernt.", "info"); }
      else { state.favs.add(id); toast("Zu Favoriten hinzugefügt.", "success"); }
      writeLS(LS.favs, [...state.favs]);
      rerenderRecipes();
    });
    card.querySelector('[data-act="toggleshop"]')?.addEventListener("click", () => {
      if (state.selectedRecipes.has(id)) {
        state.selectedRecipes.delete(id);
        delete state.servings[id];
        persistServings();
        writeLS(LS.selected, [...state.selectedRecipes]);
        renderTabs();
        rerenderRecipes();
        toast("Rezept abgewählt.", "info");
      } else {
        openServingsPicker(id);
      }
    });
  });
}

function rerenderRecipes() {
  const wrap = $("app-content");
  if (wrap) wrap.innerHTML = renderRecipes();
  bindRecipes();
}

// Portionen für ein Rezept wählen, bevor es zur Einkaufsliste kommt
function openServingsPicker(recipeId) {
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r) return;
  let servings = r.servings || 2;
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = [
    '<div class="rec-modal" style="max-width: 380px;">',
    '  <div class="rec-modal-head">',
    '    <h3 style="font-size: 1rem;">' + ICONS.cart + ' Für Einkaufsliste wählen</h3>',
    '    <button class="rec-icon-btn" data-close>' + ICONS.x + '</button>',
    '  </div>',
    '  <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 14px;">' + escapeHtml(r.title) + ' – für wie viele Portionen soll gerechnet werden?</p>',
    '  <div style="display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 18px;">',
    '    <button class="btn btn-secondary btn-sm" id="svc-pick-minus">−</button>',
    '    <span id="svc-pick-val" style="font-family: var(--font-mono); font-size: 1.15rem; min-width: 44px; text-align: center;">' + servings + '</span>',
    '    <button class="btn btn-secondary btn-sm" id="svc-pick-plus">+</button>',
    '    <span style="color: var(--text-muted); font-size: 0.78rem;">Portionen</span>',
    '  </div>',
    '  <div class="rec-modal-foot">',
    '    <button class="btn btn-secondary btn-sm" data-cancel>Abbrechen</button>',
    '    <button class="btn btn-lime btn-sm" id="btn-pick-confirm">' + ICONS.check + ' Hinzufügen</button>',
    '  </div>',
    '</div>',
  ].join("\n");
  document.body.appendChild(overlay);
  const val = overlay.querySelector("#svc-pick-val");
  const update = () => { val.textContent = servings; };
  overlay.querySelector("#svc-pick-minus").addEventListener("click", () => { if (servings > 1) { servings--; update(); } });
  overlay.querySelector("#svc-pick-plus").addEventListener("click", () => { if (servings < 20) { servings++; update(); } });
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-cancel]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#btn-pick-confirm").addEventListener("click", () => {
    state.selectedRecipes.add(recipeId);
    state.servings[recipeId] = servings;
    persistServings();
    writeLS(LS.selected, [...state.selectedRecipes]);
    close();
    renderTabs();
    rerenderRecipes();
    toast("Rezept (" + servings + " Port.) zur Einkaufsliste hinzugefügt.", "success");
  });
}
function bindShopping() {
  $("btn-shop-mode")?.addEventListener("click", () => { if (currentListItems.length) openShoppingMode(); });
  $("btn-consume")?.addEventListener("click", consumeDoneItems);

  $("btn-recalc")?.addEventListener("click", () => {
    const selected = scaledSelectedRecipes();
    if (!selected.length) { toast("Erst Rezepte auswählen (Tab „Rezepte“).", "warning"); return; }
    const t0 = performance.now();
    const grouped = buildShoppingList(selected, state.inventory);
    currentListItems = grouped.flatMap(([, items]) => items);
    persistCurrentList();
    toast(`Einkaufsliste mit ${currentListItems.length} Positionen erstellt (${Math.round(performance.now() - t0)} ms).`, "success");
    renderContent();
  });

  $("btn-add-manual")?.addEventListener("click", () => openAddModal(true));
  $("btn-copy-list")?.addEventListener("click", copyListText);
  $("btn-share-list")?.addEventListener("click", shareList);
  $("btn-print")?.addEventListener("click", printList);

  $("btn-clear-list")?.addEventListener("click", async () => {
    if (!currentListItems.length) { toast("Liste ist leer.", "warning"); return; }
    if (!(await confirmModal("Gesamte Einkaufsliste löschen? Alle Positionen werden entfernt."))) return;
    currentListItems = [];
    persistCurrentList();
    renderContent();
    toast("Einkaufsliste geleert.", "success");
  });

  $("btn-save-list")?.addEventListener("click", async () => {
    if (!currentListItems.length) { toast("Liste ist leer.", "warning"); return; }
    const title = ($("list-title")?.value || "").trim() || "Einkaufsliste";
    currentListTitle = title;
    const existing = state.lists.find((l) => l.title === title);
    if (existing) existing.items = currentListItems;
    else state.lists.unshift({ id: uuid(), title, items: currentListItems, created_at: new Date().toISOString() });
    persistCurrentList();
    await persistLists();
    toast("Liste gespeichert.", "success");
    renderContent();
  });

  $("btn-clear-selection")?.addEventListener("click", () => {
    state.selectedRecipes.clear();
    writeLS(LS.selected, []);
    renderContent();
  });

  const hideDone = $("hide-done");
  if (hideDone) hideDone.addEventListener("change", () => {
    state.hideDone = hideDone.checked;
    renderContent();
  });

  document.querySelectorAll("#app-content [data-recipe]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedRecipes.delete(btn.dataset.recipe);
      writeLS(LS.selected, [...state.selectedRecipes]);
      renderContent();
    });
  });

  document.querySelectorAll("#app-content .rec-check").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = currentListItems.find((i) => itemKey(i) === btn.dataset.key);
      if (item) item.done = !item.done;
      persistCurrentList();
      renderContent();
    });
  });

  document.querySelectorAll("#app-content [data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentListItems = currentListItems.filter((i) => itemKey(i) !== btn.dataset.key);
      persistCurrentList();
      renderContent();
    });
  });

  $("btn-check-all")?.addEventListener("click", () => {
    currentListItems.forEach((i) => (i.done = true));
    persistCurrentList();
    renderContent();
  });
  $("btn-uncheck-all")?.addEventListener("click", () => {
    currentListItems.forEach((i) => (i.done = false));
    persistCurrentList();
    renderContent();
  });

  document.querySelectorAll("#app-content [data-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = state.lists.find((l) => l.id === btn.dataset.load);
      if (!list) return;
      currentListItems = list.items.map((i) => ({ ...i }));
      currentListTitle = list.title;
      persistCurrentList();
      renderContent();
      toast(`Liste „${list.title}“ geladen.`, "success");
    });
  });

  document.querySelectorAll("#app-content [data-dellist]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmModal("Gespeicherte Liste löschen?"))) return;
      state.lists = state.lists.filter((l) => l.id !== btn.dataset.dellist);
      await persistLists();
      renderContent();
    });
  });

  const titleInput = $("list-title");
  if (titleInput) titleInput.addEventListener("input", () => { currentListTitle = titleInput.value; persistCurrentList(); });
}

// ============================================================
// Modal: Artikel hinzufügen (manuell / Kamera / Mikro)
// ============================================================
let addModalCandidates = [];
let installPrompt = null;

function openAddModal(forShoppingList = false) {
  addModalCandidates = [];
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal">
      <div class="rec-modal-head">
        <h3 style="font-size: 1.05rem;">Artikel hinzufügen</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 16px;">Synaptic Foundation Model · lokal · Eingabe wird automatisch erkannt</p>
      <div class="rec-source-grid">
        <button class="rec-source" data-mode="manual">${ICONS.type}<span>Manuell</span><small>Zutaten eintippen</small></button>
        <button class="rec-source" data-mode="camera">${ICONS.camera}<span>Kamera</span><small>Etikett scannen</small></button>
        <button class="rec-source" data-mode="mic">${ICONS.mic}<span>Sprache</span><small>Diktieren</small></button>
      </div>
      <div id="add-mode-body"></div>
      <div id="add-candidates"></div>
      <div class="rec-modal-foot" id="add-foot" style="display: none;">
        <button class="btn btn-secondary btn-sm" data-cancel>Abbrechen</button>
        <button class="btn btn-lime btn-sm" id="btn-confirm-add">${ICONS.plus} Hinzufügen (0)</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').addEventListener("click", () => { cleanupStream(); overlay.remove(); });
  overlay.querySelector('[data-cancel]').addEventListener("click", () => { cleanupStream(); overlay.remove(); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) { cleanupStream(); overlay.remove(); } });

  overlay.querySelector("#btn-confirm-add").addEventListener("click", async () => {
    const selected = addModalCandidates.filter((c) => c.selected);
    if (!selected.length) return;
    if (forShoppingList) {
      currentListItems = mergeItems([
        ...currentListItems,
        ...selected.map((s) => ({ name: s.name, amount: s.amount, unit: s.unit || "", category: s.category || "Sonstiges", done: false })),
      ]);
      persistCurrentList();
    } else {
      for (const s of selected) {
        const existing = state.inventory.find((i) => i.name === s.name && (i.unit || "") === (s.unit || ""));
        if (existing && s.amount != null && existing.amount != null) {
          existing.amount = Math.round((existing.amount + s.amount) * 100) / 100;
        } else {
          state.inventory.unshift({
            id: uuid(),
            name: s.name,
            amount: s.amount,
            unit: s.unit || "",
            category: s.category || "Sonstiges",
            source: s.source || "manual",
            created_at: new Date().toISOString(),
          });
        }
      }
      await persistInventory();
    }
    cleanupStream();
    overlay.remove();
    renderContent();
    toast(`${selected.length} Artikel hinzugefügt.`, "success");
  });

  overlay.querySelectorAll(".rec-source").forEach((b) => {
    b.addEventListener("click", () => activateAddMode(b.dataset.mode, overlay, forShoppingList));
  });
}

function activateAddMode(mode, overlay) {
  overlay.querySelectorAll(".rec-source").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  const body = overlay.querySelector("#add-mode-body");
  const foot = overlay.querySelector("#add-foot");
  cleanupStream();

  if (mode === "manual") {
    body.innerHTML = `
      <textarea id="manual-text" class="rec-input" rows="5" placeholder="z. B.&#10;2 Tomaten&#10;1 Zwiebel&#10;500 g Mehl&#10;Milch"></textarea>
      <div id="manual-suggest" class="rec-suggest" style="display:none;"></div>
      <button class="btn btn-secondary btn-sm" id="btn-parse" style="margin-top: 10px;">${ICONS.spark} Erkennen</button>
    `;
    const ta = body.querySelector("#manual-text");
    const suggest = body.querySelector("#manual-suggest");
    ta.addEventListener("input", () => {
      const last = ta.value.split(/[\n,;]/).pop().trim();
      const hits = last.length >= 2 ? searchLabels(last, 8) : [];
      if (!hits.length) { suggest.style.display = "none"; suggest.innerHTML = ""; return; }
      suggest.style.display = "flex";
      suggest.innerHTML = hits.map((h) => `<button type="button" class="rec-suggest-chip" data-label="${escapeHtml(h.name)}">${escapeHtml(h.name)}</button>`).join("");
      suggest.querySelectorAll("[data-label]").forEach((b) => b.addEventListener("click", () => {
        const parts = ta.value.split(/[\n,;]/);
        parts[parts.length - 1] = b.dataset.label;
        ta.value = parts.join("\n");
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        suggest.style.display = "none";
      }));
    });
    body.querySelector("#btn-parse").addEventListener("click", () => {
      addModalCandidates = parseText(ta.value).map((i) => ({ ...i, source: "manual", selected: true }));
      renderCandidates(overlay, foot);
    });
  } else if (mode === "camera") {
    body.innerHTML = `
      <div class="rec-cam">
        <video id="cam-video" autoplay playsinline muted style="width: 100%; border-radius: 8px; background: #000; max-height: 300px;"></video>
        <div class="rec-cam-actions">
          <button class="btn btn-lime btn-sm" id="btn-capture">${ICONS.camera} Foto aufnehmen</button>
          <button class="btn btn-secondary btn-sm" id="btn-barcode" style="display: none;">${ICONS.barcode} Barcode</button>
        </div>
        <p id="barcode-status" style="color: var(--lime); font-size: 0.78rem; margin-top: 8px; min-height: 18px;"></p>
        <div id="ocr-progress" style="display: none; margin-top: 10px;">
          <div class="rec-progress"><div id="ocr-bar" style="width: 0%"></div></div>
          <p id="ocr-status" style="color: var(--text-muted); font-size: 0.75rem; margin-top: 6px;">OCR läuft…</p>
        </div>
      </div>
    `;
    const video = body.querySelector("#cam-video");
    let bcBtn = null;
    let bcStatus = null;
    let detecting = false;
    let detTimer = null;
    const stopDetecting = () => {
      detecting = false;
      if (detTimer) { clearInterval(detTimer); detTimer = null; }
      if (bcBtn) bcBtn.innerHTML = `${ICONS.barcode} Barcode`;
      if (bcStatus) bcStatus.textContent = "";
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        window.__recStream = stream;
        video.srcObject = stream;
        video.play().catch(() => {});
      })
      .catch((e) => {
        body.innerHTML = `<p style="color: var(--error); font-size: 0.85rem;">Kamera nicht verfügbar: ${escapeHtml(e.message)}</p>`;
      });
    body.querySelector("#btn-capture").addEventListener("click", async () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      stopDetecting();
      cleanupStream();
      body.querySelector("#ocr-progress").style.display = "block";
      try {
        const items = await runOcr(dataUrl, body.querySelector("#ocr-bar"), body.querySelector("#ocr-status"));
        addModalCandidates = items.map((i) => ({ ...i, selected: true }));
        renderCandidates(overlay, foot);
        body.querySelector("#ocr-progress").style.display = "none";
      } catch (e) {
        body.querySelector("#ocr-progress").style.display = "none";
        body.innerHTML = `<p style="color: var(--error); font-size: 0.85rem;">OCR fehlgeschlagen: ${escapeHtml(e.message)}<br><span style="color: var(--text-muted);">Offline? Das OCR-Modell wird beim ersten Scan aus dem CDN geladen.</span></p>`;
      }
    });
    bcBtn = body.querySelector("#btn-barcode");
    bcStatus = body.querySelector("#barcode-status");
    if (bcBtn && "BarcodeDetector" in window) {
      bcBtn.style.display = "inline-flex";
      bcBtn.addEventListener("click", async () => {
        if (detecting) { stopDetecting(); return; }
        detecting = true;
        bcBtn.innerHTML = `${ICONS.barcode} Suche läuft… (Stopp)`;
        if (bcStatus) bcStatus.textContent = "Halte den Barcode ins Bild – wird automatisch erkannt.";
        try {
          const detector = new window.BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code", "data_matrix"],
          });
          detTimer = setInterval(async () => {
            try {
              const codes = await detector.detect(video);
              if (!codes || !codes.length) return;
              const raw = codes[0].rawValue;
              stopDetecting();
              cleanupStream();
              const known = state.inventory.find((i) => i.barcodes && i.barcodes.includes(raw));
              addModalCandidates = [{
                name: known ? known.name : "Artikel",
                amount: known ? known.amount : null,
                unit: known ? known.unit : "",
                category: known ? known.category : "Sonstiges",
                confidence: known ? 1 : 0.5,
                source: "barcode",
                raw,
                selected: true,
              }];
              if (bcStatus) bcStatus.textContent = `Barcode erkannt: ${raw}${known ? ` → ${known.name}` : " – Name bearbeiten & bestätigen"}`;
              renderCandidates(overlay, foot);
            } catch { /* einzelner Frame fehlgeschlagen – weiter scannen */ }
          }, 250);
        } catch (e) {
          detecting = false;
          bcBtn.innerHTML = `${ICONS.barcode} Barcode`;
          if (bcStatus) bcStatus.textContent = "Barcode-Erkennung nicht verfügbar: " + e.message;
        }
      });
    } else if (bcStatus) {
      bcStatus.textContent = "Barcode-Erkennung wird von diesem Browser nicht unterstützt (Chrome/Edge empfohlen).";
    }
  } else {
    body.innerHTML = `
      <div style="text-align: center; padding: 12px 0;">
        <button class="btn btn-lime" id="btn-mic">${ICONS.mic} Aufnahme starten</button>
        <p id="mic-status" style="color: var(--text-muted); font-size: 0.8rem; margin-top: 12px;">Sage z. B. „zwei Tomaten, eine Zwiebel, fünfhundert Gramm Mehl“</p>
        <p id="mic-interim" style="color: var(--lime); font-size: 0.85rem; margin-top: 8px; min-height: 20px;"></p>
      </div>
    `;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      body.innerHTML = `<p style="color: var(--warning); font-size: 0.85rem;">Spracherkennung wird von diesem Browser nicht unterstützt. Nutze Chrome oder Edge – oder die manuelle Eingabe.</p>`;
      return;
    }
    let recognition = null;
    let finalText = "";
    const btn = body.querySelector("#btn-mic");
    const status = body.querySelector("#mic-status");
    const interim = body.querySelector("#mic-interim");

    const stop = () => {
      try { recognition?.stop(); } catch { /* noop */ }
      btn.innerHTML = `${ICONS.mic} Aufnahme starten`;
      btn.classList.remove("rec-recording");
      status.textContent = "Fertig. Erkanntes wird jetzt verarbeitet…";
    };
    const start = () => {
      finalText = "";
      recognition = new SR();
      recognition.lang = "de-DE";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.onresult = (e) => {
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + " ";
          else interimText += r[0].transcript;
        }
        interim.textContent = (finalText + interimText).trim();
      };
      recognition.onend = () => {
        btn.innerHTML = `${ICONS.mic} Aufnahme starten`;
        btn.classList.remove("rec-recording");
        status.textContent = "Verarbeite Sprache…";
        const items = parseText(finalText || interim.textContent).map((i) => ({ ...i, source: "mic", selected: true }));
        if (items.length) {
          addModalCandidates = items;
          renderCandidates(overlay, foot);
          status.textContent = `${items.length} Artikel erkannt.`;
        } else {
          status.textContent = "Nichts Verständliches erkannt. Bitte erneut versuchen.";
        }
      };
      recognition.onerror = (e) => {
        status.textContent = "Fehler: " + e.error;
        btn.classList.remove("rec-recording");
      };
      recognition.start();
    };

    btn.addEventListener("click", () => {
      if (btn.classList.contains("rec-recording")) stop();
      else {
        btn.innerHTML = `${ICONS.mic} Aufnahme läuft… (klicken zum Stoppen)`;
        btn.classList.add("rec-recording");
        start();
      }
    });
  }
}

async function runOcr(dataUrl, bar, statusEl) {
  const { createWorker } = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm");
  statusEl.textContent = "OCR-Modell wird geladen (erster Scan)…";
  const worker = await createWorker("deu+eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && bar) {
        bar.style.width = Math.round(m.progress * 100) + "%";
        statusEl.textContent = `Text wird erkannt… ${Math.round(m.progress * 100)}%`;
      }
    },
  });
  const { data } = await worker.recognize(dataUrl);
  await worker.terminate();
  return extractFromOcr(data.text);
}

function cleanupStream() {
  if (window.__recStream) {
    window.__recStream.getTracks().forEach((t) => t.stop());
    window.__recStream = null;
  }
}

function renderCandidates(overlay, foot) {
  const wrap = overlay.querySelector("#add-candidates");
  const confirmBtn = overlay.querySelector("#btn-confirm-add");
  if (!addModalCandidates.length) {
    wrap.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">Nichts erkannt. Versuche es erneut oder korrigiere die Eingabe.</p>`;
    foot.style.display = "none";
    return;
  }
  wrap.innerHTML = `
    <div class="rec-group" style="margin-top: 16px;">
      <div class="rec-group-head"><span>Erkannte Artikel (${addModalCandidates.length})</span><span class="rec-group-count">klick zum Bearbeiten</span></div>
      <div class="rec-rows">
        ${addModalCandidates.map((c, idx) => `
          <div class="rec-row" data-idx="${idx}">
            <button class="rec-check ${c.selected ? "on" : ""}" data-toggle="${idx}">${c.selected ? ICONS.check : ""}</button>
            <span class="rec-name">
              <input class="rec-inline-input" data-field="name" data-idx="${idx}" value="${escapeHtml(c.name)}" style="font-weight: 500;" />
              <span style="display:flex; gap:6px; margin-top:4px;">
                <input class="rec-inline-input" data-field="amount" data-idx="${idx}" value="${c.amount ?? ""}" placeholder="Menge" style="width: 70px;" />
                <input class="rec-inline-input" data-field="unit" data-idx="${idx}" value="${escapeHtml(c.unit)}" placeholder="Einheit" style="width: 90px;" />
              </span>
            </span>
            <span class="rec-conf">${Math.round(c.confidence * 100)}%</span>
          </div>`).join("")}
      </div>
    </div>
  `;
  foot.style.display = "flex";

  wrap.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = addModalCandidates[Number(btn.dataset.toggle)];
      c.selected = !c.selected;
      btn.classList.toggle("on", c.selected);
      btn.innerHTML = c.selected ? ICONS.check : "";
      updateConfirmCount(confirmBtn);
    });
  });
  wrap.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const c = addModalCandidates[Number(input.dataset.idx)];
      const field = input.dataset.field;
      if (field === "amount") c.amount = input.value.trim() === "" ? null : Number(String(input.value).replace(",", "."));
      else if (field === "unit") c.unit = input.value.trim();
      else c.name = input.value.trim();
    });
  });
  updateConfirmCount(confirmBtn);
}

function updateConfirmCount(btn) {
  const n = addModalCandidates.filter((c) => c.selected).length;
  btn.innerHTML = `${ICONS.plus} Hinzufügen (${n})`;
  btn.disabled = n === 0;
}

// ============================================================
// Modal: Menge bearbeiten
// ============================================================
function openAmountEditor(item) {
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal" style="max-width: 380px;">
      <div class="rec-modal-head">
        <h3 style="font-size: 1rem;">${escapeHtml(item.name)}</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <input id="edit-amount" class="rec-input" type="number" step="any" min="0" value="${item.amount ?? ""}" placeholder="Menge" style="width: 110px;" />
        <input id="edit-unit" class="rec-input" value="${escapeHtml(item.unit)}" placeholder="Einheit" style="flex: 1;" />
      </div>
      <label class="rec-label" style="margin-top: 12px;">Mindesthaltbarkeit (optional)</label>
      <input id="edit-expires" class="rec-input" type="date" value="${escapeHtml(item.expires || "")}" style="width: 100%;" />
      <div class="rec-modal-foot">
        <button class="btn btn-secondary btn-sm" data-close2>Abbrechen</button>
        <button class="btn btn-lime btn-sm" id="btn-save-edit">Speichern</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-close2]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#btn-save-edit").addEventListener("click", async () => {
    const a = overlay.querySelector("#edit-amount").value.trim();
    item.amount = a === "" ? null : Number(a.replace(",", "."));
    item.unit = overlay.querySelector("#edit-unit").value.trim();
    item.expires = overlay.querySelector("#edit-expires")?.value || null;
    await persistInventory();
    close();
    renderContent();
    toast("Bestand aktualisiert.", "success");
  });
}

// ============================================================
// Modal: Rezept anlegen / ansehen (mit Portionen-Skalierung)
// ============================================================
function openRecipeModal(id) {
  const existing = id ? state.recipes.find((r) => r.id === id) : null;
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal rec-modal-lg">
      <div class="rec-modal-head">
        <h3 style="font-size: 1.05rem;">${existing ? "Rezept-Details" : "Neues Rezept"}</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <div id="recipe-body">${existing ? renderRecipeDetail(existing, existing.servings || 2) : renderRecipeForm()}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close]").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  if (existing) {
    const body = overlay.querySelector("#recipe-body");
    const renderDetail = (servings) => {
      body.innerHTML = renderRecipeDetail(existing, servings);
      body.querySelector("#svc-minus")?.addEventListener("click", () => { if (servings > 1) renderDetail(servings - 1); });
      body.querySelector("#svc-plus")?.addEventListener("click", () => { if (servings < 20) renderDetail(servings + 1); });
      body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
        body.innerHTML = renderRecipeForm(existing);
        bindRecipeForm(overlay);
      }));
      body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        if (!(await confirmModal(`Rezept „${existing.title}“ löschen?`))) return;
        state.recipes = state.recipes.filter((r) => r.id !== existing.id);
        state.selectedRecipes.delete(existing.id);
        delete state.servings[existing.id];
        persistServings();
        await persistRecipes();
        overlay.remove();
        renderContent();
        toast("Rezept gelöscht.", "success");
      }));
      body.querySelector("[data-copy]")?.addEventListener("click", () => copyRecipeText(existing, servings));
      body.querySelector("[data-print]")?.addEventListener("click", () => printRecipe(existing, servings));
      body.querySelector("[data-cook]")?.addEventListener("click", async () => {
        const factor = servings / (existing.servings || 2);
        const scaled = scaleIngredients(existing.ingredients || [], factor);
        const withAmount = scaled.filter((i) => i.amount != null);
        if (!withAmount.length) { toast("Keine Mengenangaben zum Abziehen.", "warning"); return; }
        if (!(await confirmModal(`Zutaten von „${existing.title}“ (${servings} Port.) aus dem Bestand abziehen? ${withAmount.length} Artikel werden reduziert.`))) return;
        const removed = subtractIngredients(withAmount);
        await persistInventory();
        overlay.remove();
        renderContent();
        toast(removed ? `Gekocht! ${removed} ${removed === 1 ? "Artikel war" : "Artikel waren"} aufgebraucht und entfernt.` : "Gekocht – Bestand aktualisiert.", "success");
      });
    };
    renderDetail(existing.servings || 2);
  } else {
    bindRecipeForm(overlay);
  }
}

function renderRecipeDetail(r, servings) {
  const factor = servings / (r.servings || 2);
  const scaled = scaleIngredients(r.ingredients || [], factor);
  const cov = inventoryCoverage(scaled, state.inventory);
  return `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
      <div>
        <h2 style="font-size: 1.4rem; margin-bottom: 4px;">${escapeHtml(r.title)}</h2>
        <p style="color: var(--text-muted); font-size: 0.8rem;">${servings} Portionen · ${(r.ingredients || []).length} Zutaten · ${r.is_public ? "öffentlich" : "privat"}${recipeSourceLabel(r) ? ` · ${escapeHtml(recipeSourceLabel(r))}` : ""}</p>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn btn-secondary btn-sm" id="svc-minus" title="Weniger Portionen">−</button>
        <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); min-width: 30px; text-align: center;">${servings}</span>
        <button class="btn btn-secondary btn-sm" id="svc-plus" title="Mehr Portionen">+</button>
      </div>
    </div>
    ${(r.tags || []).length ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom: 16px;">${r.tags.map((t) => `<span class="rec-chip">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    <div style="margin-bottom: 16px;">
      <div class="rec-group-head" style="margin-bottom: 8px;"><span>Zutaten (${cov.have}/${cov.total} im Bestand${factor !== 1 ? ` · skaliert ×${factor}` : ""})</span>
        <span class="rec-coverage ${cov.complete ? "ok" : ""}" style="font-size: 0.7rem;">${cov.complete ? "✅ Alles vorhanden" : `${cov.missing.length} fehlen`}</span>
      </div>
      <div class="rec-rows">
        ${scaled.map((i) => {
          const have = state.inventory.some((inv) => inv.name.toLowerCase() === i.name.toLowerCase());
          return `<div class="rec-row ${have ? "done" : ""}">
            <span class="rec-check ${have ? "on" : ""}">${have ? ICONS.check : ""}</span>
            <span class="rec-product-emoji">${productIcon(i)}</span>
            <span class="rec-name">${escapeHtml(i.name)}</span>
            <span class="rec-amount">${formatAmount(i)}</span>
          </div>`;
        }).join("")}
      </div>
    </div>
    ${r.instructions ? `<div style="margin-bottom: 16px;"><div class="rec-group-head" style="margin-bottom: 8px;"><span>Zubereitung</span></div><p style="color: var(--text-secondary); font-size: 0.88rem; white-space: pre-wrap; line-height: 1.7;">${escapeHtml(r.instructions)}</p></div>` : ""}
    ${r.sourceUrl ? `<p style="margin: 0 0 12px; font-size: 0.8rem;"><a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener" style="color: var(--lime);">${ICONS.link} Original-Rezept öffnen ↗</a></p>` : ""}
    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; flex-wrap: wrap;">
      <button class="btn btn-secondary btn-sm" data-del>${ICONS.trash} Löschen</button>
      <button class="btn btn-secondary btn-sm" data-copy>${ICONS.copy} Kopieren</button>
      <button class="btn btn-secondary btn-sm" data-print>${ICONS.print} Drucken</button>
      <button class="btn btn-secondary btn-sm" data-cook title="Verbrauchte Zutaten aus dem Bestand abziehen">${ICONS.check} Kochen – Bestand abziehen</button>
      <button class="btn btn-lime btn-sm" data-edit>${ICONS.edit} Bearbeiten</button>
    </div>
  `;
}

function copyRecipeText(r, servings) {
  const factor = servings / (r.servings || 2);
  const scaled = scaleIngredients(r.ingredients || [], factor);
  const text = [
    `🍳 ${r.title} (${servings} Portionen)`,
    "",
    "Zutaten:",
    ...scaled.map((i) => `- ${formatAmount(i)} ${i.name}`.trim()),
    "",
    r.instructions ? `Zubereitung:\n${r.instructions}` : "",
    "",
    "Erstellt mit der xSyna Rezeptliste (lokal & offline)",
  ].filter((l) => l !== "").join("\n");
  const done = () => toast("Rezept in die Zwischenablage kopiert.", "success");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { if (fallbackCopy(text)) done(); });
  } else {
    fallbackCopy(text);
    done();
  }
}

function printRecipe(r, servings) {
  const factor = servings / (r.servings || 2);
  const scaled = scaleIngredients(r.ingredients || [], factor);
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) { toast("Popup wurde blockiert – bitte erlauben und erneut versuchen.", "warning"); return; }
  const content = [
    `<h1>${escapeHtml(r.title)}</h1>`,
    `<p class="meta">${servings} Portionen</p>`,
    `<h2>Zutaten</h2>`,
    `<ul>${scaled.map((i) => `<li>${escapeHtml(formatAmount(i))} ${escapeHtml(i.name)}</li>`).join("")}</ul>`,
    r.instructions ? `<h2>Zubereitung</h2><p class="steps">${escapeHtml(r.instructions)}</p>` : "",
  ].join("");
  win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(r.title)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:26px;margin-bottom:4px}.meta{color:#666;margin-top:0}h2{margin-top:28px;font-size:15px;text-transform:uppercase;letter-spacing:.05em;color:#333}ul{padding-left:20px;line-height:1.7}li{margin-bottom:2px}.steps{line-height:1.8;white-space:pre-wrap}</style></head><body>${content}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function renderRecipeForm(r) {
  const ingredientsText = r ? (r.ingredients || []).map((i) => `${formatAmount(i)} ${i.name}`.trim()).join("\n") : "";
  return `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; gap: 10px;">
        <input id="rf-title" class="rec-input" placeholder="Titel, z. B. Spaghetti Bolognese" value="${escapeHtml(r?.title || "")}" style="flex: 1;" />
        <input id="rf-servings" class="rec-input" type="number" min="1" value="${r?.servings || 2}" style="width: 90px;" title="Portionen" />
      </div>
      <div>
        <label class="rec-label">Zutaten (eine pro Zeile – wird automatisch erkannt)</label>
        <textarea id="rf-ingredients" class="rec-input" rows="6" placeholder="400 g Spaghetti&#10;2 Tomaten&#10;1 Zwiebel">${escapeHtml(ingredientsText)}</textarea>
      </div>
      <div>
        <label class="rec-label">Zubereitung</label>
        <textarea id="rf-instructions" class="rec-input" rows="4" placeholder="Schritt für Schritt…">${escapeHtml(r?.instructions || "")}</textarea>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <input id="rf-tags" class="rec-input" placeholder="Tags (kommagetrennt), z. B. Pasta, Vegetarisch" value="${escapeHtml((r?.tags || []).join(", "))}" style="flex: 1;" />
        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap;">
          <input type="checkbox" id="rf-public" ${r?.is_public ? "checked" : ""} /> öffentlich
        </label>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
        <button class="btn btn-secondary btn-sm" data-cancel>Abbrechen</button>
        <button class="btn btn-lime btn-sm" id="btn-save-recipe" data-edit-id="${r?.id || ""}">${ICONS.spark} Speichern</button>
      </div>
    </div>
  `;
}

function bindRecipeForm(overlay) {
  overlay.querySelector("[data-cancel]")?.addEventListener("click", () => overlay.remove());
  overlay.querySelector("#btn-save-recipe").addEventListener("click", async () => {
    const title = overlay.querySelector("#rf-title").value.trim();
    if (!title) { toast("Bitte einen Titel angeben.", "error"); return; }
    const rawIngredients = overlay.querySelector("#rf-ingredients").value;
    const ingredients = mergeItems(parseText(rawIngredients)).map((i) => ({
      name: i.name, amount: i.amount, unit: i.unit, category: i.category,
    }));
    const servings = Math.max(1, parseInt(overlay.querySelector("#rf-servings").value, 10) || 2);
    const instructions = overlay.querySelector("#rf-instructions").value.trim();
    const tags = overlay.querySelector("#rf-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const isPublic = overlay.querySelector("#rf-public").checked;

    const editing = overlay.querySelector("#btn-save-recipe").dataset.editId || null;
    if (editing) {
      const r = state.recipes.find((x) => x.id === editing);
      if (r) Object.assign(r, { title, servings, ingredients, instructions, tags, is_public: isPublic });
    } else {
      state.recipes.unshift({ id: uuid(), title, servings, ingredients, instructions, tags, is_public: isPublic, created_at: new Date().toISOString() });
    }
    await persistRecipes();
    overlay.remove();
    renderContent();
    toast(`Rezept „${title}“ gespeichert (${ingredients.length} Zutaten erkannt).`, "success");
  });
}

// ============================================================
// Model-Info
// ============================================================
function openModelInfo() {
  const info = modelInfo();
  const kb = kbStats();
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal" style="max-width: 480px;">
      <div class="rec-modal-head">
        <h3 style="font-size: 1rem;">${ICONS.spark} ${escapeHtml(info.name)}</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <div class="terminal" style="margin-top: 12px;">
        <div class="terminal-header">
          <span class="terminal-dot terminal-dot-red"></span>
          <span class="terminal-dot terminal-dot-yellow"></span>
          <span class="terminal-dot terminal-dot-green"></span>
        </div>
        <div class="terminal-body" style="margin: 0;">
          <span style="color: var(--lime);">model</span>  ${escapeHtml(info.name)} v${info.version}
          <span style="color: var(--lime);">runtime</span>  ${escapeHtml(info.runtime)}
          <span style="color: var(--lime);">locale</span>  ${escapeHtml(info.locale)}
          <span style="color: var(--lime);">engines</span> ${info.engines.map((e) => escapeHtml(e)).join(" · ")}
          <span style="color: var(--lime);">labels</span>  ${kb.labels} Lebensmittel-Labels (${kb.aliases} Aliase)
          <span style="color: var(--lime);">parses</span>  ${info.stats.parses} (ø ${info.stats.avgMs.toFixed(1)} ms)
          <span style="color: var(--lime);">privacy</span> 100% lokal – keine Daten verlassen das Gerät
        </div>
      </div>
      <div class="rec-modal-foot">
        <button class="btn btn-secondary btn-sm" data-close2>Schließen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-close2]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

// ============================================================
// WOCHENPLAN (lokal)
// ============================================================
// Eindeutiger Schlüssel für Listeneinträge (Name + Einheit), damit
// „2 EL Milch“ und „1 l Milch“ nicht durcheinander abgehakt werden.
function itemKey(i) {
  return `${i.name}|${i.unit || ""}`;
}

// MHD / Mindesthaltbarkeit
function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
function expiryInfo(item) {
  const days = daysUntil(item.expires);
  if (days == null) return null;
  return { days, expired: days < 0, soon: days >= 0 && days <= 5 };
}
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function labelLike(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}
function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Montag-basierte Kalenderwoche (ISO 8601)
function weekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
}

function weekDates(offset) {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Montag = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + offset * 7);
  monday.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function recipeById(id) {
  return state.recipes.find((r) => r.id === id);
}

function planSlotsOf(week) {
  const mealLabels = ["fruehstueck", "mittag", "abend"];
  return week.flatMap((d) => {
    const iso = isoDateLocal(d);
    const day = state.plan[iso] || {};
    return mealLabels.map((meal) => ({ iso, date: d, meal, recipeId: day[meal] || null }));
  });
}

function planWeekCount() {
  const week = weekDates(state.planWeekOffset);
  return planSlotsOf(week).filter((s) => s.recipeId).length;
}

function renderPlan() {
  const week = weekDates(state.planWeekOffset);
  const kw = weekNumber(week[0]);
  const todayIso = isoDateLocal(new Date());
  const slots = planSlotsOf(week);
  const mealLabels = { fruehstueck: "Frühstück", mittag: "Mittag", abend: "Abend" };
  const totalPlanned = slots.filter((s) => s.recipeId).length;
  const daysDone = week.filter((d) => state.plan[isoDateLocal(d)]?.done).length;

  return `
    <div class="rec-toolbar">
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-sm" id="plan-prev" title="Vorherige Woche">←</button>
        <span class="rec-kpi" style="font-size: 0.85rem;">Kalenderwoche ${kw}</span>
        <button class="btn btn-secondary btn-sm" id="plan-next" title="Nächste Woche">→</button>
        <button class="btn btn-secondary btn-sm" id="plan-today">Diese Woche</button>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <span class="rec-kpi">${totalPlanned} geplante Mahlzeiten</span>
        <span class="rec-kpi">${daysDone}/7 Tage erledigt</span>
        <button class="btn btn-lime btn-sm" id="btn-plan-shop" ${totalPlanned ? "" : "disabled"} title="Fehlende Zutaten aller geplanten Rezepte in die Einkaufsliste übernehmen">${ICONS.cart} Plan → Einkaufsliste</button>
      </div>
    </div>

    <div class="plan-grid">
      ${week.map((d) => {
        const iso = isoDateLocal(d);
        const day = state.plan[iso] || {};
        const isToday = iso === todayIso;
        return `
        <div class="plan-day ${isToday ? "today" : ""} ${day.done ? "done" : ""}">
          <div class="plan-day-head">
            <div>
              <div class="plan-weekday">${d.toLocaleDateString("de-DE", { weekday: "short" })}</div>
              <div class="plan-date">${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</div>
            </div>
            <button class="plan-done-btn ${day.done ? "on" : ""}" data-day="${iso}" title="Tag als erledigt markieren">${ICONS.check}</button>
          </div>
          ${["fruehstueck", "mittag", "abend"].map((meal) => {
            const rid = day[meal];
            const r = rid ? recipeById(rid) : null;
            return `
            <div class="plan-meal">${mealLabels[meal]}</div>
            <button class="plan-slot ${r ? "filled" : ""}" data-day="${iso}" data-meal="${meal}">
              ${r ? `${ICONS.book} ${escapeHtml(r.title)}` : `${ICONS.plus} Planen`}
            </button>`;
          }).join("")}
        </div>`;
      }).join("")}
    </div>

    ${totalPlanned === 0 ? `
      <div class="card rec-empty" style="margin-top: 20px;">
        ${ICONS.calendar}
        <h3>Noch nichts geplant</h3>
        <p style="color: var(--text-secondary); max-width: 480px; margin: 0 auto;">Wähle für jeden Tag bis zu drei Rezepte (Frühstück, Mittag, Abend). Aus dem Plan lässt sich die komplette Woche per Klick in eine Einkaufsliste verwandeln.</p>
      </div>` : ""}
  `;
}

function bindPlan() {
  $("plan-prev")?.addEventListener("click", () => { state.planWeekOffset -= 1; renderTabs(); renderContent(); });
  $("plan-next")?.addEventListener("click", () => { state.planWeekOffset += 1; renderTabs(); renderContent(); });
  $("plan-today")?.addEventListener("click", () => { state.planWeekOffset = 0; renderTabs(); renderContent(); });

  document.querySelectorAll("#app-content .plan-slot").forEach((b) => {
    b.addEventListener("click", () => openPlanPicker(b.dataset.day, b.dataset.meal));
  });
  document.querySelectorAll("#app-content .plan-done-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const iso = b.dataset.day;
      state.plan[iso] = state.plan[iso] || {};
      state.plan[iso].done = !state.plan[iso].done;
      writeLS(LS.plan, state.plan);
      renderContent();
    });
  });
  $("btn-plan-shop")?.addEventListener("click", () => {
    const week = weekDates(state.planWeekOffset);
    const ids = new Set();
    for (const d of week) {
      const day = state.plan[isoDateLocal(d)] || {};
      for (const meal of ["fruehstueck", "mittag", "abend"]) if (day[meal]) ids.add(day[meal]);
    }
    const planned = state.recipes
      .filter((r) => ids.has(r.id))
      .map((r) => {
        const servings = state.servings[r.id] || r.servings || 2;
        const factor = servings / (r.servings || 2);
        return { ...r, servings, ingredients: scaleIngredients(r.ingredients || [], factor) };
      });
    if (!planned.length) { toast("In dieser Woche ist nichts geplant.", "warning"); return; }
    const grouped = buildShoppingList(planned, state.inventory);
    currentListItems = grouped.flatMap(([, items]) => items);
    currentListTitle = `Wochenplan KW ${weekNumber(week[0])}`;
    persistCurrentList();
    toast(`Einkaufsliste aus ${planned.length} geplanten Rezepten erstellt (${currentListItems.length} Positionen).`, "success");
    state.tab = "einkauf";
    renderTabs();
    renderContent();
  });
}

function openPlanPicker(iso, meal) {
  const mealLabels = { fruehstueck: "Frühstück", mittag: "Mittag", abend: "Abend" };
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal" style="max-width: 480px;">
      <div class="rec-modal-head">
        <h3 style="font-size: 1rem;">${escapeHtml(iso)} · ${mealLabels[meal]}</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <input id="picker-search" class="rec-input" placeholder="Rezept suchen…" style="width: 100%; margin-bottom: 12px;" />
      <div id="picker-list" style="max-height: 320px; overflow-y: auto; display:flex; flex-direction:column; gap:6px;"></div>
      <div class="rec-modal-foot">
        <button class="btn btn-secondary btn-sm" data-clear ${state.plan[iso]?.[meal] ? "" : "disabled"}>Entfernen</button>
        <button class="btn btn-secondary btn-sm" data-close2>Schließen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const listEl = overlay.querySelector("#picker-list");

  const renderList = (q) => {
    const qn = q.trim().toLowerCase();
    const recipes = state.recipes
      .filter((r) => !qn || (r.title + " " + (r.tags || []).join(" ")).toLowerCase().includes(qn))
      .sort((a, b) => {
        const fa = state.favs.has(a.id) ? 1 : 0;
        const fb = state.favs.has(b.id) ? 1 : 0;
        return fb - fa || a.title.localeCompare(b.title, "de");
      });
    listEl.innerHTML = recipes.length
      ? recipes.map((r) => {
          const current = state.plan[iso]?.[meal] === r.id;
          return `
          <button class="plan-pick ${current ? "current" : ""}" data-id="${r.id}">
            <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.title)}</span>
            ${state.favs.has(r.id) ? `<span style="color: var(--amber);">${ICONS.star}</span>` : ""}
            ${current ? `<span style="color: var(--lime); font-size: 0.72rem;">aktuell</span>` : ""}
          </button>`;
        }).join("")
      : `<p style="color: var(--text-muted); font-size: 0.82rem; padding: 8px 4px;">Keine Rezepte gefunden.</p>`;
    listEl.querySelectorAll("[data-id]").forEach((b) => {
      b.addEventListener("click", () => {
        state.plan[iso] = state.plan[iso] || {};
        state.plan[iso][meal] = b.dataset.id;
        writeLS(LS.plan, state.plan);
        overlay.remove();
        renderTabs();
        renderContent();
        toast("Geplant.", "success");
      });
    });
  };
  renderList("");

  overlay.querySelector("#picker-search").addEventListener("input", (e) => renderList(e.target.value));
  overlay.querySelector("[data-clear]").addEventListener("click", () => {
    state.plan[iso] = state.plan[iso] || {};
    delete state.plan[iso][meal];
    writeLS(LS.plan, state.plan);
    overlay.remove();
    renderTabs();
    renderContent();
  });
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-close2]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

// ============================================================
// STATISTIK (lokal – Einkaufs-Historie)
// ============================================================
function renderStats() {
  const h = state.history;
  const counts = new Map();
  const cats = new Map();
  for (const e of h) {
    counts.set(e.name, (counts.get(e.name) || 0) + 1);
    cats.set(e.category || "Sonstiges", (cats.get(e.category || "Sonstiges") || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topCats = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCount = top.length ? top[0][1] : 1;
  const maxCat = topCats.length ? topCats[0][1] : 1;
  const recent = h.slice(0, 10);
  const uniqueItems = new Set(h.map((e) => e.name)).size;

  return `
    <div class="rec-kpis">
      <span class="rec-kpi">🛒 ${h.length} Einkäufe erfasst</span>
      <span class="rec-kpi">${uniqueItems} verschiedene Artikel</span>
      <span class="rec-kpi">📦 ${state.inventory.length} Artikel im Bestand</span>
      <span class="rec-kpi">📖 ${state.recipes.length} Rezepte</span>
    </div>
    ${h.length ? `
      <div class="rec-group">
        <div class="rec-group-head"><span>Am häufigsten gekauft</span></div>
        <div class="card" style="padding: 16px 18px;">
          ${top.map(([name, n]) => `
            <div class="stat-row">
              <span class="stat-name">${escapeHtml(name)}</span>
              <div class="stat-bar"><div style="width: ${Math.max(6, (n / maxCount) * 100)}%"></div></div>
              <span class="stat-count">${n}×</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="rec-group">
        <div class="rec-group-head"><span>Kategorien</span></div>
        <div class="card" style="padding: 16px 18px;">
          ${topCats.map(([cat, n]) => `
            <div class="stat-row">
              <span class="stat-name">${escapeHtml(cat)}</span>
              <div class="stat-bar bar-amber"><div style="width: ${Math.max(6, (n / maxCat) * 100)}%"></div></div>
              <span class="stat-count">${n}×</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="rec-group">
        <div class="rec-group-head"><span>Letzte Einkäufe</span></div>
        <div class="rec-rows">
          ${recent.map((e) => `
            <div class="rec-row">
              <span class="rec-name">${escapeHtml(e.name)}</span>
              <span class="rec-amount">${formatAmount(e)}</span>
              <span class="rec-amount" style="color: var(--text-muted);">${new Date(e.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
            </div>`).join("")}
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top: 8px;">
        <button class="btn btn-secondary btn-sm" id="btn-clear-history">Statistik löschen</button>
      </div>
    ` : `
      <div class="card rec-empty">
        ${ICONS.chart}
        <h3>Noch keine Statistik</h3>
        <p style="color: var(--text-secondary); max-width: 460px; margin: 0 auto;">Sobald du im Einkaufsmodus Artikel abhakst und in den Bestand übernimmst, werden deine Einkäufe hier lokal ausgewertet – völlig ohne Cloud.</p>
      </div>`}
  `;
}

function bindStats() {
  $("btn-clear-history")?.addEventListener("click", async () => {
    if (!(await confirmModal("Gesamte Einkaufs-Statistik löschen? Die Bestandsdaten bleiben erhalten."))) return;
    state.history = [];
    writeLS(LS.history, []);
    renderContent();
    toast("Statistik gelöscht.", "success");
  });
}

// ============================================================
// Liste kopieren / teilen
// ============================================================
function fallbackCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

function copyListText() {
  if (!currentListItems.length) { toast("Liste ist leer.", "warning"); return; }
  const text = [
    `🛒 ${currentListTitle}`,
    ...currentListItems.map((i) => `${i.done ? "[x]" : "[ ]"} ${formatAmount(i)} ${i.name}`),
    "",
    "Erstellt mit der xSyna Rezeptliste (lokal & offline)",
  ].join("\n");
  const done = () => toast("Liste in die Zwischenablage kopiert.", "success");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { if (fallbackCopy(text)) done(); });
  } else {
    fallbackCopy(text);
    done();
  }
}

async function shareList() {
  if (!currentListItems.length) { toast("Liste ist leer.", "warning"); return; }
  const text = currentListItems.map((i) => `${i.done ? "[x]" : "[ ]"} ${formatAmount(i)} ${i.name}`).join("\n");
  if (navigator.share) {
    try {
      await navigator.share({ title: currentListTitle, text });
      toast("Geteilt.", "success");
    } catch { /* abgebrochen */ }
  } else {
    copyListText();
  }
}

// ============================================================
// Rezept aus Text importieren (wird automatisch geparst)
// ============================================================
function parseRecipeImport(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  let idx = 0;
  const portionsMatch = lines[0].match(/^(\d+(?:[.,]\d+)?)\s*(Portionen?|Personen?)$/i);
  if (portionsMatch) idx = 1;
  const title = (lines[idx] || "Unbenanntes Rezept").slice(0, 80);
  const ingredients = [];
  const instructions = [];
  let servings = 2;

  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    const pm = line.match(/^(\d+(?:[.,]\d+)?)\s*(Portionen?|Personen?)$/i);
    if (pm) { servings = Math.max(1, Math.round(Number(pm[1].replace(",", ".")))); continue; }
    if (/^(zubereitung|anleitung|rezept|zutaten)\s*:?$/i.test(line)) continue;
    const isStep = /^\d+[.)]\s/.test(line);
    const item = parseLine(line);
    const known = item.confidence >= 0.85;
    const isIngredient =
      !isStep &&
      (/^\d/.test(line) ||
        /^(ein|eine|einen|einem|einer|halb|halbe|halbes|viertel|zwei|drei|vier|fünf|funf|sechs|sieben|acht|neun|zehn|anderthalb|eineinhalb)\b/i.test(line) ||
        known);
    if (isIngredient && item.name && item.name.length >= 2) {
      ingredients.push({ name: item.name, amount: item.amount, unit: item.unit, category: item.category });
    } else {
      instructions.push(line);
    }
  }

  const merged = mergeItems(ingredients);
  return {
    id: uuid(),
    title,
    servings,
    ingredients: merged,
    instructions: instructions.join("\n"),
    tags: [],
    is_public: false,
    created_at: new Date().toISOString(),
  };
}

function openImportRecipeModal() {
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal rec-modal-lg">
      <div class="rec-modal-head">
        <h3 style="font-size: 1rem;">${ICONS.upload} Rezept aus Text importieren</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 12px;">Erste Zeile = Titel. Zeilen mit Mengen oder bekannten Zutaten werden automatisch als Zutaten erkannt, alles andere landet in der Zubereitung.</p>
      <textarea id="import-recipe-text" class="rec-input" rows="10" placeholder="Spaghetti Carbonara&#10;2 Portionen&#10;&#10;200 g Spaghetti&#10;100 g Speck&#10;2 Eier&#10;50 g Parmesan&#10;Pfeffer&#10;&#10;Spaghetti kochen. Speck knusprig braten. Eier mit Parmesan verquirlen und unter die heißen Nudeln heben."></textarea>
      <div class="rec-modal-foot">
        <button class="btn btn-secondary btn-sm" data-cancel>Abbrechen</button>
        <button class="btn btn-lime btn-sm" id="btn-do-import">${ICONS.spark} Parsen & speichern</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-cancel]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#btn-do-import").addEventListener("click", async () => {
    const text = overlay.querySelector("#import-recipe-text").value;
    const recipe = parseRecipeImport(text);
    if (!recipe) { toast("Kein gültiges Rezept gefunden – Titel und Zutaten fehlen.", "error"); return; }
    state.recipes.unshift(recipe);
    await persistRecipes();
    close();
    renderContent();
    toast(`Rezept „${recipe.title}“ importiert (${recipe.ingredients.length} Zutaten).`, "success");
  });
}

// ============================================================
// Willkommens-Modal (einmalig)
// ============================================================
function maybeShowWelcome() {
  if (localStorage.getItem("xsynarec_welcome_v1")) return;
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal" style="max-width: 460px;">
      <div class="rec-modal-head">
        <h3 style="font-size: 1.05rem;">${ICONS.spark} Willkommen in deiner Rezeptliste</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; margin-top: 8px; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6;">
        <div>🔒 <b style="color: var(--text);">Kein Account nötig</b> – die App läuft komplett standalone und speichert alles lokal auf diesem Gerät.</div>
        <div>📴 <b style="color: var(--text);">100 % offline</b> – Bestand, Rezepte, Einkaufslisten und OCR funktionieren ohne Internet.</div>
        <div>📲 <b style="color: var(--text);">Als App installieren</b> – nutze „Zum Home-Bildschirm“ (iOS) oder „Installieren“ (Android/Desktop). ${window.matchMedia("(display-mode: standalone)").matches ? "Du bist bereits in der App." : ""}</div>
        <div>🚪 <b style="color: var(--text);">Kein Weg zurück</b> – die App hat keine Links zur Website. Installiert bleibt man in der App.</div>
        <div>💾 <b style="color: var(--text);">Sichern</b> – über „Export“ im Bestand erstellst du jederzeit ein Backup deiner Daten.</div>
      </div>
      <div class="rec-modal-foot">
        <button class="btn btn-secondary btn-sm" data-close>Schließen</button>
        <button class="btn btn-lime btn-sm" id="welcome-install" style="${installPrompt ? "" : "display:none;"}">📲 Installieren</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); localStorage.setItem("xsynarec_welcome_v1", "1"); };
  overlay.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#welcome-install")?.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    close();
  });
}

// ============================================================
// Init
// ============================================================
async function init() {
  const chip = $("model-chip");
  if (chip) {
    chip.innerHTML = `<span class="rec-pulse"></span> Synaptic FM · lokal · ${modelInfo().version}`;
    chip.title = "Synaptic Foundation Model – läuft lokal im Browser";
  }
  $("model-info-btn")?.addEventListener("click", openModelInfo);

  renderTabs();
  renderContent();
  await loadAll();
  renderTabs();
  renderContent();
  renderStatus();
  maybeShowWelcome();

  supabase.auth.onAuthStateChange(() => {
    loadAll().then(() => {
      renderTabs();
      renderContent();
    });
  });

  window.addEventListener("online", () => {
    loadAll().then(() => {
      renderTabs();
      renderContent();
    });
    renderStatus();
    toast("Verbindung wiederhergestellt – Daten sicher gespeichert.", "success");
  });
  window.addEventListener("offline", () => {
    renderStatus();
    toast("Offline – Änderungen werden lokal gespeichert.", "warning");
  });

  // Install-Prompt (PWA) – zeigt den „Installieren“-Button im Header
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    const btn = $("btn-install");
    if (btn) {
      btn.style.display = "inline-flex";
      btn.addEventListener("click", async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        btn.style.display = "none";
      });
    }
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    const b = $("btn-install");
    if (b) b.style.display = "none";
    toast("App installiert. 🎉", "success");
  });

  // PWA-Falle (zusätzliche Absicherung): Klicks auf gleichnamige
  // Links, die aus der App herausführen, werden abgefangen.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && !url.pathname.startsWith("/recipe-list")) {
        e.preventDefault();
        history.replaceState(null, "", "/recipe-list/");
        toast("Du bist in der Rezeptliste – es gibt keinen Weg zurück zur Website.", "warning");
      }
    } catch { /* ignore */ }
  });
}

init();
