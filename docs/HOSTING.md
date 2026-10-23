# Hosting mit GitHub Pages

Der Workflow `.github/workflows/build.yml` testet und baut die App. Nach einem erfolgreichen Lauf auf `main` veröffentlicht er `dist` auf GitHub Pages. Pull Requests werden geprüft, aber nicht veröffentlicht.

Erwartete Adresse: https://snappydiy.github.io/STL-Breadslicer/

GitHub muss Pages für dieses Repository mit der Quelle **GitHub Actions** aktiviert haben. Bei einem privaten Repository muss der GitHub-Tarif Pages unterstützen. Die Veröffentlichung der Website macht den Quellcode nicht öffentlich; die ausgelieferten Browserdateien sind für Besucher jedoch abrufbar.

STL-Dateien werden weiterhin ausschließlich im Browser verarbeitet. Es gibt keinen Server für Benutzerdateien und keine gemeinsamen gespeicherten Projekte.

## Lokal denselben Unterordner prüfen (PowerShell)

```powershell
$env:PAGES_BASE_PATH = '/STL-Breadslicer/'
npm run build
npm run test:browser
Remove-Item Env:PAGES_BASE_PATH
```

Ohne diese Umgebungsvariable bleiben Entwicklung und Build auf dem Wurzelpfad `/`. Ein späterer Wechsel auf eine eigene Domain benötigt entsprechend einen Build mit `/` als Basispfad.

Aktueller Status: Das Repository wurde mit Zustimmung des Eigentümers öffentlich geschaltet. GitHub Pages ist mit der Quelle GitHub Actions aktiviert; die Repository-Variable PAGES_ENABLED steht auf true. Zum Pausieren der Veröffentlichung kann diese Variable auf false gesetzt werden.