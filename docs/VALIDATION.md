# Aktueller Stand: v0.5

Produktionsbuild und 87 Tests erfolgreich. Die zuvor offenen Fertigungsfunktionen sind umgesetzt; Bedienung und numerische Grenzen stehen in [MANUFACTURING.md](MANUFACTURING.md). Die folgenden Abschnitte dokumentieren die Entwicklung chronologisch; der Abschnitt v0.5 manufacturing completion beschreibt den aktuellen Fertigungsstand.

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
- Kerf correction in individual SVG and DXF exports uses an approximate bounded miter offset. Robust offsets for acute/complex concave paths, intersecting offsets and nested islands remain unverified. Sheet layout currently omits kerf correction; calibrate separately before manufacturing.
- `wall` now clips cutouts to the intersection of five contour offsets across each slab, including its near-end faces. This preserves a contour-following rim at those sampled sections. It does not guarantee a uniform physical shell thickness between samples on arbitrary curved meshes.
- Project JSON now embeds the current oriented source mesh. On import, rotation controls reset to zero relative to that saved mesh. Previously saved files that already contain mismatched geometry and boundaries still require correction.
- Large meshes and pattern generation run on the UI thread; cancellation, robust memory budgeting and exhaustive malformed-project validation remain open.
- The unused legacy `contoursAtZ` helper remains in the source for compatibility and is not the application's laser path. Vertex/coplanar degeneracies of that helper are not validated.
- The resolved Vitest 3 toolchain has three npm audit findings (one moderate, two critical, including transitive attribution): `@vitest/mocker` ([GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)) and `tinypool` ([GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)). These are development dependencies. npm recommends a breaking upgrade to Vitest 5.0.5, which remains a separate migration; `npm audit` is reported but does not block geometric/build checks.
- A local package-lock.json now records the tested dependency resolution. CI also uploads its resolved lockfile as an artifact.
- Vite reports the upstream Manifold Node-only import as browser-external and a JavaScript bundle over 500 kB. Browser execution is checked separately; splitting the rendering bundle is future performance work.
- The original cloud workspace blocked local dependency installation (`EPERM`). In the Windows workspace, installation, build and all 22 tests now pass with the required execution permissions.

## Windows preview follow-up

- Camera up and floor grid now use Z as the height axis, matching model slicing.
- A committed package-lock.json records the dependency resolution used locally.
- Manual browser regression: rotate the bunny 45 degrees around X (88.8 mm Z extent), save JSON, load the unrotated demo, reopen the saved project and generate again. The saved boundaries remain unchanged and generation succeeds with 18 valid slabs. Rotation controls reset relative to the saved mesh.
- TypeScript/Vite production build and all 22 tests pass after the save fix. Existing bundle-size and upstream browser-external warnings remain.

## Reference-layout implementation

The v0.4 workspace follows the supplied reference image: numbered model and slicing controls, original/cut-plane/exploded model views, active 3D slice and fill/laser tabs, a synchronized contour gallery, SVG preview with kerf and separate print/laser export bars. Views and thumbnail contours use the computed mesh and slice data; no render of the reference is used as a functional viewport.

The local procedural bunny loads at 60 mm and automatically generates twelve 5 mm honeycomb slabs. X/Y/Z selection changes the actual slicing frame, and the optional project `sliceNormal` field preserves axis and sign while existing v1 projects default to Z. Orientation remains baked into saved source geometry.

New geometry regressions cover a tiny floating-point residual slab, a valid remainder, contour-preserving rim on a cylinder, and all twelve patterned bunny slabs including tip sections. Build and 26 tests pass. The Chromium smoke script is updated to the new controls; browser QA in this session uses the in-app browser.

The reference's detailed Stanford mesh is not part of the supplied PNG. This implementation continues to use the bundled procedural bunny. Reliefs, connectors and true nesting remain reserved or limited as described above. The rim is sampled at five cross-sections rather than guaranteed as a continuous 3D offset.

Manual in-app browser checks also confirm STL binary length, an SVG with millimeter dimensions and 25 contour paths, X-axis project save/reopen (10 slabs), restoration of Z (12 slabs), and exploded view. The final browser console contains no error entries. This is session QA, not a claim that the updated standalone Chromium script was executed locally.

## Dimension-based model scaling

Model settings now precede slicing and filling with XYZ target dimensions in millimeters. Proportional scaling is enabled by default; unlocking permits independent axis dimensions. Applying dimensions scales the actual mesh, resets manual boundaries to the current slice thickness and stores that geometry as the new rotation baseline. Wall distance, pattern cell size, kerf and slice thickness retain their physical millimeter values. Saved projects embed the scaled geometry.

