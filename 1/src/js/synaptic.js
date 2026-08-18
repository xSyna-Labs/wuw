// ============================================================
// xSyna — Synaptic Foundation Model (lokal, im Browser)
// ------------------------------------------------------------
// Eine kleine, lokale "Foundation-Model"-Engine, die vollständig
// im Browser läuft (kein Server, keine Cloud):
//   • Textextraktion   – rohen Text (OCR/Mikro/manuell) in Items zerlegen
//   • Label-Erkennung  – Lebensmittel-Labels gegen eine Wissensbasis
//                        matchen (inkl. Fuzzy-Matching nach OCR-Fehlern)
//   • Bestands-Scoring – Rezepte gegen den aktuellen Bestand bewerten
//   • Smart-Shopping   – fehlende Zutaten mergen & nach Kategorien bündeln
// ============================================================

export const Synaptic = {
  name: "Synaptic Foundation Model",
  version: "1.0.0",
  runtime: "lokal · Browser-JS",
  locale: "de-DE",
  engines: ["Tesseract.js (OCR)", "Web Speech API (STT)", "Synaptic NLP (Extraktion)"],
  stats: { parses: 0, avgMs: 0 },
};

// ------------------------------------------------------------
// Normalisierung
// ------------------------------------------------------------
const UMLAUT_MAP = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "ae", Ö: "oe", Ü: "ue" };

export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

// ------------------------------------------------------------
// Wissensbasis (Label-Erkennung)
// name  = kanonisches Label; aliases = OCR-/Alltagsvarianten;
// unit  = Standard-Einheit, wenn keine angegeben wird
// ------------------------------------------------------------
const K = (name, category, unit, aliases = []) => ({ name, category, unit, aliases });

export const CATEGORIES = [
  "Obst & Gemüse",
  "Milchprodukte",
  "Fleisch & Fisch",
  "Backwaren",
  "Nudeln & Getreide",
  "Konserven & Saucen",
  "Gewürze",
  "Öle & Fette",
  "Getränke",
  "Süßes & Snacks",
  "Tiefkühl",
  "Haushalt",
  "Pflege & Körper",
  "Tierbedarf",
  "Sonstiges",
];

