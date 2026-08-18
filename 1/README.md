# Rezeptliste (WuW#1)

Standalone-Version der xSyna-Rezeptliste: Bestand verwalten, Rezepte finden und
Einkaufslisten smart bauen – powered by Synaptic Foundation Model, 100 % lokal
und offline-fähig.

## Starten

Jeder statische Dateiserver funktioniert. Vom Repo-Root aus:

```bash
python3 -m http.server 3000
# oder
npx serve .
```

Danach öffnen: <http://localhost:3000/> (leitet auf `/recipe-list/` weiter).

## Struktur

- `recipe-list/` – App-Shell, Web App Manifest und Service Worker (Scope `/recipe-list/`)
- `src/recipe-list.js` – Hauptlogik der App
- `src/index.css` – komplettes Design-System (Notdesign-Fallback)
- `src/js/` – lokale Module:
  - `synaptic.js` – Synaptic Foundation Model (Parsing, Kategorien, Bestandsabgleich, Vorschläge)
  - `ocr-boost.js` – OCR-Vorverarbeitung (Mengen-/Einheiten-Reparatur, Mehrfach-Produkte)
  - `xscan.js` – Live-Kamera-Erkennung (Tesseract.js via CDN)
  - `web-recipes.js` – Rezept-Import von Websites & öffentlichen APIs (TheMealDB, TheCocktailDB, DummyJSON)
  - `ui.js` – Toasts, Modal, HTML-Escape-Helfer
  - `api-assets.js` – optionales Remote-Branding (`api.xsyna.de/index.txt`)
  - `supabase.js` – optionales Cloud-Backup über den xSyna-Account
- `recipe-list-icon.svg` – App-Icon

## Hinweise

- Ohne Account und ohne Netzwerk läuft die App vollständig lokal (localStorage).
- Das optionale Cloud-Backup (`supabase.js`) nutzt `@supabase/supabase-js` als
  Bare-Modul-Specifier. Falls du das Backup im Standalone-Repo aktivieren willst,
  ergänze in `recipe-list/index.html` eine Import-Map:
  `"@supabase/supabase-js": "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"`.
- OCR (xScan/„Von Foto“) lädt Tesseract.js nach Bedarf von jsDelivr.
