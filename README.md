# STL BreadSlicer v0.3

Local-first browser application for STL slicing for 3D printing and laser cutting.

## Stack
React 19, TypeScript, Vite, Three.js, Manifold WASM, JSZip, Vitest.

## Start
```bash
npm install
npm run dev
```

## Quality checks
```bash
npm test
npm run build
```

GitHub Actions runs both checks on every push and pull request. **The v0.3 source has been imported, but successful compilation, browser runtime, and manufacturing accuracy have not yet been confirmed.**

## Features in current source
- STL import, manifold conversion, interactive slice boundaries
- Rotations about X/Y/Z for arbitrary slicing orientation
- Locally generated procedural bunny
- Slab Boolean operations, honeycomb and grid-like cutouts
- Experimental simplified Voronoi/gyroid patterns (not true gyroid geometry)
- STL, ZIP, SVG, DXF, 3MF and JSON project import/export
- Basic shelf-based sheet layout and approximate kerf offset

## Known gaps
- True gyroid and robust Voronoi structures
- Connector pegs, joint features, surface relief
- Robust offsetting for holes/concave laser paths, exact nesting
- Mesh validation and end-to-end geometric regression testing
- Confirmed build/runtime

## Codex instructions
Read [AGENTS.md](AGENTS.md). Start by fixing all CI failures and adding validation tests before feature work.