const KNOWLEDGE = [
  // ----- Obst & Gemüse -----
  K("Äpfel", "Obst & Gemüse", "Stück", ["apfel", "apples", "äpfel"]),
  K("Bananen", "Obst & Gemüse", "Stück", ["banane", "bananas"]),
  K("Birnen", "Obst & Gemüse", "Stück", ["birne"]),
  K("Orangen", "Obst & Gemüse", "Stück", ["orange", "apfelsinen", "apfelsine"]),
  K("Zitronen", "Obst & Gemüse", "Stück", ["zitrone", "citrone", "zitronen"]),
  K("Limetten", "Obst & Gemüse", "Stück", ["limette"]),
  K("Erdbeeren", "Obst & Gemüse", "Stück", ["erdbeere", "strawberries"]),
  K("Himbeeren", "Obst & Gemüse", "Stück", ["himbeere"]),
  K("Blaubeeren", "Obst & Gemüse", "Stück", ["blaubeere", "heidelbeeren", "heidelbeere"]),
  K("Brombeeren", "Obst & Gemüse", "Stück", ["brombeere"]),
  K("Weintrauben", "Obst & Gemüse", "g", ["trauben", "weintraube"]),
  K("Tomaten", "Obst & Gemüse", "Stück", ["tomate", "tomatos", "tomaten"]),
  K("Kirschtomaten", "Obst & Gemüse", "Stück", ["kirschtomate", "cocktailtomaten"]),
  K("Gurken", "Obst & Gemüse", "Stück", ["gurke", "salatgurke"]),
  K("Zwiebeln", "Obst & Gemüse", "Stück", ["zwiebel", "onions"]),
  K("Knoblauch", "Obst & Gemüse", "Zehe", ["knoblauchzehen", "knoblauchzehe", "garlic"]),
  K("Kartoffeln", "Obst & Gemüse", "g", ["kartoffel", "potatoes"]),
  K("Süßkartoffeln", "Obst & Gemüse", "g", ["süßkartoffel", "susskartoffel"]),
  K("Möhren", "Obst & Gemüse", "g", ["möhre", "mohre", "karotten", "karotte", "carrots"]),
  K("Paprika", "Obst & Gemüse", "Stück", ["paprikaschoten", "paprikaschote", "peppers"]),
  K("Zucchini", "Obst & Gemüse", "Stück", ["zucchini", "courgette"]),
  K("Auberginen", "Obst & Gemüse", "Stück", ["aubergine", "melanzani"]),
  K("Champignons", "Obst & Gemüse", "g", ["champignon", "pilze", "pilz", "mushrooms"]),
  K("Spinat", "Obst & Gemüse", "g", ["blattspinat"]),
  K("Salat", "Obst & Gemüse", "Stück", ["kopfsalat", "blattsalat", "eisbergsalat", "salatherz"]),
  K("Rucola", "Obst & Gemüse", "g", ["rucola", "rauke"]),
  K("Brokkoli", "Obst & Gemüse", "Stück", ["broccoli"]),
  K("Blumenkohl", "Obst & Gemüse", "Stück", ["karfiol"]),
  K("Rosenkohl", "Obst & Gemüse", "g", ["rosenkohl"]),
  K("Erbsen", "Obst & Gemüse", "g", ["erbsen", "peas"]),
  K("Mais", "Obst & Gemüse", "Dose", ["mais"]),
  K("Grüne Bohnen", "Obst & Gemüse", "g", ["bohnen", "brechbohnen", "grüne bohnen"]),
  K("Kürbis", "Obst & Gemüse", "Stück", ["hokkaido", "butternut"]),
  K("Avocado", "Obst & Gemüse", "Stück", ["avocados"]),
  K("Lauch", "Obst & Gemüse", "Stück", ["porree"]),
  K("Staudensellerie", "Obst & Gemüse", "Stück", ["sellerie"]),
  K("Ingwer", "Obst & Gemüse", "Stück", ["ingwerwurzel", "ginger"]),
  K("Chili", "Obst & Gemüse", "Stück", ["chilischoten", "chilischote", "peperoni"]),
  K("Petersilie", "Obst & Gemüse", "Bund", ["frische petersilie"]),
  K("Schnittlauch", "Obst & Gemüse", "Bund", []),
  K("Basilikum", "Obst & Gemüse", "Bund", ["frisches basilikum"]),
  K("Dill", "Obst & Gemüse", "Bund", []),
  K("Minze", "Obst & Gemüse", "Bund", ["pfefferminze"]),
  K("Rosmarin", "Obst & Gemüse", "Zweig", ["rosmarinzweig"]),
  K("Thymian", "Obst & Gemüse", "Zweig", []),

  // ----- Milchprodukte -----
  K("Milch", "Milchprodukte", "l", ["vollmilch", "fettarme milch", "h-milch"]),
  K("Butter", "Milchprodukte", "g", []),
  K("Margarine", "Milchprodukte", "g", []),
  K("Käse", "Milchprodukte", "g", ["reibekäse", "geriebener käse", "gouda", "edamer", "emmentaler", "scheibletten"]),
  K("Mozzarella", "Milchprodukte", "g", []),
  K("Feta", "Milchprodukte", "g", ["schafskäse", "hirtenkäse"]),
  K("Parmesan", "Milchprodukte", "g", ["parmesankäse"]),
  K("Sahne", "Milchprodukte", "ml", ["schlagsahne", "süße sahne", "süsse sahne"]),
  K("Crème fraîche", "Milchprodukte", "g", ["creme fraiche"]),
  K("Schmand", "Milchprodukte", "g", []),
  K("Joghurt", "Milchprodukte", "g", ["naturjoghurt", "griechischer joghurt", "griechischer"]),
  K("Quark", "Milchprodukte", "g", ["magerquark"]),
  K("Eier", "Milchprodukte", "Stück", ["ei", "eier", "eiern", "eggs"]),
  K("Frischkäse", "Milchprodukte", "g", ["doppelrahm"]),
  K("Mascarpone", "Milchprodukte", "g", []),
  K("Kefir", "Milchprodukte", "ml", []),
  K("Buttermilch", "Milchprodukte", "ml", []),
  K("Kondensmilch", "Milchprodukte", "ml", []),

  // ----- Fleisch & Fisch -----
  K("Hähnchen", "Fleisch & Fisch", "g", ["hähnchenbrust", "hähnchenschenkel", "huhn", "hühnchen", "chicken"]),
  K("Rinderhack", "Fleisch & Fisch", "g", ["hackfleisch", "hack", "gemischtes hack"]),
  K("Rindfleisch", "Fleisch & Fisch", "g", ["rinderfilet", "rumpsteak", "beef"]),
  K("Schweinefleisch", "Fleisch & Fisch", "g", ["schwein", "schweinefilet", "kassler"]),
  K("Speck", "Fleisch & Fisch", "g", ["frühstücksspeck", "bacon"]),
  K("Schinken", "Fleisch & Fisch", "g", ["kochschinken", "rohschinken", "serranoschinken"]),
  K("Salami", "Fleisch & Fisch", "g", []),
  K("Wurst", "Fleisch & Fisch", "g", ["lyoner", "bratwurst", "würstchen", "wiener", "wienerwürstchen", "leberwurst"]),
  K("Putenbrust", "Fleisch & Fisch", "g", ["pute", "putenschnitzel"]),
  K("Lachs", "Fleisch & Fisch", "g", ["lachsfilet", "geräucherter lachs"]),
  K("Thunfisch", "Fleisch & Fisch", "Dose", ["thunfischdose", "tunfisch"]),
  K("Garnelen", "Fleisch & Fisch", "g", ["shrimps", "crevetten", "shrimp"]),
  K("Seelachs", "Fleisch & Fisch", "g", ["fischfilet", "kabeljau", "dorsch"]),

  // ----- Backwaren -----
  K("Brot", "Backwaren", "Stück", ["toastbrot", "vollkornbrot", "mischbrot", "ciabatta"]),
  K("Brötchen", "Backwaren", "Stück", ["semmeln", "semmel", "wecken", "broetchen"]),
  K("Baguette", "Backwaren", "Stück", []),
  K("Mehl", "Backwaren", "g", ["weizenmehl", "dinkelmehl", "mehl typ 405"]),
  K("Zucker", "Backwaren", "g", ["brauner zucker", "puderzucker"]),
  K("Paniermehl", "Backwaren", "g", ["semmelbrösel", "semmelbroesel"]),
  K("Hefe", "Backwaren", "g", ["trockenhefe", "frische hefe"]),
  K("Backpulver", "Backwaren", "Packung", []),
  K("Vanillezucker", "Backwaren", "Packung", []),
  K("Haferflocken", "Backwaren", "g", []),
  K("Müsli", "Backwaren", "g", ["granola"]),

  // ----- Nudeln & Getreide -----
  K("Nudeln", "Nudeln & Getreide", "g", ["pasta", "spaghetti", "penne", "fusilli", "bandnudeln", "maccaroni", "tagliatelle", "nudel"]),
  K("Reis", "Nudeln & Getreide", "g", ["basmati", "jasminreis", "reis"]),
  K("Couscous", "Nudeln & Getreide", "g", []),
  K("Bulgur", "Nudeln & Getreide", "g", []),
  K("Quinoa", "Nudeln & Getreide", "g", []),
  K("Linsen", "Nudeln & Getreide", "g", ["rote linsen", "linsen"]),
  K("Kichererbsen", "Nudeln & Getreide", "Dose", ["kichererbsen"]),

  // ----- Konserven & Saucen -----
  K("Tomatenmark", "Konserven & Saucen", "g", []),
  K("Passierte Tomaten", "Konserven & Saucen", "ml", ["passata", "tomatensauce", "tomatensosse"]),
  K("Gehackte Tomaten", "Konserven & Saucen", "Dose", ["stückige tomaten", "tomatenwürfel", "tomatenstuecke"]),
  K("Oliven", "Konserven & Saucen", "g", ["schwarze oliven", "grüne oliven"]),
  K("Kapern", "Konserven & Saucen", "g", []),
  K("Senf", "Konserven & Saucen", "g", ["mittelscharfer senf", "dijonsenf"]),
  K("Ketchup", "Konserven & Saucen", "ml", []),
  K("Mayonnaise", "Konserven & Saucen", "ml", ["majo"]),
  K("Essig", "Konserven & Saucen", "ml", ["weinessig", "apfelessig", "balsamico", "balsamico essig"]),
  K("Sojasauce", "Konserven & Saucen", "ml", ["sojasoße", "sojasosse"]),
  K("Brühe", "Konserven & Saucen", "g", ["gemüsebrühe", "hühnerbrühe", "brühepulver", "brühwürfel", "fond"]),
  K("Kokosmilch", "Konserven & Saucen", "ml", []),
  K("Honig", "Konserven & Saucen", "g", []),
  K("Marmelade", "Konserven & Saucen", "g", ["konfitüre", "erdbeermarmelade"]),
  K("Schokocreme", "Konserven & Saucen", "g", ["schokocremes", "schoko creme", "schoko creme aufstrich"]),
  K("Nutella", "Süßes & Snacks", "g", ["nuss nougat creme", "nussnougatcreme", "nougatcreme", "nuss nougat aufstrich", "nuss nougat creme aufstrich", "nuss-nougat-creme"]),
  K("Erdnussbutter", "Konserven & Saucen", "g", ["erdnussmus"]),

  // ----- Gewürze -----
  K("Salz", "Gewürze", "g", ["speisesalz", "meersalz"]),
  K("Pfeffer", "Gewürze", "g", ["schwarzer pfeffer", "pfefferkörner"]),
  K("Paprikapulver", "Gewürze", "g", ["paprika edelsüß", "edelsüß"]),
  K("Kurkuma", "Gewürze", "g", []),
  K("Kreuzkümmel", "Gewürze", "g", ["cumin"]),
  K("Kümmel", "Gewürze", "g", []),
  K("Oregano", "Gewürze", "g", []),
  K("Majoran", "Gewürze", "g", []),
  K("Muskat", "Gewürze", "g", ["muskatnuss"]),
  K("Zimt", "Gewürze", "g", ["zimtstangen"]),
  K("Currypulver", "Gewürze", "g", ["curry"]),
  K("Chilipulver", "Gewürze", "g", ["chili flakes", "chiliflocken"]),
  K("Knoblauchpulver", "Gewürze", "g", []),
  K("Zwiebelpulver", "Gewürze", "g", []),
  K("Lorbeerblätter", "Gewürze", "Stück", ["lorbeer", "lorbeerblatt"]),

  // ----- Öle & Fette -----
  K("Olivenöl", "Öle & Fette", "ml", ["natives olivenöl"]),
  K("Sonnenblumenöl", "Öle & Fette", "ml", []),
  K("Rapsöl", "Öle & Fette", "ml", []),
  K("Kokosöl", "Öle & Fette", "ml", []),
  K("Sesamöl", "Öle & Fette", "ml", []),
  K("Pflanzenöl", "Öle & Fette", "ml", ["öl", "speiseöl"]),
  K("Butterschmalz", "Öle & Fette", "g", ["schmalz"]),

  // ----- Getränke -----
  K("Wasser", "Getränke", "l", ["mineralwasser", "stilles wasser", "stilles mineralwasser", "sprudel", "tischwasser", "sparkling water", "spritziges mineralwasser"]),
  K("Kaffee", "Getränke", "g", ["kaffeebohnen", "gemahlener kaffee", "kaffeepulver"]),
  K("Tee", "Getränke", "Stück", ["schwarztee", "grüner tee", "kamillentee", "teebeutel"]),
  K("Saft", "Getränke", "l", ["orangensaft", "apfelsaft", "multivitaminsaft"]),
  K("Cola", "Getränke", "l", []),
  K("Limonade", "Getränke", "l", ["sprite", "fanta"]),
  K("Bier", "Getränke", "Flasche", ["pils", "weizenbier"]),
  K("Wein", "Getränke", "Flasche", ["rotwein", "weißwein", "weisswein"]),
  K("Sekt", "Getränke", "Flasche", ["prosecco"]),

  // ----- Süßes & Snacks -----
  K("Schokolade", "Süßes & Snacks", "g", ["zartbitterschokolade", "vollmilchschokolade", "schoki"]),
  K("Kekse", "Süßes & Snacks", "g", ["butterkekse", "kekse"]),
  K("Chips", "Süßes & Snacks", "g", ["kartoffelchips"]),
  K("Gummibärchen", "Süßes & Snacks", "g", []),
  K("Eis", "Süßes & Snacks", "g", ["vanilleeis", "schokoladeneis", "speiseeis"]),
  K("Popcorn", "Süßes & Snacks", "g", []),
  K("Nüsse", "Süßes & Snacks", "g", ["mandeln", "walnüsse", "cashews", "haselnüsse", "nüsse"]),
  K("Rosinen", "Süßes & Snacks", "g", []),
  K("Kakaopulver", "Süßes & Snacks", "g", ["kakao", "backkakao"]),
  K("Puddingpulver", "Süßes & Snacks", "Packung", []),

  // ----- Tiefkühl -----
  K("TK-Gemüse", "Tiefkühl", "g", ["tiefkühlgemüse", "tk gemüse", "tiefkühl erbsen"]),
  K("Pommes", "Tiefkühl", "g", ["pommes frites"]),
  K("Fischstäbchen", "Tiefkühl", "g", []),
  K("TK-Pizza", "Tiefkühl", "Stück", ["tiefkühlpizza", "pizza"]),
  K("TK-Beeren", "Tiefkühl", "g", ["tiefkühlbeeren", "tk beeren"]),

  // ----- Haushalt -----
  K("Küchenrolle", "Haushalt", "Rolle", ["küchenpapier", "kuechenrolle"]),
  K("Toilettenpapier", "Haushalt", "Packung", ["klopapier"]),
  K("Spülmittel", "Haushalt", "Flasche", []),
  K("Waschmittel", "Haushalt", "Packung", []),
  K("Müllbeutel", "Haushalt", "Packung", ["müllsäcke", "mullsack"]),
  K("Alufolie", "Haushalt", "Rolle", []),
  K("Frischhaltefolie", "Haushalt", "Rolle", []),
  K("Zahnpasta", "Haushalt", "Stück", []),
  K("Seife", "Haushalt", "Stück", ["handseife"]),
  K("Shampoo", "Haushalt", "Flasche", []),
  K("Duschgel", "Haushalt", "Flasche", []),
  K("Batterien", "Haushalt", "Packung", []),
  K("Kerzen", "Haushalt", "Stück", []),

  // ----- Sonstiges -----
  K("Eiswürfel", "Sonstiges", "Packung", []),
  K("Paniermehl", "Sonstiges", "g", []),
  K("Semmelknödel", "Sonstiges", "Packung", ["knödel"]),

  // ----- Obst & Gemüse (erweitert) -----
  K("Pfirsiche", "Obst & Gemüse", "Stück", ["pfirsich"]),
  K("Nektarinen", "Obst & Gemüse", "Stück", ["nektarine"]),
  K("Aprikosen", "Obst & Gemüse", "Stück", ["aprikose", "marillen"]),
  K("Pflaumen", "Obst & Gemüse", "Stück", ["pflaume", "zwetschgen", "zwetschge"]),
  K("Kirschen", "Obst & Gemüse", "g", ["kirsche", "süßkirschen"]),
  K("Johannisbeeren", "Obst & Gemüse", "g", ["johannisbeere", "rote johannisbeeren"]),
  K("Stachelbeeren", "Obst & Gemüse", "g", ["stachelbeere"]),
  K("Mango", "Obst & Gemüse", "Stück", ["mangos"]),
  K("Ananas", "Obst & Gemüse", "Stück", ["ananas"]),
  K("Kiwi", "Obst & Gemüse", "Stück", ["kiwis"]),
  K("Melone", "Obst & Gemüse", "Stück", ["wassermelone", "honigmelone", "cantaloupe"]),
  K("Granatapfel", "Obst & Gemüse", "Stück", []),
  K("Feigen", "Obst & Gemüse", "Stück", ["feige"]),
  K("Datteln", "Obst & Gemüse", "g", ["dattel"]),
  K("Rhabarber", "Obst & Gemüse", "Stange", ["rhabarberstangen"]),
  K("Fenchel", "Obst & Gemüse", "Stück", ["fenchelknolle"]),
  K("Pastinaken", "Obst & Gemüse", "g", ["pastinake"]),
  K("Sellerieknolle", "Obst & Gemüse", "Stück", []),
  K("Radieschen", "Obst & Gemüse", "Bund", []),
  K("Rote Bete", "Obst & Gemüse", "g", ["rote beete", "randen"]),
  K("Kohlrabi", "Obst & Gemüse", "Stück", []),
  K("Weißkohl", "Obst & Gemüse", "Stück", ["weisskohl", "kraut"]),
  K("Rotkohl", "Obst & Gemüse", "Stück", ["rotkraut"]),
  K("Wirsing", "Obst & Gemüse", "Stück", ["wirsingkohl"]),
  K("Grünkohl", "Obst & Gemüse", "g", ["gruenkohl"]),
  K("Chicorée", "Obst & Gemüse", "Stück", ["chicoree"]),
  K("Feldsalat", "Obst & Gemüse", "g", ["feldsalat"]),
  K("Zuckerschoten", "Obst & Gemüse", "g", ["zuckererbsen"]),
  K("Stangenbohnen", "Obst & Gemüse", "g", ["stangenbohne"]),
  K("Spargel", "Obst & Gemüse", "g", ["grüner spargel", "weißer spargel", "weisser spargel"]),
  K("Kresse", "Obst & Gemüse", "Packung", []),
  K("Sprossen", "Obst & Gemüse", "g", ["keimlinge"]),
  K("Austernpilze", "Obst & Gemüse", "g", ["austernpilz"]),
  K("Shiitake", "Obst & Gemüse", "g", []),
  K("Pfifferlinge", "Obst & Gemüse", "g", ["pfifferling"]),
  K("Steinpilze", "Obst & Gemüse", "g", ["steinpilz"]),
  K("Maiskolben", "Obst & Gemüse", "Stück", []),
  K("Artischocken", "Obst & Gemüse", "Stück", ["artischocke"]),
  K("Frühlingszwiebeln", "Obst & Gemüse", "Stück", ["frühlingszwiebel", "lauchzwiebeln"]),
  K("Estragon (frisch)", "Obst & Gemüse", "Bund", []),
  K("Salbei (frisch)", "Obst & Gemüse", "Bund", []),
  K("Koriander (frisch)", "Obst & Gemüse", "Bund", ["frischer koriander"]),

  // ----- Milchprodukte (erweitert) -----
  K("Skyr", "Milchprodukte", "g", []),
  K("Hüttenkäse", "Milchprodukte", "g", ["cottage cheese"]),
  K("Ziegenkäse", "Milchprodukte", "g", ["ziegenfrischkäse"]),
  K("Brie", "Milchprodukte", "g", []),
  K("Camembert", "Milchprodukte", "g", []),
  K("Schmelzkäse", "Milchprodukte", "g", []),
  K("Blauschimmelkäse", "Milchprodukte", "g", ["roquefort", "gorgonzola"]),
  K("Ricotta", "Milchprodukte", "g", []),
  K("Milchreis", "Milchprodukte", "g", []),
  K("Ziegenmilch", "Milchprodukte", "ml", []),
  K("Käseaufschnitt", "Milchprodukte", "Packung", ["käseaufschnitt"]),

  // ----- Fleisch & Fisch (erweitert) -----
  K("Lamm", "Fleisch & Fisch", "g", ["lammfleisch", "lammlachse"]),
  K("Ente", "Fleisch & Fisch", "g", ["entenbrust"]),
  K("Gans", "Fleisch & Fisch", "g", []),
  K("Gyros", "Fleisch & Fisch", "g", []),
  K("Souvlaki", "Fleisch & Fisch", "g", []),
  K("Cevapcici", "Fleisch & Fisch", "g", []),
  K("Forelle", "Fleisch & Fisch", "g", ["forellenfilet"]),
  K("Zander", "Fleisch & Fisch", "g", []),
  K("Thunfischsteak", "Fleisch & Fisch", "g", []),
  K("Sardinen", "Fleisch & Fisch", "Dose", ["sardinen dose"]),
  K("Hering", "Fleisch & Fisch", "g", ["heringsfilet", "matjes"]),
  K("Makrele", "Fleisch & Fisch", "g", []),
  K("Krabben", "Fleisch & Fisch", "g", ["krevetten"]),
  K("Muscheln", "Fleisch & Fisch", "g", []),
  K("Tintenfisch", "Fleisch & Fisch", "g", ["calamari"]),
  K("Surimi", "Fleisch & Fisch", "g", []),
  K("Tofu", "Fleisch & Fisch", "g", ["naturtofu"]),
  K("Seitan", "Fleisch & Fisch", "g", []),
  K("Tempeh", "Fleisch & Fisch", "g", []),

  // ----- Backwaren (erweitert) -----
  K("Roggenmehl", "Backwaren", "g", []),
  K("Vollkornmehl", "Backwaren", "g", []),
  K("Reismehl", "Backwaren", "g", []),
  K("Mandelmehl", "Backwaren", "g", []),
  K("Speisestärke", "Backwaren", "g", ["stärke", "maisstärke"]),
  K("Zitronensäure", "Backwaren", "g", []),
  K("Backaroma", "Backwaren", "Flasche", ["vanillearoma"]),
  K("Tortenguss", "Backwaren", "Packung", []),
  K("Gelatine", "Backwaren", "Packung", ["gelatineblätter"]),
  K("Agar-Agar", "Backwaren", "Packung", []),
  K("Pizzateig", "Backwaren", "Packung", ["fertiger pizzateig"]),
  K("Blätterteig", "Backwaren", "Packung", ["tk-blätterteig"]),
  K("Hefeteig", "Backwaren", "Packung", []),
  K("Bagels", "Backwaren", "Stück", ["bagel"]),
  K("Croissants", "Backwaren", "Stück", ["croissant"]),
  K("Brezeln", "Backwaren", "Stück", ["brezel", "laugenbrezel"]),
  K("Knäckebrot", "Backwaren", "Packung", []),
  K("Wraps", "Backwaren", "Packung", ["tortillas"]),
  K("Pita", "Backwaren", "Packung", ["pitabrot"]),
  K("Zwieback", "Backwaren", "Packung", []),

  // ----- Nudeln & Getreide (erweitert) -----
  K("Tortellini", "Nudeln & Getreide", "g", []),
  K("Ravioli", "Nudeln & Getreide", "g", []),
  K("Gnocchi", "Nudeln & Getreide", "g", []),
  K("Lasagneplatten", "Nudeln & Getreide", "g", []),
  K("Ramen", "Nudeln & Getreide", "g", []),
  K("Udon", "Nudeln & Getreide", "g", []),
  K("Glasnudeln", "Nudeln & Getreide", "g", []),
  K("Polenta", "Nudeln & Getreide", "g", ["maisgrieß"]),
  K("Graupen", "Nudeln & Getreide", "g", []),
  K("Hirse", "Nudeln & Getreide", "g", []),
  K("Amaranth", "Nudeln & Getreide", "g", []),
  K("Buchweizen", "Nudeln & Getreide", "g", []),
  K("Weiße Bohnen", "Nudeln & Getreide", "Dose", ["weisse bohnen"]),
  K("Kidneybohnen", "Nudeln & Getreide", "Dose", []),
  K("Schwarze Bohnen", "Nudeln & Getreide", "Dose", []),

  // ----- Konserven & Saucen (erweitert) -----
  K("Pesto", "Konserven & Saucen", "Glas", ["pesto genovese", "pesto rosso"]),
  K("Currypaste", "Konserven & Saucen", "Glas", ["rote currypaste", "grüne currypaste"]),
  K("Salsa", "Konserven & Saucen", "Glas", []),
  K("Guacamole", "Konserven & Saucen", "Packung", []),
  K("Olivenpaste", "Konserven & Saucen", "Glas", ["tapenade"]),
  K("Sardellen", "Konserven & Saucen", "Dose", ["anchovis"]),
  K("Gewürzgurken", "Konserven & Saucen", "Glas", ["saure gurken", "essiggurken"]),
  K("Ananas (Dose)", "Konserven & Saucen", "Dose", ["dose ananas", "ananasdose"]),
  K("Pfirsiche (Dose)", "Konserven & Saucen", "Dose", ["dose pfirsiche"]),
  K("Worcestershire Sauce", "Konserven & Saucen", "Flasche", ["worcester sauce"]),
  K("Tabasco", "Konserven & Saucen", "Flasche", []),
  K("Sriracha", "Konserven & Saucen", "Flasche", []),
  K("BBQ-Sauce", "Konserven & Saucen", "Flasche", ["barbecue sauce"]),
  K("Teriyaki", "Konserven & Saucen", "Flasche", []),
  K("Hoisin", "Konserven & Saucen", "Flasche", []),
  K("Curryketchup", "Konserven & Saucen", "Flasche", []),
  K("Remoulade", "Konserven & Saucen", "Glas", []),
  K("Ajvar", "Konserven & Saucen", "Glas", []),
  K("Hummus", "Konserven & Saucen", "Packung", []),

  // ----- Gewürze (erweitert) -----
  K("Koriander", "Gewürze", "g", ["koriander gemahlen"]),
  K("Nelken", "Gewürze", "g", ["gewürznelken"]),
  K("Kardamom", "Gewürze", "g", []),
  K("Sternanis", "Gewürze", "g", []),
  K("Fenchelsamen", "Gewürze", "g", []),
  K("Senfsamen", "Gewürze", "g", []),
  K("Estragon", "Gewürze", "g", ["estragon getrocknet"]),
  K("Salbei", "Gewürze", "g", ["salbei getrocknet"]),
  K("Bohnenkraut", "Gewürze", "g", []),
  K("Cayennepfeffer", "Gewürze", "g", ["cayenne"]),
  K("Garam Masala", "Gewürze", "g", []),
  K("Ras el Hanout", "Gewürze", "g", []),
  K("Fünf-Gewürze-Pulver", "Gewürze", "g", ["five spice"]),
  K("Za'atar", "Gewürze", "g", []),
  K("Sesam", "Gewürze", "g", ["sesamsamen"]),
  K("Mohn", "Gewürze", "g", ["mohnsamen"]),
  K("Leinsamen", "Gewürze", "g", []),
  K("Chiasamen", "Gewürze", "g", []),
  K("Hanfsamen", "Gewürze", "g", []),
  K("Kürbiskerne", "Gewürze", "g", []),
  K("Sonnenblumenkerne", "Gewürze", "g", []),
  K("Zitronengras", "Gewürze", "Stange", []),
  K("Vanilleschoten", "Gewürze", "Stück", ["vanilleschote"]),

  // ----- Öle & Fette (erweitert) -----
  K("Traubenkernöl", "Öle & Fette", "ml", []),
  K("Walnussöl", "Öle & Fette", "ml", []),
  K("Erdnussöl", "Öle & Fette", "ml", []),
  K("Avocadoöl", "Öle & Fette", "ml", []),
  K("Chiliöl", "Öle & Fette", "ml", []),
  K("Trüffelöl", "Öle & Fette", "ml", []),
  K("Kürbiskernöl", "Öle & Fette", "ml", []),
  K("Ghee", "Öle & Fette", "g", []),

  // ----- Getränke (erweitert) -----
  K("Eistee", "Getränke", "l", []),
  K("Energy-Drink", "Getränke", "Dose", ["energydrink", "energy drink"]),
  K("Ginger Ale", "Getränke", "l", []),
  K("Tonic Water", "Getränke", "l", []),
  K("Apfelschorle", "Getränke", "l", ["apfelsaftschorle"]),
  K("Hafermilch", "Getränke", "l", ["haferdrink"]),
  K("Mandelmilch", "Getränke", "l", []),
  K("Sojamilch", "Getränke", "l", []),
  K("Kokoswasser", "Getränke", "l", []),
  K("Mate", "Getränke", "l", ["mate tee"]),
  K("Espresso", "Getränke", "g", []),
  K("Traubensaft", "Getränke", "l", []),

  // ----- Süßes & Snacks (erweitert) -----
  K("Schokoriegel", "Süßes & Snacks", "Stück", []),
  K("Lakritz", "Süßes & Snacks", "g", []),
  K("Marshmallows", "Süßes & Snacks", "Packung", []),
  K("Marzipan", "Süßes & Snacks", "g", []),
  K("Waffeln", "Süßes & Snacks", "Packung", ["eiswaffeln"]),
  K("Kuchenmischung", "Süßes & Snacks", "Packung", ["backmischung"]),
  K("Waffelröllchen", "Süßes & Snacks", "g", []),
  K("Studentenfutter", "Süßes & Snacks", "g", []),
  K("Trockenfrüchte", "Süßes & Snacks", "g", ["getrocknete früchte"]),
  K("Ahornsirup", "Süßes & Snacks", "ml", []),
  K("Agavendicksaft", "Süßes & Snacks", "ml", []),
  K("Schokostreusel", "Süßes & Snacks", "g", []),
  K("Kokosraspeln", "Süßes & Snacks", "g", ["kokosflocken"]),
  K("Kuvertüre", "Süßes & Snacks", "g", []),
  K("Zuckerguss", "Süßes & Snacks", "Packung", ["guss"]),
  K("Kaugummi", "Süßes & Snacks", "Packung", []),
  K("Bonbons", "Süßes & Snacks", "g", []),

  // ----- Tiefkühl (erweitert) -----
  K("TK-Kräuter", "Tiefkühl", "g", ["tiefkühlkräuter"]),
  K("TK-Brot", "Tiefkühl", "Packung", []),
  K("TK-Strudel", "Tiefkühl", "Stück", []),
  K("Chicken Nuggets", "Tiefkühl", "g", ["nuggets"]),
  K("Kroketten", "Tiefkühl", "g", []),
  K("Rösti", "Tiefkühl", "g", ["rosti"]),
  K("TK-Obst", "Tiefkühl", "g", ["tiefkühlobst"]),
  K("TK-Himbeeren", "Tiefkühl", "g", ["tiefkühlhimbeeren"]),
  K("TK-Kirschen", "Tiefkühl", "g", ["tiefkühlkirschen"]),

  // ----- Haushalt (erweitert) -----
  K("Geschirrspültabs", "Haushalt", "Packung", ["spültabs"]),
  K("Weichspüler", "Haushalt", "Flasche", []),
  K("Allzweckreiniger", "Haushalt", "Flasche", []),
  K("Glasreiniger", "Haushalt", "Flasche", []),
  K("Badreiniger", "Haushalt", "Flasche", []),
  K("Backpapier", "Haushalt", "Rolle", []),
  K("Gefrierbeutel", "Haushalt", "Packung", []),
  K("Streichhölzer", "Haushalt", "Packung", []),
  K("Feuerzeug", "Haushalt", "Stück", []),
  K("Schwämme", "Haushalt", "Packung", ["spülschwamm"]),
  K("Spüllappen", "Haushalt", "Packung", ["lappen"]),
  K("Taschentücher", "Haushalt", "Packung", []),
  K("Glühbirnen", "Haushalt", "Stück", []),
  K("Teelichter", "Haushalt", "Packung", []),

  // ----- Pflege & Körper -----
  K("Deo", "Pflege & Körper", "Stück", ["deodorant"]),
  K("Rasierer", "Pflege & Körper", "Packung", ["rasierklingen"]),
  K("Rasierschaum", "Pflege & Körper", "Dose", []),
  K("Sonnencreme", "Pflege & Körper", "Stück", ["sonnenschutz"]),
  K("Handcreme", "Pflege & Körper", "Stück", []),
  K("Wattepads", "Pflege & Körper", "Packung", []),
  K("Wattestäbchen", "Pflege & Körper", "Packung", []),
  K("Zahnbürste", "Pflege & Körper", "Stück", []),
  K("Conditioner", "Pflege & Körper", "Flasche", ["spülung"]),
  K("Gesichtscreme", "Pflege & Körper", "Stück", []),
  K("Pflaster", "Pflege & Körper", "Packung", ["verbandsmaterial"]),
  K("Schmerzmittel", "Pflege & Körper", "Packung", ["ibuprofen", "paracetamol"]),
  K("Desinfektionsmittel", "Pflege & Körper", "Flasche", []),

  // ----- Tierbedarf -----
  K("Katzenfutter", "Tierbedarf", "Packung", ["katzenfutter dose"]),
  K("Hundefutter", "Tierbedarf", "Packung", []),
  K("Katzenstreu", "Tierbedarf", "Packung", []),
  K("Leckerli", "Tierbedarf", "Packung", []),

  // ----- Sonstiges (erweitert) -----
  K("Hefeflocken", "Sonstiges", "g", []),
  K("Proteinpulver", "Sonstiges", "Packung", []),

  // ----- Erweiterung: Alltagsartikel (Batch 2) -----
  K("Schnitzel", "Fleisch & Fisch", "g", ["wiener schnitzel", "schnitzel"]),
  K("Steak", "Fleisch & Fisch", "g", ["rindersteak", "steaks"]),
  K("Chicken Wings", "Fleisch & Fisch", "g", ["wings", "chicken wings"]),
  K("Frikadellen", "Fleisch & Fisch", "g", ["hackbällchen", "fleischbällchen", "frikadelle", "buletten"]),
  K("Falafel", "Fleisch & Fisch", "g", []),
  K("Hähnchenflügel", "Fleisch & Fisch", "g", ["hähnchenflügel"]),
  K("Maultaschen", "Nudeln & Getreide", "g", []),
  K("Schupfnudeln", "Nudeln & Getreide", "g", []),
  K("Spätzle", "Nudeln & Getreide", "g", ["schwäbische spätzle", "spaetzle"]),
  K("Kartoffelbrei", "Sonstiges", "g", ["kartoffelpüree", "püree", "puree", "kartoffelbrei instant"]),
  K("Kaffeesahne", "Milchprodukte", "ml", ["kaffeeweißer", "kaffeeweisser", "sahne für kaffee"]),
  K("Süßstoff", "Sonstiges", "Packung", ["sussstoff", "süßungsmittel", "flussiger süßstoff"]),
  K("Apfelmus", "Konserven & Saucen", "Glas", ["apfelmus"]),
  K("Kombucha", "Getränke", "l", []),
  K("Eiscreme", "Süßes & Snacks", "g", ["eiscreme"]),
  K("Salzstangen", "Süßes & Snacks", "g", ["salzstangen"]),
  K("Erdnüsse", "Süßes & Snacks", "g", ["erdnüsse", "peanuts", "pistazien"]),
  K("Dattelpaste", "Süßes & Snacks", "g", []),
  K("Knabberzeug", "Süßes & Snacks", "Packung", ["snacks", "chips mix"]),
  K("Kokosmilchpulver", "Sonstiges", "Packung", []),
  K("TK-Erbsen", "Tiefkühl", "g", ["tiefkühlerbsen", "tk erbsen"]),
  K("TK-Spinat", "Tiefkühl", "g", ["tiefkühlspinat", "tk spinat", "rahmtspinat"]),
  K("Fischstäbchen", "Tiefkühl", "g", ["fischstaebchen"]),
  K("Kroketten", "Tiefkühl", "g", []),
  K("Geschirrspültabs", "Haushalt", "Packung", ["spültabs", "spülmaschinentabs", "maschinentabs"]),
  K("Küchenrollenhalter", "Haushalt", "Stück", []),
  K("Müllbeutel", "Haushalt", "Packung", ["müllsäcke", "mullsack", "mullbeutel"]),
  K("Kerzen", "Haushalt", "Stück", []),
  K("Gießkanne", "Haushalt", "Stück", []),
  K("Duschgel", "Pflege & Körper", "Flasche", []),
  K("Gesichtsmaske", "Pflege & Körper", "Stück", []),
  K("Nagellackentferner", "Pflege & Körper", "Flasche", []),
  K("Katzenfutter", "Tierbedarf", "Packung", ["katzenfutter dose", "katzenfutter nass"]),
  K("Hundefutter", "Tierbedarf", "Packung", []),
  K("Vogelstreu", "Tierbedarf", "Packung", []),
];

