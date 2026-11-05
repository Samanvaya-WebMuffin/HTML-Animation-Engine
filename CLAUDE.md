# CLAUDE.md

HTML-Animation-Engine is a TypeScript library for HTML motion graphics. It works on its own (DOM, SVG, Canvas 2D) and can optionally run inside Remotion. Every animation renders to MP4 with exact, repeatable frames.

## Current scope

We are deliberately keeping this small. **In scope:** the core engine, DOM/SVG/Canvas renderers and effects, **3D through the built-in projection** (`spatial/`), **one adapter (Remotion)**, and **one export format (MP4, H.264)**, plus PNG stills for checking frames.

**Deferred; don't build these unless asked:** GSAP and Framer Motion adapters; a Three.js adapter (add it only when a scene needs textures, smooth shading, intersecting geometry or very high polygon counts, which the built-in projection can't do); WebM, ProRes, GIF, APNG, PNG-sequence, H.265 and HTML-embed export; segmented and parallel encoding; the audio synth helper. The architecture should still allow them: adapters are separate subpath exports with optional peer dependencies, and the encoder is one module behind the capture loop.

## The core principle (never break this)

Every animation is a **pure function of time**. `render(t, ctx)` draws the frame at `t` seconds **from scratch**.

- No wall-clock reads (`Date.now()`, `new Date()`, `performance.now()`), no `requestAnimationFrame`, no `setTimeout`/`setInterval`, no `Math.random()`, and no state carried over from the previous `render` call.
- Randomness comes only from the seeded RNG in `@html-animation-engine/core`, so render N and render N+1 are identical.
- Third-party libraries are **seeked** to `t` (for Remotion, frame = `useCurrentFrame()`, t = frame / fps). Never let them run on their own clock.
- Playback in the browser calls `render(t)` on a clock. Export calls `render(frame / fps)` for each frame. The clock lives only in `apps/playground/src/player.ts`, and it only picks the frame index.
- CSS `transition`, `@keyframes` animations and the Web Animations API run on the browser's own clock. Don't use them in compositions. The stage disables them, so they can't leak into a render (planned for Phase 3).
- Building DOM or canvas structure once in `setup()` is fine. `render(t)` must then set **every** time-dependent property from `t`, so any frame can be rendered first, in any order.

ESLint enforces the banned APIs in `packages/{core,renderers,adapters}/src` and `examples/` (see `eslint.config.js`; tested in `tests/unit/purity-lint.test.ts`). Don't add `eslint-disable` for these rules. Find a time-derived approach instead.

## Layout

```
packages/core        timeline, easing, tweens, scene graph, RNG, colour, tokens. ZERO runtime deps.
packages/renderers   DOM / SVG / Canvas 2D renderers, effects library, defineSceneComposition, mountStage
packages/adapters    one subpath export per library; currently ./remotion (both directions)
                     (each library is an OPTIONAL peer dependency; never a hard dependency)
packages/export      Node CLI (`hae`) + API: Playwright capture, ffmpeg encode, environment check
apps/playground      Vite app: example list, scrubber, play/pause, frame step, fps, resolution,
                     reduced motion. capture.html = one example at exact size (for headless capture)
examples/<name>/     one folder per animation (see "Adding an example")
tests/unit           repo-wide unit tests (e.g. the purity lint rule)
tests/visual         Playwright tests; goldens in tests/visual/__goldens__/<platform>/
```

### Core engine (`packages/core/src`)

