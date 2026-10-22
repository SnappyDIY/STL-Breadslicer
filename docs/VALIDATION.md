# v0.3 validation and remaining limitations

## Scope

Review follows `AGENTS.md` and preserves the imported v0.3 source files. The original conversation archive is not attached to this execution; archive completeness cannot be independently compared. The procedural rabbit remains an original locally generated asset, with no downloaded model or runtime cloud service.

## Fixes

- Use the published `manifold-3d` dependency and its supported setup, bounding-box, extrusion and Boolean APIs.
- Bundle the WASM file through Vite and locate it locally in the browser.
- Slice with two exact half-spaces. Normalize arbitrary normals, measure distance in millimeters, and derive extent from actual vertices rather than the bounding-box corners. The UI applies Euler rotations before horizontal slicing.
- Enlarge the rabbit polygonization domain to enclose the whole implicit surface. Canonicalize edge interpolation and orient triangles using the tetrahedron's linear field, preventing cracks and inverted faces near blends.
- Reject open, empty, non-finite or incorrectly oriented mesh inputs. Preserve float32 coordinates when welding vertices; avoid decimal rounding that can merge small features.
- Use Manifold's cross-section contours for the application's laser output, including holes and concave paths.
- Copy STL bytes into owned ArrayBuffers and share vertex indices in 3MF meshes.
- Reject non-finite slice parameters. Show print and laser export actions in their respective manufacturing modes and label experimental patterns.

## Automated geometric evidence

The first full successful CI run is [39733735483](https://github.com/SnappyDIY/STL-Breadslicer/actions/runs/39733735483) at commit `5ce5320ad05aec58de813f57977a2f4830e4e965`: dependency installation, 21 tests and TypeScript/Vite build all passed. Later changes add invalid-pattern and browser regression checks; see the PR's latest checks for their results.

Default-resolution rabbit, uniformly scaled to 60 mm in Z:

| Measurement | Result |
| --- | --- |
| Input triangles after conversion | 41,780 |
| Slabs at 5 mm | 12 nonempty valid solids |
| Source volume | 24,099.478323196476 mm³ |
| Sum of slab volumes | 24,099.47832165135 mm³ |
| Relative volume difference | approximately 6.4 × 10⁻¹¹ |

Checks include two incident faces with opposite orientation at every geometric edge; Manifold status and positive volume; STL export/import for the source and all twelve slabs; 90° X/Y rotations and an oblique (23°, 41°, 17°) rotation; volume conservation and slice bounds for X, Y, Z, scaled Z normals and an oblique (1, 2, 3) normal; all four cutout patterns; rejection of an open triangle; concave contours with a hole and SVG millimeter dimensions; and a 3MF topology/volume round trip.

The Chromium smoke script exercises the built application: local rabbit import, WASM initialization, slicing and STL/SVG downloads, with no external requests or page errors. Run it after building and installing Chromium:

```sh
npm install
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

## Remaining issues

- No physical print or laser calibration has been performed. Automated millimeter and topology checks do not establish production readiness.
- `gyroid` and `voronoi` are simplified planar cutout prototypes; connectors and relief are reserved controls. Shelf placement is not true nesting.
- Kerf correction in individual SVG export uses an approximate bounded miter offset. Robust offsets for acute/complex concave paths, intersecting offsets and nested islands remain unverified. DXF and sheet layout currently omit kerf correction; calibrate separately before manufacturing.
- `wall` keeps pattern cells away from the slice's bounding rectangle, not every point of a curved exterior. It does not guarantee a uniform physical shell thickness on arbitrary meshes.
- Project JSON does not preserve applied orientation separately from the original STL. A rotated project's custom boundaries can mismatch after reopening; reapply orientation and reset boundaries.
- Large meshes and pattern generation run on the UI thread; cancellation, robust memory budgeting and exhaustive malformed-project validation remain open.
- The unused legacy `contoursAtZ` helper remains in the source for compatibility and is not the application's laser path. Vertex/coplanar degeneracies of that helper are not validated.
- The resolved Vitest 3 toolchain has three npm audit findings (one moderate, two critical, including transitive attribution): `@vitest/mocker` ([GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)) and `tinypool` ([GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)). These are development dependencies. npm recommends a breaking upgrade to Vitest 5.0.5, which remains a separate migration; `npm audit` is reported but does not block geometric/build checks.
- CI uploads the resolved `package-lock.json` as the `dependency-lockfile` artifact for each run. A committed cross-platform lockfile is still absent, so a fresh `npm install` can resolve newer dependency versions.
- Vite reports the upstream Manifold Node-only import as browser-external and a JavaScript bundle over 500 kB. Browser execution is checked separately; splitting the rendering bundle is future performance work.
- This workspace's proxy access prevents local dependency installation (`EPERM`). Installation, tests and build are executed by GitHub Actions; the package-name correction resolves the separate registry 404.