Build and 29 regression tests pass. New tests verify uniform and independent scaling, physical extents, volume, STL round trips, subsequent slicing, unchanged input meshes and rejection of invalid sizes. Browser QA verifies 60 → 90 mm proportional scaling (18 × 5 mm), a subsequent orientation reset that retains 90 mm, independent X scaling to 80 mm, and saved geometry with the expected dimensions. The saved example retains wall 1.5 mm, cell 3 mm and thickness 5 mm.

Browser project round trip completed: after changing X independently to 80 mm, reopening the saved proportional model restores approximately 68.64 × 39.24 × 90 mm and generates 18 slabs again.

## Centering and slice-center convention

Import now centers the model bounding box in X/Y and sets the bottom face at Z=0. Rotation and dimension scaling restore this placement too. Stored project boundaries shift by the same translation projected on the saved normal, retaining manual cuts and reversed axes. The normalized mesh becomes the rotation baseline, so subsequent rotations cannot recover an old STL offset.

Every slab is defined by its two boundaries; its center is their arithmetic midpoint. Laser contours use only the cross-section at that center. In a 30 mm model, five 6 mm slabs have centers 3, 9, 15, 21 and 27 mm. The middle solid spans 12–18 mm and its laser contour is taken at 15 mm. A thinner final slab uses its actual center.

The 3D planes now represent those center distances rather than boundary faces. Active-part and laser panels explicitly show middle and interval; selection remains correct when empty intervals are skipped.

Build and 33 tests pass. Added regressions cover offset STL centering without rescaling, translating saved cuts along X and reversed Z, exact center arithmetic, and a tapered 30 mm shape proving that the contour at 15 mm differs from both 12 and 18 mm end faces.

Browser verification: the 30 mm demo with 6 mm thickness produces five slabs. Selecting slab 3 displays center 15.00 mm, solid interval 12.00–18.00 mm and laser plane Z=15.00 mm. The visible highlighted plane matches that middle section.

## Coupled uniform thickness and count; selected logo

Logo variant 03 (cream/turquoise contour toast with offset slice) is now used in the header and as favicon.

Uniform slicing now derives one exact common thickness from the selected-axis extent and integer count. For 20 mm and two slices, boundaries are 0/10/20 (or -10/0/10 on a centered X axis) and both solids are 10 mm thick. Editing count preserves that count through scaling and axis changes. Editing thickness treats the request as an upper limit, derives the required integer count and displays the actual equal thickness: 20 mm with a requested 6 mm becomes four 5 mm slices. The requested limit is retained independently to prevent rounding drift when switching axes and back.

Number fields commit on Enter or blur so typing a multi-digit count does not start regeneration midway. The interface displays extent ÷ count = actual thickness. Manual boundaries remain available; their thickness field represents the mean.

Build and all 41 tests pass. Browser QA verifies X extent 20 mm/count 2/thickness 10 mm and resizing X to 30 mm/count 2/thickness 15 mm. Existing tests retain solid and middle-plane validation.

## Number-entry focus behavior

All numeric boxes now use a shared NumberField with a local string draft. Typing, clearing the box, spinner changes and pressing Enter do not update manufacturing configuration. Only leaving the field commits a changed, finite, in-range number; invalid/empty values revert. Count fields additionally require an integer. Accepted derived thickness/count values are written back even when the actual configured number is unchanged after rounding.

A focused field remains editable when a preceding calculation starts. Configuration changes during a running calculation invalidate its stale result and queue the latest calculation. Range sliders retain their existing behavior; the scaling and rotation apply buttons retain their existing roles.

TypeScript/Vite build passes, and all 41 existing tests pass. Manual browser QA: changing density 35→65 while focused leaves both status and current 7,658-triangle slice unchanged; Tab starts recalculation and produces the updated 8,272-triangle slice. Editing count 12→2, including clearing the field and pressing Enter, leaves the gallery at 12 until Tab; only then does thickness update to 30 mm and count to two.

Additional browser QA confirms a fractional count of 2.5 reverts to the previously accepted integer 2 when the field is left, retaining the two computed slabs.

## Return confirmation for numeric edits

Return/Enter now explicitly confirms a numeric draft by moving focus out of the field and reusing the same single blur commit. Clicking outside and Tab continue to commit too; typing and pauses still do not. Invalid values use the same validation path. The UI hint reflects both confirmation methods. Production build passes. In-app browser QA: typing count 6 leaves the gallery at 12, then Enter updates the plan to six 10 mm slabs across 60 mm and starts generation.

## Whole-model silhouette projection

The Laser area now switches between the active slice midpoint and a silhouette of the complete applied source solid. Front (-Y), side (+X) and top (+Z) are orthographic projections in millimeters. Rotation followed by Apply supports other model orientations. The projection unions overlapping geometry across depth and preserves concavities; it does not use a hull or one slice. By default interior openings are filled; the optional holes setting retains only openings visible through the complete depth. Slice thickness, density and infill do not affect this projection.