| Module              | What it gives you                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `composition.ts`    | `Composition`, `defineComposition`, frame/time conversion, `compositionSeed`                                                                            |
| `easing/`           | `cubicBezier` (Newton + bisection fallback), closed-form `spring` (`.duration` = settle time), CSS `steps`                                              |
| `tween.ts`          | `progress(t, start, duration, ease)`, `keyframes`, `staggerProgress`, `lerpRect`, `holdFor(text)`                                                       |
| `color/`            | CSS colour parsing, OKLCH conversion with gamut mapping, `mixColors` (OKLCH, shortest hue arc)                                                          |
| `timeline/`         | `timeline([...])` from `clip`/`gap`/`label`/`seq`/`par`/`stagger`, `at(label, offset)`; `tempo({ bpm })` beat grid                                      |
| `geometry/`         | matrices, SVG path parse/flatten/length, `rect`/`pill`/`circle`/`pathGeometry`, **`morph`**                                                             |
| `scene/`            | scene nodes (group/shape/text), camera, `flattenScene` → paint-ordered draw list                                                                        |
| `random/`           | stateless `random(seed, ...keys)`, seeded `createRng`, seeded simplex `createNoise` (with seamless `loop`)                                              |
| `text/`             | `registerFontFaces`, `loadFonts`, `createCanvasMeasurer`, `layoutText`, `baselineOffset`                                                                |
| `spatial/`          | 3D: vectors, matrices, perspective `Camera3D`/`orbitCamera`, meshes (`box`, `plane`, `sphere`, `cylinder`, `pyramid`), `curlVertex`, **`projectSpace`** |
| `safety/`           | `createFlashDetector`: WCAG 2.3.1 flash analysis on RGBA frames                                                                                         |
| `themes/default.ts` | **the** token file: colours, type, easing (`enter`, `exit`, `snap`, `camera`, `wipe`), durations, lighting (shadow colour, elevation, sheen, glow)      |

Conventions the code relies on:

- **Units:** seconds for time, px for space, **degrees** for rotation (clockwise on screen, y down).
- **Colour mixing:** OKLCH with the hue moving in proportion to each end's chroma, so fading a vivid colour to a near-black or grey keeps its hue (lime → `ink` stays lime, never teal).
- **Rects are centred:** `rect(x, y, w, h, radius)` and `Rect.x/y` are the **centre**, so scaling and morphs stay centred. Pills and circles are rects with a large radius, which is why rect → pill → circle interpolates exactly.
- **Eases belong to the arriving key** in `keyframes` and `morph`: `{ at: 2, ..., ease }` eases the segment that ends at t = 2.
- **Timeline placement:** items in a `seq` follow the cursor. An item placed with `{ at }` is absolute and does **not** move the cursor. Labels must be defined before they are referenced.
- **Randomness in `render`:** use `random(ctx.seed, 'name', i)` (stateless), or create `createRng(ctx.seed)` **inside** `render`/`setup`. Never keep an RNG at module scope.
- **Scenes are rebuilt every frame** as plain data: `render(t)` builds a `Scene` and a renderer draws `flattenScene(scene)`. Node `id`s must be unique; renderers use them to reuse elements.
- **Morph shapes must be single closed contours** (multi-contour paths throw). Outline matching happens when `morph()` is called, so call it once in setup or at module scope, not per frame.
- **Text:** declare `fontFaces` (font files) and `fonts` (specs to load) on the composition; the stage registers and loads them before `setup`, then measure with `createCanvasMeasurer()`. Examples get both from `exampleDefaults`; the bundled font is Inter (`examples/fonts.ts`). Never rely on system fonts: line breaks would differ between machines.

### 3D (`packages/core/src/spatial`)

3D is projected, not rendered by a 3D engine: `projectSpace(id, { camera, objects, light?, fog?, sort? }, viewport)` turns meshes into ordinary 2D shape nodes (one polygon per visible face, flat-shaded via OKLCH lightness, fogged, sorted far → near). So 3D works in all three renderers and in export, and stays a pure function of `t`.

- **Axes:** right-handed, **y up**, the default camera looks down −z; rotations are Euler degrees applied X, then Y, then Z. Mesh faces are counter-clockwise seen from outside (tested for every primitive).
- **Near clipping** (`Camera3D.near`) cuts geometry passing the camera, so fly-throughs are safe.
- **Painter's algorithm limits:** intersecting faces, or faces overlapping in a cycle, can sort wrongly. Keep objects apart, hide parts that can't be seen (the slab drops its front plate when the back faces the camera), or pass `sort: false` and give the order yourself (the page curl draws flat part → shadow → strips far-to-near, each strip followed by its printed lines).
- **Bend along strips, not grids:** a curl that depends on distance from a fold should be cut into strips parallel to the fold (see `pageCurl`); a square grid gives a staircase along a diagonal fold.
- Each face gets a 1 px seam stroke in its own colour (`seam`) to hide anti-aliasing cracks between neighbours.

