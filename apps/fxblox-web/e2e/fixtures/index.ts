/**
 * Shared Playwright fixtures: the browser-support escape hatch is set for every page (the smoke suite must also
 * run on a Chromium build that lacks `navigator.bluetooth`, e.g. headless shell), and console errors / page
 * errors are collected so every spec can assert "no console errors". Resource-load failures (`net::ERR_*`, 404s
 * of external hosts) are reported separately as warnings — the shell has no network dependency of its own.
 */
import { test as base, expect } from '@playwright/test';

export { expect };
export * from './seed';
export * from './fakeBlox';

// Browser-reported resource/network failures. Includes the CORS block on `https://discovery.fula.network/relays`
// (the data layer's `refreshRelayCache` at boot): the discovery worker does not allow this origin yet (plan WS5);
// it is an environment condition, not a shell bug, and is surfaced as a test annotation instead of a failure.
const RESOURCE_NOISE = [
  /Failed to load resource/i,
  /net::ERR_/i,
  /ERR_NAME_NOT_RESOLVED/i,
  /ERR_CONNECTION_REFUSED/i,
  /blocked by CORS policy/i,
];

export interface ConsoleCapture {
  errors: string[];
  warnings: string[];
  resourceFailures: string[];
}

export const test = base.extend<{ consoleCapture: ConsoleCapture }>({
  // (Playwright's fixture callback is conventionally named `use`; `provide` keeps eslint's rules-of-hooks quiet.)
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('fx.unsupported.ignore', '1');
      } catch {
        /* ignore */
      }
    });
    await provide(page);
  },
  consoleCapture: async ({ page }, provide) => {
    const capture: ConsoleCapture = { errors: [], warnings: [], resourceFailures: [] };
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        if (RESOURCE_NOISE.some((re) => re.test(text))) capture.resourceFailures.push(text);
        else capture.errors.push(text);
      } else if (msg.type() === 'warning') {
        capture.warnings.push(text);
      }
    });
    page.on('pageerror', (error) => capture.errors.push(`pageerror: ${error.message}`));
    await provide(capture);
    if (capture.resourceFailures.length > 0) {
      const unique = [...new Set(capture.resourceFailures)];
      base.info().annotations.push({ type: 'resource-failures', description: unique.join(' | ') });
    }
  },
});