// Englische Alltags-/Rezept-Aliase (TheMealDB & Co.), damit
// Web-Rezepte und englische Etiketten besser erkannt werden.
const EN_ALIASES = {
  "Milch": ["milk"],
  "Zucker": ["sugar", "brown sugar", "white sugar"],
  "Olivenöl": ["olive oil"],
  "Salz": ["salt"],
  "Pfeffer": ["pepper", "black pepper"],
  "Zwiebeln": ["onion", "yellow onion"],
  "Tomaten": ["tomato", "cherry tomatoes"],
  "Kartoffeln": ["potato"],
  "Möhren": ["carrot"],
  "Rinderhack": ["ground beef", "minced beef"],
  "Reis": ["rice"],
  "Mehl": ["flour"],
  "Käse": ["cheese", "cheddar cheese"],
  "Wasser": ["water"],
  "Honig": ["honey"],
  "Zitronen": ["lemon", "lemons"],
  "Limetten": ["lime", "limes"],
  "Knoblauch": ["garlic clove", "garlic cloves"],
  "Eier": ["egg"],
  "Champignons": ["mushroom"],
  "Hähnchen": ["chicken", "chicken breast", "chicken thighs", "chicken fillet"],
  "Nudeln": ["spaghetti", "penne", "fusilli"],
  "Zucchini": ["courgette"],
  "Sojasauce": ["soy sauce"],
  "Tomatenmark": ["tomato paste", "tomato puree"],
  "Passierte Tomaten": ["passata", "tomato sauce"],
  "Butter": ["butter"],
  "Sahne": ["cream", "heavy cream", "double cream"],
};

