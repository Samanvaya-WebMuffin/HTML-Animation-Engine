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
packages/renderers   DOM / SVG / Canvas 2D renderers; mountStage() mounts a composition at exact size.
packages/adapters    one subpath export per library; currently only ./remotion
                     (each library is an OPTIONAL peer dependency; never a hard dependency)
packages/export      Node CLI (`hae`) + API: Playwright capture, ffmpeg encode, environment check
apps/playground      Vite app: example list, scrubber, play/pause, frame step, fps + resolution
examples/<name>/     one folder per animation (see "Adding an example")
tests/unit           repo-wide unit tests (e.g. the purity lint rule)
tests/visual         Playwright tests; goldens in tests/visual/__goldens__
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
| `text/`             | `loadFonts`, `createCanvasMeasurer`, `layoutText` (lines + words for stagger)                                      |
| `themes/default.ts` | **the** token file: colours, type, easing (`enter`, `exit`, `snap`, `camera`, `wipe`), durations                   |

Conventions the code relies on:

- **Units:** seconds for time, px for space, **degrees** for rotation (clockwise on screen, y down).
- **Rects are centred:** `rect(x, y, w, h, radius)` and `Rect.x/y` are the **centre**, so scaling and morphs stay centred. Pills and circles are rects with a large radius, which is why rect → pill → circle interpolates exactly.
- **Eases belong to the arriving key** in `keyframes` and `morph`: `{ at: 2, ..., ease }` eases the segment that ends at t = 2.
- **Timeline placement:** items in a `seq` follow the cursor. An item placed with `{ at }` is absolute and does **not** move the cursor. Labels must be defined before they are referenced.
- **Randomness in `render`:** use `random(ctx.seed, 'name', i)` (stateless), or create `createRng(ctx.seed)` **inside** `render`/`setup`. Never keep an RNG at module scope.
- **Scenes are rebuilt every frame** as plain data: `render(t)` builds a `Scene` and a renderer draws `flattenScene(scene)`. Node `id`s must be unique; renderers use them to reuse elements.
- **Morph shapes must be single closed contours** (multi-contour paths throw). Outline matching happens when `morph()` is called, so call it once in setup or at module scope, not per frame.
- **Text:** declare `fonts` on the composition so the stage loads them before `setup`, then measure with `createCanvasMeasurer()`. Renderers must apply `letterSpacing` exactly as the measurer does (after every character), or word gaps shrink.

Package names are `@html-animation-engine/<name>`. The composition contract is `Composition` in `packages/core/src/composition.ts`.

**Workspace resolution:** each package's `exports` has a `"source"` condition that points at `src/*.ts`. TypeScript (`customConditions`), Vite, Vitest and `tsx --conditions=source` all resolve through it. Dev, test and typecheck therefore never need a build. `dist/` is only for publishing.

## Commands

| Command                | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `pnpm dev`             | Playground at http://localhost:5173                                |
| `pnpm build`           | tsup builds every package; Vite builds the playground              |
| `pnpm test`            | Vitest unit tests (all packages, from the root `vitest.config.ts`) |
| `pnpm test:visual`     | Playwright visual tests (starts the playground automatically)      |
| `pnpm lint`            | ESLint (incl. the purity rule) + Prettier check                    |
| `pnpm format`          | Prettier write                                                     |
| `pnpm typecheck`       | `tsc` for every package and the root configs/tests                 |
| `pnpm check-env`       | Checks ffmpeg, ffprobe, required encoders and Playwright Chromium  |
| `pnpm render <ex> ...` | Render an example to video/images (**not implemented yet**)        |
| `pnpm stills <ex> ...` | Render chosen frames + a contact sheet (**not implemented yet**)   |
| `pnpm changeset`       | Record a version bump for published packages                       |

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

The playground and the export CLI find examples by globbing `examples/*/composition.ts`; there is no registry to update. Import colours, type, easings and durations from the theme tokens. Never hard-code hex values in an example.

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
- [ ] Phase 3: renderers and effects, reduced-motion mode, flash-safety check; `mountStage` disables CSS transitions/animations and Web Animations inside the stage
- [ ] Phase 4: Remotion adapter (both directions)
- [ ] Phase 5: export (capture, MP4 encode, stills + contact sheet)
- [ ] Phase 6: visual regression goldens, performance budgets
- [ ] Phase 7: starter examples (a Remotion example replaces the Three.js and GSAP ones)
