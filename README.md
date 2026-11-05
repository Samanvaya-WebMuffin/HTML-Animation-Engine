# HTML Animation Engine

A TypeScript library for HTML motion graphics, animations and effects. It works on its own with plain DOM, SVG and Canvas, and can optionally run inside Remotion. Every animation renders to MP4 with exact, repeatable frames.

Every animation is a **pure function of time**: `render(t)` draws the frame at `t` seconds from scratch. Playback and export call the same function, so what you scrub in the browser is exactly what ends up in the video.

> Status: early development. The workspace, tooling and playground are in place. The engine, effects, adapters and export are being built.

## Requirements

| Tool                | Version                         | Needed for              |
| ------------------- | ------------------------------- | ----------------------- |
| Node.js             | 22.18 or newer (24 in `.nvmrc`) | everything              |
| pnpm                | 12 (via Corepack)               | everything              |
| Playwright Chromium | matches `@playwright/test`      | visual tests, rendering |
| ffmpeg + ffprobe    | 6 or newer, full build          | rendering MP4           |

### Install pnpm

```sh
corepack enable pnpm
# If that fails with a permissions error, install the shim in a user directory on your PATH:
corepack enable --install-directory ~/.local/bin pnpm
```

### Install Playwright's Chromium

```sh
pnpm exec playwright install chromium
# Linux CI or a fresh Linux machine also needs system libraries:
pnpm exec playwright install --with-deps chromium
```

### Install ffmpeg

ffmpeg must include the `libx264` encoder. Homebrew and the usual distro builds include it.

```sh
brew install ffmpeg                 # macOS
sudo apt-get install ffmpeg         # Debian / Ubuntu
winget install Gyan.FFmpeg          # Windows
```

To use a specific build, set `FFMPEG_PATH` and `FFPROBE_PATH`.

### Check your setup

```sh
pnpm install
pnpm check-env    # reports ffmpeg, ffprobe, the H.264 encoder and Chromium, with fixes
```

## Scripts

| Script             | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `pnpm dev`         | Start the playground at http://localhost:5173            |
| `pnpm build`       | Build every package and the playground                   |
| `pnpm test`        | Unit tests (Vitest)                                      |
| `pnpm test:visual` | Visual tests (Playwright)                                |
| `pnpm lint`        | ESLint and Prettier                                      |
| `pnpm typecheck`   | TypeScript across the workspace                          |
| `pnpm render`      | Render an example to MP4 (in progress)                   |
| `pnpm stills`      | Render selected frames and a contact sheet (in progress) |
| `pnpm check-env`   | Check the rendering toolchain                            |

## Visual tests and goldens

`pnpm test:visual` checks every example in headless Chromium:

- its key moments against golden frames (`tests/visual/__goldens__/<platform>/`),
- that frames are byte-identical after scrubbing, and
- that it is flash-safe (WCAG 2.3.1).

Goldens are per platform because operating systems rasterise fonts differently. After an intentional visual change, run `pnpm test:visual --update-snapshots` and commit the result. For Linux (CI), run the **Update goldens** workflow from the Actions tab; it regenerates and commits them.

## Fonts

Examples use [Inter](https://rsms.me/inter/) (SIL Open Font License 1.1), bundled through `@fontsource-variable/inter`, so text measures and wraps the same on every machine.

## Layout

| Path                 | Package                            | Contents                                                   |
| -------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `packages/core`      | `@html-animation-engine/core`      | Timeline, easing, tweens, scene graph, RNG, colour, tokens |
| `packages/renderers` | `@html-animation-engine/renderers` | DOM, SVG and Canvas 2D renderers                           |
| `packages/adapters`  | `@html-animation-engine/adapters`  | `/remotion` (optional peer)                                |
| `packages/export`    | `@html-animation-engine/export`    | `hae` CLI and Node API for capture and encoding            |
| `apps/playground`    | (private)                          | Scrubber, play/pause, frame stepping, fps and resolution   |
| `examples/`          | (private)                          | One folder per animation                                   |

See [CLAUDE.md](CLAUDE.md) for the core rules, how to add an example and the house style.

## Versioning

Published packages are versioned with [Changesets](https://github.com/changesets/changesets): run `pnpm changeset` when a change should be released.
