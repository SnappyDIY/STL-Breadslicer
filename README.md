# STL BreadSlicer

Local-first browser application for slicing STL meshes for 3D printing and laser cutting.

## Codex handoff
The project instructions are in [AGENTS.md](AGENTS.md).

**Source transfer status:** The existing v0.3 Bunny application is available in the originating ChatGPT conversation as `stl-breadslicer-v0.3-bunny-source.zip` and has not yet been imported into this repository. Upload the contents of that archive (not its parent folder) before running build commands.

## Stack
React, TypeScript, Vite, Three.js, Manifold WASM, Vitest.

## After source import
```bash
npm install
npm run build
npm test
npm run dev
```

Prioritize successful build and real geometry validation. See AGENTS.md for acceptance criteria.