// Lookup-Tabellen (nur einmal aufbauen)
const KB_KEYS = [];
const KB_LOOKUP = new Map();
const KB_ALIAS = new Map();
for (const entry of KNOWLEDGE) {
  const norm = normalize(entry.name);
  KB_KEYS.push(norm);
  KB_LOOKUP.set(norm, entry);
  for (const alias of entry.aliases) {
    const a = normalize(alias);
    if (!KB_ALIAS.has(a)) KB_ALIAS.set(a, entry);
  }
}
for (const [name, aliases] of Object.entries(EN_ALIASES)) {
  const entry = KB_LOOKUP.get(normalize(name));
  if (!entry) continue;
  for (const a of aliases) {
    const an = normalize(a);
    if (!KB_ALIAS.has(an)) KB_ALIAS.set(an, entry);
  }
}

// ------------------------------------------------------------
// Mengen-Parsing ("2-3 EL", "1/2 l", "0,5 kg", "ein halbes", "3")
// ------------------------------------------------------------
const WORD_NUMBERS = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1,
  halb: 0.5, halbe: 0.5, halbes: 0.5, halben: 0.5,
  viertel: 0.25,
  zwei: 2, drei: 3, vier: 4, fünf: 5, funf: 5, sechs: 6, sieben: 7,
  acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwolf: 12,
  anderthalb: 1.5, eineinhalb: 1.5, dreiviertel: 0.75,
};
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
const UNITS = [
  "kg", "g", "gr", "ml", "l", "liter", "gramm", "kilogramm", "kilo", "milliliter",
  "oz", "ounce", "ounces", "cup", "cups", "tbsp", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons", "lb", "lbs",
  "stück", "stk", "packung", "pck", "pkg", "dose", "bund", "prise",
  "el", "tl", "tasse", "tassen", "scheibe", "scheiben", "flasche", "flaschen",
  "glas", "gläser", "zehe", "zehen", "würfel", "beutel", "becher", "rolle", "rollen",
  "zweig", "zweige", "blatt", "blätter", "kopf", "köpfe", "spritzer", "schuss",
  "stange", "stangen", "döschen", "portion", "portionen",
  "schale", "tüte", "tute", "päckchen", "paeckchen", "fläschchen", "flaeschchen", "tube",
];
const UNIT_NORM = {
  kg: "kg", gramm: "g", g: "g", gr: "g", liter: "l", l: "l", milliliter: "ml", ml: "ml", kilogramm: "kg", kilo: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  stück: "Stück", stk: "Stück", packung: "Packung", pck: "Packung", pkg: "Packung",
  cup: "Tasse", cups: "Tasse", tbsp: "EL", tablespoon: "EL", tablespoons: "EL",
  tsp: "TL", teaspoon: "TL", teaspoons: "TL", lb: "lb", lbs: "lb",
  dose: "Dose", bund: "Bund", prise: "Prise", el: "EL", tl: "TL",
  tasse: "Tasse", tassen: "Tasse", scheibe: "Scheibe", scheiben: "Scheibe",
  flasche: "Flasche", flaschen: "Flasche", glas: "Glas", gläser: "Glas", gläser: "Glas",
  zehe: "Zehe", zehen: "Zehe", würfel: "Würfel", beutel: "Beutel", becher: "Becher",
  rolle: "Rolle", rollen: "Rolle", zweig: "Zweig", zweige: "Zweig",
  blatt: "Blatt", blätter: "Blatt", kopf: "Kopf", köpfe: "Kopf",
  spritzer: "Spritzer", schuss: "Schuss",  stange: "Stange", stangen: "Stange",
  döschen: "Döschen", portion: "Portion", portionen: "Portion",
  schale: "Schale", tüte: "Tüte", tute: "Tüte", päckchen: "Päckchen", paeckchen: "Päckchen",
  fläschchen: "Fläschchen", flaeschchen: "Fläschchen", tube: "Tube",
};
const UNIT_RE = new RegExp("^(" + UNITS.join("|") + ")\\b", "i");
// Erlaubt eine Zahl direkt gefolgt von einer Einheit ("450g", "1.5L"),
// trennt Zahlen aber nicht von beliebigen Wörtern ("2x" bleibt "2x").
const UNIT_LOOKAHEAD = new RegExp("^(?:\\s|$|[^a-zäöüß0-9]|(?:" + UNITS.join("|") + ")\\b)", "i");
// Menge am ENDE der Zeile (Etikett-Stil): "Wasser 1,5 l", "Nutella 450g", "Milch 1 L"
const TRAILING_QTY_RE = new RegExp(
  "^(.*?)\\s*(\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s+[½¼¾⅓⅔]|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?|½|¼|¾|⅓|⅔)\\s*(" + UNITS.join("|") + ")\\s*$",
  "i"
);

function toNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(",", ".");
  if (FRACTIONS[s]) return FRACTIONS[s];
  // Gemischte Zahl: "1 1/2" / "2 ¼"
  const mixed = s.match(/^(\d+)\s+(\d+\s*\/\s*\d+|½|¼|¾|⅓|⅔)$/);
  if (mixed) {
    const whole = parseInt(mixed[1], 10);
    const part = toNumber(mixed[2]);
    return part != null ? whole + part : whole;
  }
  // Bruch 1/2
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  // Bereich "2-3" → Maximum (für Einkauf sicherer)
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) return Math.max(parseFloat(range[1]), parseFloat(range[2]));
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseAmount(raw) {
  const t = String(raw || "").trim();
  let rest = t;
  let amount = null;
  let unit = null;

  // 1) Zahl am Anfang (Bruch vor einfacher Zahl, dann Bereich/Dezimal).
  //    "450g" und "1.5L" werden korrekt als Menge+Einheit gelesen,
  //    ohne dass "450" allein aus "450g" herausgeschnitten wird.
  const numMatch = rest.match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s+[½¼¾⅓⅔]|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|½|¼|¾|⅓|⅔)/);
  if (numMatch && UNIT_LOOKAHEAD.test(rest.slice(numMatch[0].length))) {
    amount = toNumber(numMatch[1]);
    rest = rest.slice(numMatch[0].length).trim();
  } else {
    // 2) Wortzahlen ("zwei", "ein halbes", "anderthalb")
    const wordMatch = rest.match(/^(ein\s+halbes?|eine\s+halbe|einen\s+halben|anderthalb|eineinhalb|halb(es|e|en)?|viertel|dreiviertel|ein|eine|einen|einem|einer|zwei|drei|vier|fünf|funf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwolf)\b/);
    if (wordMatch) {
      let w = wordMatch[1].toLowerCase().replace(/\s+/g, " ");
      if (w.startsWith("ein halbes") || w.startsWith("eine halbe") || w.startsWith("einen halben")) amount = 0.5;
      else amount = WORD_NUMBERS[w] ?? WORD_NUMBERS[w.split(" ")[0]] ?? null;
      rest = rest.slice(wordMatch[0].length).trim();
    }
  }

  // 3) Einheit direkt nach der Menge
  const unitMatch = rest.match(UNIT_RE);
  if (unitMatch) {
    unit = UNIT_NORM[unitMatch[1].toLowerCase()] || null;
    rest = rest.slice(unitMatch[0].length).trim();
  }

  // 4) Keine führende Menge? Dann am Ende suchen (Etikett-Stil,
  //    z. B. "Wasser 1,5 l" oder "Nutella 450 g"). Name wird dabei
  //    von Menge/Einheit getrennt, damit die Label-Erkennung sauber läuft.
  if (amount == null) {
    const trail = rest.match(TRAILING_QTY_RE);
    if (trail && trail[1].trim().length >= 2) {
      amount = toNumber(trail[2]);
      unit = UNIT_NORM[(trail[3] || "").toLowerCase()] || null;
      rest = trail[1].trim();
    }
  }

  return { amount, unit, name: rest };
}

