# STL BreadSlicer v0.3

Local-first browser application for STL slicing for 3D printing and laser cutting.

## Start

Node.js 22 or later is recommended.

```sh
npm install
npm run dev
```

## Quality checks

```sh
npm test
npm run build
# Optional browser check of the built application:
npx playwright install --with-deps chromium
npm run test:browser
```

GitHub Actions installs dependencies, runs geometric regression tests, builds the app and checks local WASM/model processing and manufacturing downloads in Chromium. See [validation results and remaining issues](docs/VALIDATION.md).

## Implemented

- Local STL import with solid validation, locally generated watertight rabbit
- X/Y/Z model rotations, automatic extents, interactive slice boundaries
- Exact slab intersections; normalized arbitrary normals in the geometry API
- Solid, honeycomb and grid cutouts
- Separate print (STL, ZIP, 3MF) and laser (SVG, DXF, sheet SVG) exports
- Closed concave laser cross-sections with holes
- Basic JSON project save/load and shelf placement

Gyroid and Voronoi are simplified prototypes. Connectors and relief are reserved features. Kerf offsets, uniform shell thickness, nesting, orientation persistence and physical manufacturing accuracy have limitations documented in the validation report. Passing automated checks does not establish production readiness.

## Stack

React 19, TypeScript, Vite, Three.js, `manifold-3d` WASM, JSZip, Vitest, Playwright. All model processing and assets stay local to the browser.

## Development instructions

Read [AGENTS.md](AGENTS.md). Preserve imported source files and keep geometric and export regressions passing.
