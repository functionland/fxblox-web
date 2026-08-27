/**
 * Local E2E (Chromium only — decision D5). `npx playwright test` from apps/fxblox-web.
 *
 *   default   builds the app and serves `dist` with `vite preview` on :4173 (production HTML/CSP, service worker on)
 *   E2E_DEV=1 serves `vite dev` instead (fast iteration; the dev-only CSP relaxation applies)
 *
 * `global-setup.ts` starts tools/fake-blox (WAP :3500, Blox AI :8083, RPC :8545) and the app is built with
 * VITE_BLOX_AP_URL=http://127.0.0.1:3500 so LAN calls hit it.
 */
import { defineConfig, devices } from '@playwright/test';

export const PORT = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${PORT}`;
const useDev = process.env.E2E_DEV === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  globalSetup: './e2e/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'android-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: useDev
      ? `npx vite dev --port ${PORT} --strictPort --host 127.0.0.1`
      : `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ...process.env,
      VITE_BLOX_AP_URL: 'http://127.0.0.1:3500',
      VITE_ENABLE_GALLERY: 'true',
      VITE_ENABLE_BLOX_LOGS: 'true',
    },
  },
});