// ------------------------------------------------------------
// Label-Erkennung (Wissensbasis-Match)
// ------------------------------------------------------------
function matchLabel(name) {
  const q = normalize(name);
  if (!q) return { name: "", category: "Sonstiges", unit: null, confidence: 0.3 };

  // 1) Exakt
  const exact = KB_LOOKUP.get(q);
  if (exact) return { ...exact, confidence: 1 };

  // 2) Alias exakt
  const alias = KB_ALIAS.get(q);
  if (alias) return { ...alias, confidence: 1 };

  // 3) Enthalten (längster Treffer gewinnt) – inkl. Alias-Varianten
  let best = null;
  for (const key of KB_KEYS) {
    if (q.includes(key) || key.includes(q)) {
      if (!best || key.length > best.key.length) best = { entry: KB_LOOKUP.get(key), key, confidence: 0.9 };
    }
  }
  for (const [alias, entry] of KB_ALIAS) {
    if (q.includes(alias) || alias.includes(q)) {
      if (!best || alias.length > best.key.length) best = { entry, key: alias, confidence: 0.88 };
    }
  }
  if (best) return { ...best.entry, confidence: best.confidence };

  // 4) Fuzzy (OCR-Fehler, Tippfehler) – inkl. Alias-Varianten
  let bestFuzzy = null;
  const check = (key, entry) => {
    const sim = similarity(q, key);
    if (sim >= 0.62 && (!bestFuzzy || sim > bestFuzzy.sim)) bestFuzzy = { entry, sim };
  };
  for (const key of KB_KEYS) check(key, KB_LOOKUP.get(key));
  for (const [alias, entry] of KB_ALIAS) check(alias, entry);
  if (bestFuzzy) {
    const entry = bestFuzzy.entry;
    return { ...entry, confidence: Math.min(0.92, 0.62 + (bestFuzzy.sim - 0.62) * 2.4) };
  }

  // 5) Unbekannt
  return { name: titleCase(name), category: "Sonstiges", unit: null, confidence: 0.3 };
}

