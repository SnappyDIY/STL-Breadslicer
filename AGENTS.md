# Codex instructions — STL BreadSlicer

This repository is the development home for STL BreadSlicer, a local-first browser CAD tool for 3D printing and laser cutting.

## Stack
React, TypeScript, Vite, Three.js, manifold-3d (WASM), JSZip, Vitest.

## Priorities
1. Import the complete v0.3 Bunny source archive supplied in the ChatGPT conversation. Preserve all existing source files.
2. Run npm install, npm run build, and npm test; fix failures before adding features.
3. Replace the generated demo bunny with an attractive, watertight, locally bundled rabbit mesh licensed for redistribution, or improve the procedural bunny.
4. Support arbitrary slicing direction with normalized plane normals and exact slab intersections. Automatically derive model extent along that normal.
5. Validate watertight exported solids and dimensional accuracy.
6. Keep 3D print and laser workflows separate: STL/3MF for print, planar SVG/DXF contours with calibrated kerf for laser.
7. Clearly distinguish implemented features from prototypes (gyroid, voronoi, connectors, reliefs, nesting).
8. No cloud dependency or uploaded user meshes. Keep all processing local.

## Acceptance test
A 60 mm high watertight sample sliced into 5 mm slabs must produce 12 valid solids; test axis rotations and SVG dimensions. Add regression tests for open meshes, concave contours, and export.

## Commands
npm install
npm run build
npm test
npm run dev

Do not claim production readiness without passing tests and geometric validation.
