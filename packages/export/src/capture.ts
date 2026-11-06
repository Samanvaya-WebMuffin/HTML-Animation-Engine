import type { Soundtrack } from '@html-animation-engine/core';
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';

/** What a capture page reports about its composition (see `window.haeCapture`). */
export interface CaptureInfo {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** The composition's own frame rate, and whether export must keep it. */
  readonly nativeFps?: number;
  readonly fixedFps?: boolean;
  readonly duration: number;
  readonly stills: readonly number[];
  readonly background: string;
  readonly seed?: number;
  /** Sound as data; sample URLs are relative to the capture page. */
  readonly audio?: Soundtrack;
}

interface CaptureWindow {
  haeCapture: { ready: Promise<CaptureInfo>; render(t: number): void };
}

export interface CaptureSession {
  readonly info: CaptureInfo;
  /** Device pixels per CSS pixel. */
  readonly scale: number;
  /** Draws frame `t` and returns it as PNG at `scale`. */
  frame(t: number): Promise<Buffer>;
  close(): Promise<void>;
}

export interface CaptureTarget {
  /**
   * URL of a capture page that implements `window.haeCapture` (this repo:
   * the playground's capture.html). `example`, `scale` and `fps` are added
   * as query parameters.
   */
  readonly url: string;
  readonly example: string;
  readonly fps?: number;
}

function captureUrl(target: CaptureTarget, scale: number): string {
  const url = new URL(target.url);
  url.searchParams.set('example', target.example);
  url.searchParams.set('scale', String(scale));
  if (target.fps) url.searchParams.set('fps', String(target.fps));
  return url.toString();
}

/** Loads the page and waits for `haeCapture.ready`, retrying once if a dev-server reload interrupts it. */
async function load(page: Page, url: string): Promise<CaptureInfo> {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url);
      return await page.evaluate(() => (globalThis as unknown as CaptureWindow).haeCapture.ready);
    } catch (error) {
      const reloaded =
        error instanceof Error && /context was destroyed|navigation/i.test(error.message);
      if (!reloaded || attempt >= 2) throw error;
    }
  }
}

/** Reads a composition's size, fps, duration and stills without rendering it. */
export async function probeComposition(
  browser: Browser,
  target: CaptureTarget,
): Promise<CaptureInfo> {
  const page = await browser.newPage();
  try {
    return await load(page, captureUrl(target, 1));
  } finally {
    await page.close();
  }
}

/**
 * Opens a capture page at the composition's exact size with `scale` device
 * pixels per CSS pixel: DOM and SVG rasterise crisply at the output size and
 * canvases render at `scale` × their size. Frames are captured as PNG through
 * the DevTools protocol (fast PNG encoding; lossless).
 */
export async function openCapture(
  browser: Browser,
  target: CaptureTarget,
  info: CaptureInfo,
  scale: number,
): Promise<CaptureSession> {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: info.width, height: info.height },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  const cdp: CDPSession = await context.newCDPSession(page);
  const loaded = await load(page, captureUrl(target, scale));
  return {
    info: loaded,
    scale,
    async frame(t) {
      await page.evaluate(
        (time) => (globalThis as unknown as CaptureWindow).haeCapture.render(time),
        t,
      );
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        optimizeForSpeed: true,
        fromSurface: true,
        captureBeyondViewport: false,
        // The clip is in CSS px; `scale` makes the image device-sized (width × scale).
        clip: { x: 0, y: 0, width: loaded.width, height: loaded.height, scale },
      });
      return Buffer.from(data, 'base64');
    },
    async close() {
      await context.close();
    },
  };
}
