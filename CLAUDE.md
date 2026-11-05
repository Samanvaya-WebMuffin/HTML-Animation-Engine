# CLAUDE.md

HTML-Animation-Engine is a TypeScript library for HTML motion graphics. It works on its own (DOM, SVG, Canvas 2D) and can optionally run inside Remotion. Every animation renders to MP4 with exact, repeatable frames.

## Current scope

We are deliberately keeping this small. **In scope:** the core engine, DOM/SVG/Canvas renderers and effects, **one adapter (Remotion)**, and **one export format (MP4, H.264)**, plus PNG stills for checking frames.

**Deferred; don't build these unless asked:** GSAP, Three.js and Framer Motion adapters; WebM, ProRes, GIF, APNG, PNG-sequence, H.265 and HTML-embed export; segmented and parallel encoding; the audio synth helper. The architecture should still allow them: adapters are separate subpath exports with optional peer dependencies, and the encoder is one module behind the capture loop.

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
packages/adapters    one subpath export per library; currently only ./remotion
                     (each library is an OPTIONAL peer dependency; never a hard dependency)
packages/export      Node CLI (`hae`) + API: Playwright capture, ffmpeg encode, environment check
apps/playground      Vite app: example list, scrubber, play/pause, frame step, fps, resolution,
                     reduced motion. capture.html = one example at exact size (for headless capture)