SVG and closed-polyline DXF exports use the selected projection and the existing approximate kerf offset. DXF declares millimeter insertion units. Direction, source mode and holes setting persist in project JSON, with slice defaults for old projects.

Production build and all 51 tests pass, including projection dimensions/area, arbitrary direction, concavity, overlapping depths, through-holes versus occluded holes, nested islands, source preservation and DXF units/kerf. In-app browser QA confirms front 45.76×60.00, side 26.16×60.00 and top 45.76×26.16 mm for the demo. SVG/DXF download and project save/reload with top direction and holes enabled succeed. Parallel light is intentional: no perspective enlargement or point-light distance setting is applied.

## Silhouette contour distance

Added Konturabstand slider and numeric field (-20 to +20 mm, 0.1 mm steps). Positive distances expand material and shrink holes, negative distances contract material and expand holes. Uses manifold CrossSection offsets with rounded joins, resolves contour collisions and empty results. Applies to both previews and SVG/DXF before separate kerf compensation, stored as optional silhouetteOffset in project JSON (default 0 for older files). Numeric input commits on Enter/blur; slider updates directly. Does not regenerate slabs. Build and all 53 tests pass; tests verify dimensions, loss of a narrow shape, hole closure, merging islands and invalid values. Browser verifies +3 mm, slider +0.1, -2 mm on blur and +2 mm (49.76 x 64 mm demo), SVG download and saved offset.

## Align the source model to a chosen planar face

Added Model ausrichten before scaling and slicing controls. Detects coplanar triangles using geometric outward normals and plane distance, lists up to twelve significant planes by area, and supports raycast picking directly on the original model. Selected triangles appear turquoise; drag still orbits, and a click chooses a face. Tiny faceted patches on curved objects are excluded from the automatic shortlist (minimum 0.1% total area and two triangles); manual single-facet selection remains possible and explicitly labeled. Disconnected coplanar patches are grouped together. No semantic inference of the object's front is made.

The selected normal can face front/back/left/right/top/bottom. The longest boundary edge (excluding triangulation diagonals) fixes in-plane rotation; 0/90/180/270 degree adjustments are available. This rotates the actual source geometry into world X/Y/Z, preserving form/volume, recenters X/Y and places the bounding-box bottom at Z=0. Slab boundaries are rebuilt using the prior count/thickness preference. The applied mesh becomes the new numeric-rotation baseline and is saved in project JSON. One-step Undo restores the preceding source, boundaries and slicing normal.

Build and all 63 tests pass. Ten alignment tests cover six target directions, tilted indexed/nonindexed geometry, source preservation, solid volume, recentering, boundary edge versus diagonal, quarter turns, degeneracy and invalid directions. In-app browser: a tilted 20x30x10 cube is detected as six planes; clicking highlights both triangles of a 600 mm² plane. Bottom alignment produces 30x20x10, Undo restores 33.91x33.75x29.08 bounding dimensions, front plus 90 degrees produces 20x10x30. Numeric rotation Reset keeps that new orientation. Project save/reload preserves it. The original demo project is restored after QA. Curved surfaces without a meaningful plane require a manually chosen facet or the existing numeric rotation controls.

## Fix unwanted face-alignment roll; upright mode

Reproduced on the user's currently loaded priest unsupported.stl. An unconditional longest-edge frame imposed an additional roll even with 0 degrees selected, tipping the figure sideways. The boundary-edge frame is now opt-in (Zusätzlich an Flächenkante drehen, initially off). Without it, full 3D alignment uses only the shortest rotation from the face normal to the target.

For front/back/left/right, Aufrecht lassen – nur um Z drehen is initially on. It aligns the horizontal component of the selected normal, preserving Z heights and existing model inclination; it intentionally does not remove a slanted facet's pitch. It disables conflicting edge/roll controls. Horizontal faces report an actionable error in this mode; top/bottom targets continue to use full alignment. Unchecking upright mode permits exact 3D face-normal alignment.

Build and all 67 tests pass, including no extra roll for an already forward face, vertical-plane yaw without pitch, slanted-face upright alignment preserving Z even with stale edge/roll options, and horizontal-face validation. Browser QA uses the same clicked tiny base facet on the actual 94,318-triangle model, with before/after project backups. Corrected upright mode keeps height 19.05 mm and the figure standing. The actual model remains loaded in the verified corrected orientation; Undo restores its pre-test standing orientation. Screenshot ausrichtung-vorschau.png updated.

## Automatic broader reference patches and compact alignment UI

Replaced exact normal/distance buckets with connected region growth across shared mesh edges. Each triangle must stay within eight degrees of the seed normal and within 0.2% of the model diagonal from the seed plane. All vertices are checked against that fixed plane, limiting growth around curved surfaces. Output normals are area-weighted averages. Disconnected coplanar patches remain distinct. The source geometry is never simplified or modified by detection, and no new tolerance control is exposed.

