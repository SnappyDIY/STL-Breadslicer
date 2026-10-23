# STL BreadSlicer v0.5

Lokale Browser-App zum Ausrichten, Skalieren und Schneiden von STL-Modellen für 3D-Druck und Laser. Modelle und Berechnungen bleiben auf dem eigenen Rechner.

## Starten

```sh
npm install
npm run dev
```

## Funktionen

- STL-Prüfung, echte Modellminiatur, Zentrierung und Skalierung in Millimetern
- Zusammenhängende Bezugsflächen erkennen und das Modell an X/Y/Z ausrichten
- Original-, Schnitt- und Explosionsansicht, gekoppelte Scheibendicke und Anzahl, manuelle Grenzen
- Massiv als Standard; Honeycomb, Gitter, Voronoi-Zellen und räumliches Gyroid
- Räumlicher Wandabstand aus einem beschleunigten Abstandsfeld
- Eingravierte Rillen-, Punkt- und Kreuzreliefs auf Schnittflächen
- Passbohrungen mit separaten Passstiften oder Steckzapfen mit passenden Buchsen
- Silhouette des gesamten Modells mit Konturabstand und optionalen Innenöffnungen
- STL, ZIP, 3MF sowie SVG/DXF mit gemeinsamer topologischer Kerf-Kompensation
- Konturbasiertes Nesting mit Vierteldrehungen, Teileabstand und mehreren Platten
- Projektdateien mit Modell und Fertigungseinstellungen

Zusatzoptionen bleiben eingeklappt. Zahlen werden mit Return oder beim Verlassen des Felds übernommen. Gespeicherte Projekte behalten ihre Einstellungen; neue STL-Modelle starten massiv.

Siehe [Bedienung und Fertigungsdetails](docs/MANUFACTURING.md) sowie [Validierung](docs/VALIDATION.md).

## Prüfen

```sh
npm run build
npm test
# Optionaler separater Chromium-Smoke-Test:
npm run test:browser
```

Der Produktionsbuild und 87 automatisierte Tests wurden ausgeführt. Zusätzlich wurden Vorschauen, Passstift-STL/3MF sowie SVG/DXF-Mehrplattenpakete im In-App-Browser geprüft. Der separate Chromium-Smoke-Test wurde in dieser Sitzung nicht ausgeführt.

## Technische Grundlage

React, TypeScript, Vite, Three.js, manifold-3d/Clipper2, JSZip, Vitest und [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) für beschleunigte Abstandsmessungen. Keine Modelle werden hochgeladen.

Die Geometrieberechnung verwendet eine einstellbare numerische Auflösung. Nesting ist eine geprüfte heuristische Anordnung, kein Nachweis des globalen Materialoptimums. Physische Passungen und Laserbreiten hängen von Maschine und Material ab und wurden nicht an realen Fertigungsmaschinen kalibriert.

Entwicklungsregeln: [AGENTS.md](AGENTS.md).
## Online nutzen

[STL BreadSlicer öffnen](https://snappydiy.github.io/STL-Breadslicer/). Modelle bleiben im Browser. Hinweise zur automatischen Veröffentlichung stehen in [docs/HOSTING.md](docs/HOSTING.md).