examples/<name>/     one folder per animation (see "Adding an example")
tests/unit           repo-wide unit tests (e.g. the purity lint rule)
tests/visual         Playwright tests; goldens in tests/visual/__goldens__/<platform>/
```

### Core engine (`packages/core/src`)

| Module              | What it gives you                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `composition.ts`    | `Composition`, `defineComposition`, frame/time conversion, `compositionSeed`                                       |
| `easing/`           | `cubicBezier` (Newton + bisection fallback), closed-form `spring` (`.duration` = settle time), CSS `steps`         |
| `tween.ts`          | `progress(t, start, duration, ease)`, `keyframes`, `staggerProgress`, `lerpRect`, `holdFor(text)`                  |
| `color/`            | CSS colour parsing, OKLCH conversion with gamut mapping, `mixColors` (OKLCH, shortest hue arc)                     |
| `timeline/`         | `timeline([...])` from `clip`/`gap`/`label`/`seq`/`par`/`stagger`, `at(label, offset)`; `tempo({ bpm })` beat grid |
| `geometry/`         | matrices, SVG path parse/flatten/length, `rect`/`pill`/`circle`/`pathGeometry`, **`morph`**                        |
| `scene/`            | scene nodes (group/shape/text), camera, `flattenScene` → paint-ordered draw list                                   |
| `random/`           | stateless `random(seed, ...keys)`, seeded `createRng`, seeded simplex `createNoise` (with seamless `loop`)         |
| `text/`             | `registerFontFaces`, `loadFonts`, `createCanvasMeasurer`, `layoutText`, `baselineOffset`                           |
| `safety/`           | `createFlashDetector`: WCAG 2.3.1 flash analysis on RGBA frames                                                    |
| `themes/default.ts` | **the** token file: colours, type, easing (`enter`, `exit`, `snap`, `camera`, `wipe`), durations                   |

Conventions the code relies on:

- **Units:** seconds for time, px for space, **degrees** for rotation (clockwise on screen, y down).
- **Rects are centred:** `rect(x, y, w, h, radius)` and `Rect.x/y` are the **centre**, so scaling and morphs stay centred. Pills and circles are rects with a large radius, which is why rect → pill → circle interpolates exactly.
- **Eases belong to the arriving key** in `keyframes` and `morph`: `{ at: 2, ..., ease }` eases the segment that ends at t = 2.
- **Timeline placement:** items in a `seq` follow the cursor. An item placed with `{ at }` is absolute and does **not** move the cursor. Labels must be defined before they are referenced.
- **Randomness in `render`:** use `random(ctx.seed, 'name', i)` (stateless), or create `createRng(ctx.seed)` **inside** `render`/`setup`. Never keep an RNG at module scope.
- **Scenes are rebuilt every frame** as plain data: `render(t)` builds a `Scene` and a renderer draws `flattenScene(scene)`. Node `id`s must be unique; renderers use them to reuse elements.
- **Morph shapes must be single closed contours** (multi-contour paths throw). Outline matching happens when `morph()` is called, so call it once in setup or at module scope, not per frame.
- **Text:** declare `fontFaces` (font files) and `fonts` (specs to load) on the composition; the stage registers and loads them before `setup`, then measure with `createCanvasMeasurer()`. Examples get both from `exampleDefaults`; the bundled font is Inter (`examples/fonts.ts`). Never rely on system fonts: line breaks would differ between machines.

### Renderers and effects (`packages/renderers/src`)

Write examples with **`defineSceneComposition({ renderer: 'canvas' | 'svg' | 'dom', setup?, scene(t, ctx, state) })`**. `setup` runs once after fonts load (create effects and measurers there) and its return value is passed to every `scene` call. `scene` returns `{ camera?, world, screen? }`.

The three renderers draw the same `flattenScene` output and are tested for pixel parity (`tests/visual/renderers.spec.ts`). Rules they share; keep them when changing any renderer:

- **Text** is laid out once by core `layoutText` (identical line breaks), and the baseline is placed with `baselineOffset` (CSS half-leading model). Letter spacing is applied after every character.
- **Opacity is per primitive** (fill, stroke, shadow, each text line), as in Canvas, not group opacity.
- **Shadows** are an offset copy of the shape in local coordinates; `blur` is a Gaussian with σ = blur / 2 (Canvas `filter`, SVG `feGaussianBlur` in sRGB, CSS `blur()`).
- **Canvas** paints the composition background into the bitmap; DOM/SVG rely on the stage background.
- **DOM:** rects are `div`s (a centred stroke is a border on an enlarged box), paths and dashed strokes are inline SVG, clips are nested wrappers with `clip-path: path()`.

Effects are **factories** that do their expensive work once and return `(t) => SceneNode` (or a camera): `highlighterWipe`, `maskReveal`, `circleReveal`, `typeOn`, `counterRoll`, `marquee`, `particleBurst`, `confetti`, `dotGrid`, `nodeGraph`, `shapeMorph`, `pathDraw`, `staggerGrid`, `landingShadow`, `pushIn`, `pullBack`, `cameraPath`. Looping effects wrap `t` into their loop first, so `f(loopDuration)` equals `f(0)` exactly.

The **stage** (`mountStage`) blocks CSS transitions and animations inside it, cancels Web Animations and pauses SMIL after every frame (with a console warning), and passes `ctx.reducedMotion`.

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
| `pnpm render <ex> ...`                | Render an example to video/images (**not implemented yet**)        |
| `pnpm stills <ex> ...`                | Render chosen frames + a contact sheet (**not implemented yet**)   |
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
pnpm stills <example> --at 1.5,4,9.2     # requested frames + contact sheet
pnpm render <example> --fps 60 --scale 2  # full render to MP4 (H.264)
```

Both commands currently exit with "not implemented yet"; capture and encoding are still to come. Planned options: `--fps --scale --from --to --crf --audio <file>`. Capture loads the composition in headless Chromium at the exact output size, waits for `document.fonts.ready`, then renders and captures frame by frame (reading Canvas/WebGL pixels directly). Frames are piped into ffmpeg, never written to disk as thousands of PNGs. The MP4 is written to a temporary name and renamed only when ffmpeg exits successfully.

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
- [ ] Phase 4: Remotion adapter (both directions)
- [ ] Phase 5: export (capture, MP4 encode, stills + contact sheet)
- [ ] Phase 6: visual regression goldens, performance budgets
- [ ] Phase 7: starter examples (a Remotion example replaces the Three.js and GSAP ones)