Basic alignment UI now shows only pick face, selected area/upright status, target direction, Apply/Undo. Detected-face list, upright toggle, edge orientation and in-plane rotation are in collapsed Erweitert. Existing upright default and exact-alignment options remain available.

Production build passes and all 70 tests pass. New cases verify one averaged patch for 128 slightly uneven triangles, no cumulative wrapping around a cylinder, disconnected-plane separation and unchanged source positions. Browser QA restores the user's priest unsupported.stl project, finds up to 28.6 mm² patches, and selects the front base patch as 15.38 mm² / 375 triangles, highlighted together. Model remains in its original saved orientation with four valid slabs; selection has not been applied. Updated ausrichtung-vorschau.png shows the compact UI and selected patch.

## Actual STL thumbnail

Replaced the fixed bunny icon in the model summary with a static rendered thumbnail of the applied source geometry. Updates on model load, alignment, rotation, scaling and project restore. Rendering is local, runs once per source change, and disposes its temporary WebGL renderer/material; there is no additional animation loop. The existing source geometry remains owned by the app. If WebGL rendering is unavailable a generic cube appears. Production TypeScript/Vite build passes; browser QA verifies switching from the demo bunny to the currently loaded priest model.

## Solid default

Massiv (solid) is now the startup default and is reset for newly imported STL/demo models. Project files and Undo keep their saved pattern. The user's current priest model was restored and explicitly switched to Massiv. Production build and all 70 tests pass. Browser verifies startup Massiv, restoration of the saved Honeycomb preference, then Massiv for the current model. Existing explicit patterned geometry regressions remain unchanged.

## v0.5 manufacturing completion

Implemented the six previously open manufacturing areas. Relief engraves real grooves/dots/cross textures in upper cut faces with depth validation. Connections produce matching blind pockets plus separate dowels, or integrated pegs and sockets, verified against actual 3D material at each interface; insufficient space fails explicitly. Accessories are included in STL ZIP and 3MF. Voronoi uses exact pairwise site bisectors and clipped cells; Gyroid is a sampled 3D trigonometric field, no longer a rotated polygon surrogate.

The former five-section rim was replaced by a full-source signed Euclidean distance interior, accelerated with MeshBVH and meshed using Manifold.levelSet. Production generation prepares it once and reuses it across slabs. Sampling resolution is configurable, with a half-step inward allowance and bounded resource use. This is not an exact analytic surface or a claim of physically calibrated wall accuracy. Documentation/API reference used: https://github.com/gkjohnson/three-mesh-bvh/blob/master/API.md .

All live SVG/DXF/preview paths use joint Clipper2 kerf offsets, including holes and topology changes. Legacy offsetLoop/shelfNest/sheetSVG exports remain for compatibility but are not the live manufacturing path. Actual-contour nesting tries quarter turns, checks buffered contour collisions, reserves holes, respects plate bounds and outputs extra plates automatically. SVG/DXF plus a placement manifest are downloaded as a ZIP. It is a bounded deterministic heuristic, not global optimization. Changing plate-only settings no longer invalidates the slice geometry. Print-specific relief/connections are omitted in laser mode and regenerated on mode changes.

Production build passes. All 87 tests pass across five suites. Coverage includes Voronoi partition/non-overlap, true Gyroid variation with Z, three relief textures/depth/extents/arbitrary cut direction, spatial sphere-wall distance, matching dowels/pegs with zero interpart overlap, impossible connectors, joint kerf/hole disappearance, rotated/multi-sheet/interlocking nesting, compensated interpart gaps, and all prior geometric/export/centering/number-plan cases. Gyroid's real 3D work uses a 30 s targeted test timeout; spatial interiors are reused for patterned-stack regression to match the production pipeline.

Browser QA on a 20x20x10 mm local cube: cross relief appears as real carved geometry; two 5 mm slabs produce two dowels; downloaded STL ZIP has slice_001.stl, slice_002.stl, passstift_1_1.stl, passstift_1_2.stl; downloaded 3MF has four objects. Voronoi and Gyroid active-slice previews are visible. A 30x30 mm layout produces two plates, two SVGs, two DXFs, and a manifest containing both parts; modified plate dimensions leave export enabled. Actual user's model/config was backed up before changes and is restored after QA. No external publication, physical print or laser calibration was performed.

Final combination regression: engraved cross texture plus pegs/sockets succeeds for centered imported-model coordinates as well. Connector material is verified beneath the texture layer and pegs anchor below its depth. Browser project save/reopen restores cross relief, diameter, clearance and plug mode; lower-part preview shows real pegs and texture together. The dev preview server had stopped during work; it was restarted hidden on 127.0.0.1:5174 and the saved combination was explicitly re-opened on current code. Full feature options remain collapsed after restoring the user's original model. No production readiness or physical calibration is claimed.