### Renderers and effects (`packages/renderers/src`)

Write examples with **`defineSceneComposition({ renderer: 'canvas' | 'svg' | 'dom', setup?, scene(t, ctx, state) })`**. `setup` runs once after fonts load (create effects and measurers there) and its return value is passed to every `scene` call. `scene` returns `{ camera?, world, screen? }`.

The three renderers draw the same `flattenScene` output and are tested for pixel parity (`tests/visual/renderers.spec.ts`). Rules they share; keep them when changing any renderer:

- **Text** is laid out once by core `layoutText` (identical line breaks), and the baseline is placed with `baselineOffset` (CSS half-leading model). Letter spacing is applied after every character.
- **Opacity is per primitive** (fill, stroke, shadow, each text line), as in Canvas, not group opacity.
- **Shadows** are an offset copy of everything the node paints (fill and stroke, or text) in local coordinates; `blur` is a Gaussian with σ = blur / 2 (Canvas `filter`, SVG `feGaussianBlur` in sRGB, CSS `blur()`). `shadow` takes one shadow or a list (painted in order beneath the node); a zero offset with a blur is a glow.
- **Gradients:** a shape's `fill` is a colour or a `linearGradient`/`radialGradient` (core helpers) in the node's local px. Stops must be ascending. For a gradient fading to transparent, fade the same colour's alpha (`withAlpha(c, 0)`), not `transparent`. DOM draws gradient-filled shapes as inline SVG.
- **Canvas** paints the composition background into the bitmap; DOM/SVG rely on the stage background.
- **DOM:** rects are `div`s (a centred stroke is a border on an enlarged box), paths and dashed strokes are inline SVG, clips are nested wrappers with `clip-path: path()`.

**Light and shadow** (`effects/light.ts`, tokens in `theme.lighting`; examples import `lighting` from `examples/index.ts`). Light comes from above. `backdrop` (radial lift + vignette + optional coloured light pools; draw it first), `litFill`/`litGradient` (surface lighter at the top, darker at the bottom), `elevationShadows(lighting, 'low' | 'mid' | 'high', { lift, strength })` (contact + key + ambient layers), `glowShadows`, `lightSweep` (a specular band crossing a shape once), `groundShadow` (soft ellipse under floating or 3D objects). Use them for depth and light rather than flat fills; keep glints slow and small (flash safety).

Effects are **factories** that do their expensive work once and return `(t) => SceneNode` (or a camera): `highlighterWipe`, `maskReveal`, `circleReveal`, `typeOn`, `counterRoll`, `marquee`, `particleBurst`, `confetti`, `dotGrid`, `nodeGraph`, `shapeMorph`, `pathDraw`, `staggerGrid`, `landingShadow`, `pushIn`, `pullBack`, `cameraPath`, in 3D `slab3d`, `pageCurl`, `flyThrough`, and as a shader layer `candleFlame`. Looping effects wrap `t` into their loop first, so `f(loopDuration)` equals `f(0)` exactly.

The **stage** (`mountStage`) blocks CSS transitions and animations inside it, cancels Web Animations and pauses SMIL after every frame (with a console warning), and passes `ctx.reducedMotion`.

### Shader layers (WebGL2)

For per-pixel effects (realistic fire, light, volumetrics), `defineSceneComposition({ shader: { fragment, uniforms(t, ctx, state) } })` draws a full-frame WebGL2 fragment shader beneath the scene (`packages/renderers/src/shader.ts`). Rules:

- **Uniforms only:** the shader may read nothing but its uniforms (plus `uResolution`), and `uniforms` must be a pure function of `t`. Compute slow motion on the CPU with core's seeded noise and pass it in.
- **Integer hashing:** build noise on an integer hash (PCG, see `flame.ts`), never `fract(sin(x) * 43758.5)`, whose precision differs between GPUs.
- **Light in linear space,** then tone-map and convert to sRGB, and dither the output (dark gradients band in 8-bit).
- Headless Chromium runs WebGL on SwiftShader (CPU), which is deterministic. The console message "GPU stall due to ReadPixels" during capture is a harmless performance note.
- The shader's colours may be physical (blackbody light) rather than theme tokens.