function titleCase(s) {
  return String(s).replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// ------------------------------------------------------------
// Öffentliche API: Zeile → Item
// ------------------------------------------------------------
export function parseLine(raw) {
  const start = performance.now();
  const { amount, unit, name } = parseAmount(raw);
  const label = matchLabel(name);
  const item = {
    name: label.name,
    amount,
    unit: unit || label.unit || "",
    category: label.category || "Sonstiges",
    confidence: label.confidence,
    source: "manual",
    raw: String(raw || "").trim(),
  };
  Synaptic.stats.parses++;
  Synaptic.stats.avgMs = Synaptic.stats.avgMs === 0
    ? performance.now() - start
    : Synaptic.stats.avgMs * 0.8 + (performance.now() - start) * 0.2;
  return item;
}

export function parseText(text) {
  const fragments = String(text || "")
    .split(/\r?\n|[;,]|•|·|\u2022|–|-/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 2);
  const items = [];
  for (const f of fragments) {
    const item = parseLine(f);
    // Unsinn filtern: nur Zahlen/Einheiten oder zu kurze Namen
    if (!item.name || item.name.length < 2) continue;
    if (/^\d+$/.test(item.name)) continue;
    items.push(item);
  }
  return items;
}

// ------------------------------------------------------------
// OCR-Vorverarbeitung (Tesseract-Rauschen bereinigen)
// ------------------------------------------------------------
const OCR_CHAR_FIXES = [
  [/[|¦]/g, "l"],
  [/\b0(?=[a-zäöüß])/g, "o"],
  [/\bl(?=0)/g, "l"],
  [/\b1(?=[a-zäöüß]{2,})/g, "l"],
  [/€/g, ""],
];

// OCR verwechselt Einheiten gerne mit Ziffern/Buchstaben.
// Diese Zeilen-Korrektur stellt die wichtigsten Fälle wieder her,
// damit Etiketten ("Wasser 1,5 l", "Nutella 450 g") Mengen behalten.
function fixOcrQuantityLine(line) {
  let s = String(line || "");
  // Geschätztes-Füllmengen-Zeichen „℮“ entfernen (oft als einzelnes „e“ erkannt)
  s = s.replace(/℮/g, " ");
  s = s.replace(/\be\s+(?=\d)/gi, " ");
  s = s.replace(/(\d\s*(?:g|ml|l|kg|liter|gramm))\s+e\b/gi, "$1");
  // "450 9" / "4509" → "450 g" (g als 9 gelesen)
  s = s.replace(/(\d)\s+9\s*$/, "$1 g");
  s = s.replace(/^(\d{3})9$/, "$1 g");
  // "1,5 I" / "1,5 1" → "1,5 l" (l als I oder 1 gelesen)
  s = s.replace(/(\d)\s*I\s*$/, "$1 l");
  s = s.replace(/(\d)\s+1\s*$/, "$1 l");
  return s.replace(/\s+/g, " ").trim();
}

export function cleanOcr(raw) {
  let t = String(raw || "").replace(/\r/g, "\n");
  for (const [re, repl] of OCR_CHAR_FIXES) t = t.replace(re, repl);
  const lines = t
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .map(fixOcrQuantityLine)
    .filter((l) => l.length >= 2);
  // Duplikate & reine Zahlen raus
  const seen = new Set();
  return lines.filter((l) => {
    if (/^[\d\s.,%€]+$/.test(l)) return false;
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}

// ------------------------------------------------------------
// OCR-Extraktion (vokabular-gefiltert)
// ------------------------------------------------------------
// Statt jede OCR-Zeile blind in einen Artikel zu verwandeln, wird
// gegen die Zutaten-Wissensbasis plus die bekannten Rezept-Zutaten
// geprüft: Es werden nur mögliche Zutaten erkannt („Zucker“ statt
// jedes einzelnen Zeichens). Unbekannte Zeilen (Marken, URLs,
// Fließtext) werden verworfen oder als unsicher geführt.

export function getKnownIngredients() {
  return KNOWLEDGE.map((e) => e.name);
}

function buildOcrVocab(extraNames) {
  const entries = [];
  const seen = new Set();
  const push = (norm, entry, confidence) => {
    if (!norm || norm.length < 2 || seen.has(norm)) return;
    seen.add(norm);
    entries.push({ norm, entry, confidence });
  };
  for (const e of KNOWLEDGE) {
    push(normalize(e.name), e, 1);
    for (const a of e.aliases) push(normalize(a), e, 0.9);
  }
  for (const name of extraNames || []) {
    if (!name || typeof name !== "string") continue;
    push(normalize(name), { name: String(name).trim(), category: null, unit: null }, 0.75);
  }
  entries.sort((a, b) => b.norm.length - a.norm.length);
  return entries;
}

// Wortgrenzen-respektierender Phrasen-Finder für normalisierten Text.
// Umlaute zählen als Wortzeichen, sodass "apfel" nicht in "apfelsaft"
// matcht und "möhren" trotz ä/ö/ü zuverlässig erkannt wird.
const OCR_WORD_CHAR = /[a-zäöüß0-9]/;
function findPhrase(text, phrase, from = 0) {
  let idx = from;
  while ((idx = text.indexOf(phrase, idx)) !== -1) {
    const beforeOk = idx === 0 || !OCR_WORD_CHAR.test(text[idx - 1]);
    const end = idx + phrase.length;
    const afterOk = end >= text.length || !OCR_WORD_CHAR.test(text[end]);
    if (beforeOk && afterOk) return idx;
    idx = end;
  }
  return -1;
}

// Mengen + Einheiten an beliebiger Stelle einer Zeile finden
// (Etikett-Stil: „1,5 l“, „450g“, „2 Flaschen“, „0,75 Liter“).
const QTY_UNITS_SORTED = [...UNITS].sort((a, b) => b.length - a.length);
const QTY_FIND_RE = new RegExp(
  "(\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?|½|¼|¾|⅓|⅔)\\s*(" + QTY_UNITS_SORTED.join("|") + ")\\b",
  "gi"
);

const OCR_NOISE = new Set([
  "netto", "ean", "inhalt", "füllmenge", "abtropfgewicht", "mhd", "haltbar",
  "verbrauchen", "zutaten", "nährwerte", "nahrwerte", "preis", "serviervorschlag",
]);

// Zeilen, die zu Zutaten-/Nährwert-/Allergenlisten gehören, dürfen keine
// Bestands-Artikel erzeugen – sonst landet bei "Nutella" auch "Zucker".
const OCR_SECTION_MARKERS = [
  "zutaten", "zutatenverzeichnis", "inhaltsstoffe", "nährwerte", "nahrwerte",
  "nährwertangaben", "enthält", "enthaelt", "allergenhinweis", "allergen",
  "kann spuren", "davon", "je 100", "pro 100", "durchschnittliche nährwerte",
];

// Packungsartige Mengenangaben („1,5 l“, „450 g“, „1 Dose“) vs. Nährwertzeilen
// („55 g“ pro 100 g). Für g/ml gilt: erst ab 100 als Produktmenge werten.
const PACKAGE_UNITS = new Set(["l", "kg", "Stück", "Dose", "Packung", "Flasche", "Glas", "Bund", "Rolle", "Zehe", "Beutel", "Becher", "Tüte", "Tube", "Würfel"]);
function isPackageQuantity(q) {
  if (!q || q.amount == null) return false;
  if (PACKAGE_UNITS.has(q.unit)) return true;
  if (q.unit === "g" || q.unit === "ml") return q.amount >= 100;
  if (q.unit === "lb") return q.amount >= 0.25;
  return false;
}

export function extractFromOcr(raw, vocab = []) {
  const lines = cleanOcr(raw);
  // Rezept-TITEL aus der App (window.__XSYNA_RECIPE_VOCAB) ergänzen,
  // damit die Erkennung auch importierte/angelegte Rezeptnamen kennt.
  const appVocab =
    typeof window !== "undefined" && Array.isArray(window.__XSYNA_RECIPE_VOCAB)
      ? window.__XSYNA_RECIPE_VOCAB
      : [];
  const entries = buildOcrVocab([...(vocab || []), ...appVocab]);
  const items = [];
  const seen = new Set();

  const add = (name, amount, unit, category, confidence, sure) => {
    const key = normalize(name);
    if (!key || key.length < 2 || seen.has(key)) return;
    if (/^[\d\s.,]+$/.test(key)) return;
    // EAN/Preise/Daten (lange Ziffernfolgen) verwerfen
    if (/\d{6,}/.test(key)) return;
    // unsichere Treffer ohne Menge (z. B. „Netto 1 kg“, „EAN …“) verwerfen
    if (!sure && amount == null) return;
    seen.add(key);
    items.push({
      name,
      amount: amount ?? null,
      unit: unit || "",
      category: category || "Sonstiges",
      confidence,
      source: "camera",
      sure,
    });
  };

  // Alle bekannten Zutaten in einer Zeile finden – positionsgetreu.
  // Alias + Hauptlabel („Nutella“ + „Nuss-Nougat-Creme“) werden zu EINEM
  // Artikel zusammengefasst, Überlappungen („rote bohnen“ + „bohnen“) gefiltert.
  const findLabels = (textNorm) => {
    const hits = [];
    for (const v of entries) {
      if (v.norm.length < 3) continue;
      let from = 0;
      let idx;
      while ((idx = findPhrase(textNorm, v.norm, from)) !== -1) {
        hits.push({ idx, len: v.norm.length, v });
        from = idx + v.norm.length;
      }
    }
    hits.sort((a, b) => a.idx - b.idx || b.len - a.len);
    let end = -1;
    const out = [];
    const seenLabels = new Set();
    for (const h of hits) {
      if (h.idx < end) continue;
      end = h.idx + h.len;
      if (seenLabels.has(h.v.entry.name)) continue;
      seenLabels.add(h.v.entry.name);
      out.push({ ...h.v, idx: h.idx });
    }
    return out;
  };

  const findQtys = (line) => {
    const out = [];
    QTY_FIND_RE.lastIndex = 0;
    let m;
    while ((m = QTY_FIND_RE.exec(line)) !== null) {
      const amount = toNumber(m[1]);
      const unit = UNIT_NORM[(m[2] || "").toLowerCase()] || (m[2] || "").toLowerCase();
      if (amount != null) out.push({ amount, unit, idx: m.index });
    }
    return out;
  };

  const analyzed = lines.map((line) => {
    const norm = normalize(line);
    return {
      line,
      norm,
      sectionNoise: OCR_SECTION_MARKERS.some((m) => norm.includes(m)),
      labels: null,
      qtys: findQtys(line),
      parsed: parseLine(line),
    };
  });
  analyzed.forEach((a) => {
    a.labels = findLabels(a.norm);
  });

  // Zutaten-/Nährwert-/Allergen-Abschnitte: nicht nur die Überschrift,
  // sondern auch die Folgezeilen ignorieren. Sonst landet bei „Nutella“
  // auch „Zucker“, „Nüsse“ und „Milch“ aus der Zutatenliste im Bestand.
  // Ein neues Produkt beendet den Abschnitt nur bei einer packungsartigen
  // Mengenangabe – nicht bei Nährwertzeilen wie „Zucker 55 g“ pro 100 g.
  let inNoise = false;
  for (let i = 0; i < analyzed.length; i++) {
    const a = analyzed[i];
    if (OCR_SECTION_MARKERS.some((m) => a.norm.includes(m))) {
      inNoise = true;
      a.sectionNoise = true;
      continue;
    }
    if (!inNoise) continue;
    const next = analyzed[i + 1];
    const packageQty = a.qtys.find((q) => isPackageQuantity(q));
    const nextPackageQty = next && next.qtys.find((q) => isPackageQuantity(q));
    const productStart =
      (a.labels.length && packageQty) ||
      (a.labels.length && !a.qtys.length && next && !next.labels.length && nextPackageQty);
    if (productStart) inNoise = false;
    else a.sectionNoise = true;
  }
  // Neu als Rauschen markierte Zeilen verlieren ihre Labels.
  analyzed.forEach((a) => {
    if (a.sectionNoise) a.labels = [];
  });

  const usedQty = new Set();
  const qtyKey = (li, qi) => li + ":" + qi;

  // Etikett-Stil über mehrere Zeilen: „Wasser“ (Zeile 1) + „1,5 l“ (Zeile 2).
  // Jede Mengen-Zeile wird der nächstgelegenen, noch nicht versorgten
  // Label-Zeile zugeordnet – bevorzugt der Zeile darüber (üblich: Name,
  // dann Menge). So behalten auch mehrere Etiketten hintereinander
  // („Tomaten / 500 g / Zwiebeln / 1 kg“) ihre jeweils richtige Menge.
  const cross = new Map();
  for (let qi = 0; qi < analyzed.length; qi++) {
    const b = analyzed[qi];
    if (b.sectionNoise || !b.qtys.length || b.labels.length) continue;
    let best = null;
    for (let d = 1; d <= 5; d++) {
      for (const li of [qi - d, qi + d]) {
        if (li < 0 || li >= analyzed.length) continue;
        const a = analyzed[li];
        if (!a.labels.length || a.qtys.length || a.parsed.amount != null) continue;
        if (cross.has(li)) continue;
        best = li;
        break;
      }
      if (best != null) break;
    }
    if (best != null) cross.set(best, { li: qi, q: b.qtys[0] });
  }

  const commitLine = (li) => {
    const a = analyzed[li];
    const labels = a.labels;
    const qtys = a.qtys;

    // Einzel-Artikel mit expliziter Menge → parseLine übernimmt auch
    // Standard-Einheiten („2 Tomaten“ → „2 Stück“; „Wasser 1,5 l“).
    if (labels.length <= 1 && a.parsed.amount != null && a.parsed.confidence >= 0.6) {
      add(a.parsed.name, a.parsed.amount, a.parsed.unit, a.parsed.category, Math.max(a.parsed.confidence, 0.85), true);
      if (qtys.length) usedQty.add(qtyKey(li, 0));
      return;
    }

    // Genau ein Label: eigene Menge, sonst Menge aus der Nachbarzeile.
    if (labels.length === 1) {
      const lbl = labels[0];
      let q = null;
      if (qtys.length) {
        q = qtys[qtys.length - 1];
        usedQty.add(qtyKey(li, qtys.length - 1));
      } else {
        const c = cross.get(li);
        if (c && !usedQty.has(qtyKey(c.li, 0))) {
          q = c.q;
          usedQty.add(qtyKey(c.li, 0));
        }
      }
      add(lbl.entry.name, q ? q.amount : null, q ? (q.unit || lbl.entry.unit || "") : lbl.entry.unit || "", lbl.entry.category || "Sonstiges", Math.max(lbl.confidence, 0.85), true);
      return;
    }

    // Mehrere Labels: Mengen positionsgetreu zuordnen
    // („Tomaten 500 g Zwiebeln 2 Stück“ – auch in umgekehrter Reihenfolge).
    if (qtys.length) {
      const used = new Set();
      for (const lbl of labels) {
        let best = -1;
        let bestDist = Infinity;
        let bestAfter = false;
        for (let k = 0; k < qtys.length; k++) {
          if (used.has(k)) continue;
          const dist = Math.abs(qtys[k].idx - lbl.idx);
          const after = qtys[k].idx >= lbl.idx;
          if (dist < bestDist || (dist === bestDist && after && !bestAfter)) {
            best = k;
            bestDist = dist;
            bestAfter = after;
          }
        }
        if (best >= 0) {
          used.add(best);
          add(lbl.entry.name, qtys[best].amount, qtys[best].unit || lbl.entry.unit || "", lbl.entry.category || "Sonstiges", Math.max(lbl.confidence, 0.85), true);
          usedQty.add(qtyKey(li, best));
        } else {
          add(lbl.entry.name, null, lbl.entry.unit || "", lbl.entry.category || "Sonstiges", lbl.confidence, true);
        }
      }
      return;
    }

    // Mehrere Labels ohne Menge → Namen übernehmen.
    for (const lbl of labels) {
      add(lbl.entry.name, null, lbl.entry.unit || "", lbl.entry.category || "Sonstiges", lbl.confidence, true);
    }
  };

  // 1) Erst Zeilen MIT Menge verarbeiten, damit „Wasser 1,5 l“ nicht von
  //    einem doppelten „Wasser“-Label (ohne Menge) überschrieben wird.
  for (let li = 0; li < analyzed.length; li++) {
    const a = analyzed[li];
    if (a.sectionNoise) continue;
    if (a.qtys.length || a.parsed.amount != null) commitLine(li);
  }

  // 2) Zeilen ohne Menge: nächstgelegene Mengen-Zeile zuordnen.
  const labelOnly = [];
  for (let li = 0; li < analyzed.length; li++) {
    const a = analyzed[li];
    if (!a.qtys.length && a.parsed.amount == null && a.labels.length) labelOnly.push(li);
  }
  labelOnly.sort((x, y) => {
    const dx = cross.has(x) ? Math.abs(cross.get(x).li - x) : 999;
    const dy = cross.has(y) ? Math.abs(cross.get(y).li - y) : 999;
    return dx - dy;
  });
  for (const li of labelOnly) commitLine(li);

  // 3) Kurze Zeilen mit Zahl, aber ohne bekanntes Label → unsicher übernehmen.
  for (const a of analyzed) {
    if (a.sectionNoise || a.labels.length || !a.qtys.length || a.parsed.amount == null) continue;
    const nameKey = normalize(a.parsed.name);
    if (!nameKey || OCR_NOISE.has(nameKey)) continue;
    const words = a.line.split(/\s+/).filter(Boolean);
    if (words.length <= 5) {
      add(a.parsed.name, a.parsed.amount, a.parsed.unit, a.parsed.category, a.parsed.confidence, false);
    }
  }

  // 4) Gesamttext-Scan über die Titel-Zeilen (ohne Zutaten-/Nährwertzeilen),
  //    damit mehrzeilige Produktnamen („Nuss-Nougat-Creme“) erkannt werden,
  //    aber Zutatenlisten nicht als Bestand landen.
  const titleText = analyzed.filter((a) => !a.sectionNoise).map((a) => a.line).join(" ");
  const fullNorm = normalize(titleText);
  for (const v of entries) {
    if (v.norm.length < 3) continue;
    if (findPhrase(fullNorm, v.norm) !== -1) {
      add(v.entry.name, null, v.entry.unit || "", v.entry.category || "Sonstiges", v.confidence, true);
    }
  }

  return items;
}

// ------------------------------------------------------------
// Items zusammenführen (gleiches Label + gleiche Einheit)
// ------------------------------------------------------------
export function mergeItems(items) {
  const map = new Map();
  for (const it of items) {
    const key = normalize(it.name) + "|" + (it.unit || "");
    const existing = map.get(key);
    if (existing) {
      if (existing.amount != null && it.amount != null && existing.unit === it.unit) {
        existing.amount = round2(existing.amount + it.amount);
      } else if (existing.amount == null && it.amount != null) {
        existing.amount = it.amount;
      }
    } else {
      map.set(key, { ...it });
    }
  }
  return [...map.values()];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------------
// Bestands-Scoring: Rezept vs. Inventar
// ------------------------------------------------------------
export function inventoryCoverage(ingredients, inventory) {
  const inv = inventory || [];
  const total = ingredients.length;
  const missing = [];
  const have = [];

  for (const ing of ingredients) {
    const match = inv.find((i) => labelMatch(i.name, ing.name));
    const covered = match != null && (ing.amount == null || match.amount == null || match.amount >= ing.amount);
    if (covered) have.push({ ...ing, found: match ? match.amount : null });
    else missing.push({ ...ing });
  }

  const score = total === 0 ? 0 : have.length / total;
  return { total, have: have.length, missing, score, complete: missing.length === 0 };
}

function labelMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return similarity(na, nb) >= 0.85;
}

export function suggestRecipes(recipes, inventory, { query = "", ingredient = "", status = "any", sort = "match" } = {}) {
  const q = normalize(query);
  const ing = normalize(ingredient);
  const scored = recipes.map((r) => {
    const coverage = inventoryCoverage(r.ingredients || [], inventory);
    return { recipe: r, ...coverage };
  });

  const filtered = scored.filter((s) => {
    if (q) {
      const hay = normalize((s.recipe.title || "") + " " + (s.recipe.tags || []).join(" ") + " " + (s.recipe.ingredients || []).map((i) => i.name).join(" "));
      if (!hay.includes(q)) return false;
    }
    if (ing) {
      const has = (s.recipe.ingredients || []).some((i) => labelMatch(i.name, ing));
      if (!has) return false;
    }
    if (status === "complete" && s.missing.length > 0) return false;
    if (status === "missing" && s.missing.length === 0) return false;
    return true;
  });

  if (sort === "az") filtered.sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, "de"));
  else if (sort === "new") filtered.sort((a, b) => new Date(b.recipe.created_at || 0) - new Date(a.recipe.created_at || 0));
  else filtered.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);

  return filtered;
}