`candleFlame` (`effects/flame.ts`) is the reference example. Its model, from flame-structure and photographic references: soot glow as blackbody colour through a filmic tone map, a blue CH/C₂ reaction rim at the base, an oxygen-starved dark zone above the wick, steady sway and breathing (a single candle in still air doesn't really flicker), turbulence that drifts upward and grows towards the tip (`turbulence` ≈ 0.06 for a candle, 0.3+ for wild fire), a halo, wax lit from above with light glowing through it near the top, and a wick with an ember tip.

### Remotion adapter (`@html-animation-engine/adapters/remotion`)

Both directions seek; nothing runs on Remotion's or React's clock.

- **Engine → Remotion:** `<HaeComposition composition={c} />` plays an engine composition at t = `useCurrentFrame()` / fps, holding Remotion's renderer with `delayRender` until fonts and setup are done. Register one in a Remotion project with `<Composition {...remotionCompositionProps(c)} />`.
- **Remotion → engine:** `fromRemotion({ id, component, width, height, fps, durationInFrames, fontFaces?, fonts? })` wraps Remotion-style React code as an engine composition. Each `render(t)` shows frame `floor(t × fps)` through `@remotion/player`'s `<Thumbnail frameToDisplay>` inside `flushSync`, so it is synchronous. Supported: code driven by `useCurrentFrame()` (`interpolate`, `spring`, `Sequence`, `Series`, `AbsoluteFill`, `Easing`, `interpolateColors`). Not supported: `<Video>`/`<Audio>`/`<OffthreadVideo>`, or assets that load after setup.
- Nested asynchronous work (an engine composition inside a Remotion component inside `fromRemotion`) is awaited during setup through a readiness context, so no frame is blank. `remotion-roundtrip` proves both directions: it is pixel-identical to `shape-morph`.
- `remotion` and `@remotion/player` must be the **same exact version** (pinned to 4.0.540 here). Remotion needs a company licence for companies of more than 3 people.
- Compositions may be `composition.tsx`; JSX uses the automatic runtime (`"jsx": "react-jsx"`).

### Capture determinism (read before touching capture or export)

A frame's pixels must not depend on which frames were drawn before it. Two Chrome behaviours break that, and both are handled:

- **Compositing history:** Chrome keeps per-element compositing decisions. An element that once had a transform _and_ opacity below 1 (even 0.9999997 from a settled spring) can rasterise differently on later frames. `mountStage(..., { isolateFrames: true })` detaches and re-attaches the stage after every render, which discards that state while keeping DOM, React roots, canvas bitmaps and WebGL contexts. `capture.html` always uses it; export must too.
- **Screencasting:** Playwright's trace recorder (and any screencast) forces extra compositor frames mid-capture. Tracing is off in `playwright.config.ts`; never capture with a screencast running.

The per-example test "renders identical frames regardless of what was drawn before" captures after every frame (as export does) and compares against a reverse-order pass. Keep it that way: scrubbing without capturing does not exercise this.

### Accessibility

- **Reduced motion:** the playground toggle defaults to the OS `prefers-reduced-motion` setting. Playback then holds each key moment (`config.stills`) for 2 s and cuts between them, and compositions receive `ctx.reducedMotion = true` to drop non-essential motion.
- **Flash safety:** every example is checked by `tests/visual/examples.spec.ts` with `createFlashDetector` (WCAG 2.3.1: more than 3 flashes in any second, in a region a third of the frame in each dimension, sliding by a sixth). A failing example must be changed; don't loosen the detector.

Package names are `@html-animation-engine/<name>`. The composition contract is `Composition` in `packages/core/src/composition.ts`.

**Workspace resolution:** each package's `exports` has a `"source"` condition that points at `src/*.ts`. TypeScript (`customConditions`), Vite, Vitest and `tsx --conditions=source` all resolve through it. Dev, test and typecheck therefore never need a build. `dist/` is only for publishing.

## Commands

| Command                               | What it does                                                       |
| ------------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                            | Playground at http://localhost:5173                                |
| `pnpm build`                          | tsup builds every package; Vite builds the playground              |
| `pnpm test`                           | Vitest unit tests (all packages, from the root `vitest.config.ts`) |
| `pnpm test:visual`                    | Playwright visual tests (starts the playground automatically)      |
| `pnpm test:visual --update-snapshots` | Regenerate this platform's golden frames                           |
| `pnpm lint`                           | ESLint (incl. the purity rule) + Prettier check                    |
| `pnpm format`                         | Prettier write                                                     |
| `pnpm typecheck`                      | `tsc` for every package and the root configs/tests                 |
| `pnpm check-env`                      | Checks ffmpeg, ffprobe, required encoders and Playwright Chromium  |
| `pnpm render <ex> ...`                | Render an example to a 4K H.264 MP4 (see below)                    |
| `pnpm stills <ex> ...`                | Render chosen frames as 4K PNGs + a contact sheet                  |
| `pnpm test:export`                    | End-to-end export tests (Chromium + ffmpeg)                        |
| `pnpm changeset`                      | Record a version bump for published packages                       |

Don't call the env check `pnpm doctor`: that is a pnpm built-in and shadows the script.

## Environment

- Node **22.18+** (`.nvmrc` = 24). Vitest 5, tsup 9 and Changesets 3 don't run on Node 20.
- pnpm 12 via Corepack (`packageManager` in `package.json`).
- pnpm blocks dependency install scripts unless they are listed under `allowBuilds` in `pnpm-workspace.yaml`. It also refuses releases younger than its minimum release age. Don't add `minimumReleaseAgeExclude` entries; pin the previous release instead.
- TypeScript is pinned to `~6.0`, because typescript-eslint supports `<6.1`. TypeScript 6 defaults `types` to `[]`, so a package that needs Node or Vite types lists them in its own `tsconfig.json`.
- Rendering needs `ffmpeg`/`ffprobe` with the libx264 encoder, plus Playwright's Chromium (`pnpm exec playwright install chromium`). `FFMPEG_PATH`/`FFPROBE_PATH` override the binaries. Run `pnpm check-env` first.

## Adding an example

Create `examples/<name>/` (lowercase kebab-case) with exactly three files:

1. `composition.ts`: `export default defineComposition({ id: '<name>', width, height, fps, duration, background, setup?, render })`. The `id` must equal the folder name.
2. `config.ts`: `export default defineExampleConfig({ stills: [/* key moments in s */], budgetMs })` (import from `../index.js`).
3. `README.md`: one line saying what it shows.

The playground and the export CLI find examples by globbing `examples/*/composition.ts`; there is no registry to update. Spread `exampleDefaults` (size, fps, fonts) and import colours, type (`font('display', 64)`), easings and durations from `theme` in `examples/index.ts`. Never hard-code hex values in an example.

Every example automatically gets three visual tests: golden frames at each of its `stills`, byte-identical frames after scrubbing, and the flash-safety check. After adding or intentionally changing an example, render its stills, **look at them**, then run `pnpm test:visual --update-snapshots` and commit the new goldens. Linux goldens come from the manually triggered **Update goldens** workflow; until they exist, CI skips only the golden comparison (with a message) and still runs the determinism and flash checks.

## Rendering stills and video

Always render **stills first** and look at them before a full render.

```sh
pnpm stills <example>                      # the example's config stills, as 4K PNGs + contact sheet
pnpm stills <example> --at 1.5,4,9.2       # chosen times
pnpm render <example>                      # 4K H.264 MP4 → out/<example>.mp4
pnpm render <example> --from 2 --to 4 --resolution 1080p --crf 12 --audio music.wav
```

Render options: `--out`, `--resolution 4k|1440p|1080p|720p` (default **4k**: fit inside 3840 × 2160), `--scale` (exact factor instead), `--fps`, `--from`/`--to`, `--crf` (0 lossless, **18** default, 23 smaller), `--preset` (x264, default medium), `--tune` (e.g. `animation`), `--audio` (muxed with `-c:v copy`), `--root`. Output under `out/` is git-ignored.

How export works (`packages/export`):

- The CLI starts a Vite server for `apps/playground` and drives `capture.html` (isolated frames) in headless Chromium, with the viewport at the composition's size and `deviceScaleFactor` = output scale. DOM and SVG rasterise natively at 4K, and canvases and shaders render at `scale` × size; nothing is upscaled.
- Each frame is captured as PNG through the DevTools protocol (`optimizeForSpeed`, lossless) and **piped** into ffmpeg; no frames touch the disk.
- Encoding: libx264, 8-bit 4:2:0, the Rec. 709 matrix in limited range (converted through 16 bits with error-diffusion dither, so dark gradients don't band), Rec. 709 tags set with `setparams` (ffmpeg 9 ignores `-color_primaries`/`-color_trc` here), `+faststart`. Output goes to `<out>.partial-<pid>` and is renamed only when ffmpeg exits 0; failures leave nothing behind.
- Colour accuracy: capture is exact (PNG stills match theme hex values); the MP4 is within ±1–2 levels, normal for 8-bit 4:2:0.
- Speed on an M-series Mac at 4K: DOM/SVG/Canvas examples run at 15–30 fps; the WebGL flame at about 3 fps, because headless WebGL runs on SwiftShader (CPU), which is what keeps it deterministic.
- Deferred (see Current scope): segmented or parallel encoding (not needed: x264 already uses every core, and capture is ~10–30 ms a frame), other formats, and the audio synth.

`pnpm test:export` (also run in CI) checks a 4K render with ffprobe (codec, profile, size, pixel format, fps, exact frame count, duration, Rec. 709 tags), that re-renders are frame-identical (`framemd5`), that a `--from/--to` range equals the same frames of a full render (lossless), that audio muxing doesn't touch the video stream, that a failed encode leaves no files, and that WebGL, Remotion, Canvas 3D and DOM examples each export deterministically.

## House rules

- **Tokens, not literals.** Design tokens (colours, type, easing, durations) live in one file per theme. Examples import them and never hard-code hex values.
- **Snap and settle.** Quick entrances on named easing tokens, then dead-still holds long enough to read: at least **1.2 s + 0.25 s per word**.
- **Match, don't fade.** Prefer a shape match or a camera move over a cross-fade between scenes.
- **Look before you claim.** Never say an animation looks right without rendering stills and looking at them.
- **Small examples.** One composition file, one config, one README line per example.
- **Determinism is tested.** Rendering the same frame twice must give byte-identical output. New effects and adapters need a test that proves it.

## Status

- [x] Phase 1: repo setup (workspace, tooling, playground shell, `Composition` contract, `mountStage`, env check, CI)
- [x] Phase 2: core engine (easing, tweens, timeline/BPM, scene graph, camera, morph, RNG/noise, text, theme tokens). Determinism is proven in `packages/core/test/determinism.test.ts` (pinned output) and `tests/visual/determinism.spec.ts` (byte-identical Canvas pixels)
- [x] Phase 3: DOM/SVG/Canvas renderers (pixel parity tested), effects library with 13 examples (goldens, determinism, flash safety each), reduced-motion playback, WCAG flash detector, stage blocks CSS/Web Animations, bundled Inter font, capture page
- [x] Phase 3b: 3D via projection (`spatial/`): slab rotating with zooms, lifted page corner, fly-through past 3D objects; examples `slab-rotate`, `page-curl`, `fly-through`. Also: chroma-weighted OKLCH hue, bundled JetBrains Mono
- [x] Flame: WebGL2 shader layer + `candleFlame` (example `candle-flame`), researched against flame-structure and photographic references
- [x] Phase 4: Remotion adapter, both directions (`HaeComposition`, `remotionCompositionProps`, `fromRemotion`); examples `remotion-title`, `remotion-roundtrip`; capture made order-independent (`isolateFrames`, no tracing)
- [x] Phase 5: export: 4K H.264 MP4 (`pnpm render`), 4K stills + contact sheet (`pnpm stills`), audio mux, Node API, end-to-end tests
- [ ] Phase 6: visual regression goldens, performance budgets
- [ ] Phase 7: starter examples (a Remotion example replaces the Three.js and GSAP ones)