// ------------------------------------------------------------
// Smart-Shopping: fehlende Zutaten bündeln (nach Kategorie)
// ------------------------------------------------------------
export function buildShoppingList(selectedRecipes, inventory) {
  const missing = [];
  for (const r of selectedRecipes) {
    const cov = inventoryCoverage(r.ingredients || [], inventory);
    missing.push(...cov.missing);
  }
  const merged = mergeItems(missing).map((i) => ({ ...i, done: false }));
  return groupByCategory(merged);
}

export function groupByCategory(items) {
  const order = CATEGORIES;
  const groups = new Map();
  for (const it of items) {
    const cat = it.category || "Sonstiges";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(it);
  }
  return [...groups.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export function formatAmount(item) {
  const a = item.amount;
  const u = item.unit || "";
  if (a == null) return u;
  const num = Number.isInteger(a) ? String(a) : String(a).replace(".", ",");
  return u ? `${num} ${u}` : num;
}

// Zutaten für andere Portionenzahl skalieren
function scaleValue(amount, factor) {
  if (amount == null) return null;
  const v = amount * factor;
  return Math.round(v * 100) / 100;
}

export function scaleIngredients(ingredients, factor) {
  return (ingredients || []).map((i) => ({ ...i, amount: scaleValue(i.amount, factor) }));
}

export function kbStats() {
  return { labels: KNOWLEDGE.length, categories: CATEGORIES.length, aliases: KB_ALIAS.size };
}

// ------------------------------------------------------------
// Label-Suche für Schnellauswahl (Type-Ahead in der Eingabe)
// ------------------------------------------------------------
export function searchLabels(query, limit = 8) {
  const q = normalize(query);
  if (!q || q.length < 2) return [];
  const scored = [];
  for (const entry of KNOWLEDGE) {
    const norm = normalize(entry.name);
    let score = 0;
    if (norm === q) score = 2;
    else if (norm.startsWith(q)) score = 1.2 - Math.min(0.6, norm.length * 0.01);
    else if (norm.includes(q)) score = 0.8 - Math.min(0.5, norm.length * 0.008);
    else {
      for (const alias of entry.aliases) {
        const a = normalize(alias);
        if (a === q) { score = Math.max(score, 1.9); break; }
        if (a.startsWith(q)) { score = Math.max(score, 1.1); break; }
        if (a.includes(q)) { score = Math.max(score, 0.7); }
      }
      if (score === 0) continue;
    }
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || normalize(a.entry.name).localeCompare(normalize(b.entry.name), "de"));
  return scored.slice(0, limit).map((s) => s.entry);
}

export function modelInfo() {
  return {
    name: Synaptic.name,
    version: Synaptic.version,
    runtime: Synaptic.runtime,
    locale: Synaptic.locale,
    engines: Synaptic.engines,
    knowledge: KNOWLEDGE.length,
    categories: CATEGORIES.length,
    stats: { ...Synaptic.stats },
  };
}
