/**
 * Smoke: every route in the plan's route table loads (stub or shell), with no console errors, on both projects.
 * Paired routes seed the stores through IndexedDB (`gotoPaired`); unpaired behaviour (redirects + deep-link stash)
 * runs in a fresh context.
 */
import { test, expect, gotoPaired, type ConsoleCapture } from './fixtures';

const SETUP_ROUTES = [
  '/setup/welcome',
  '/setup/requirements',
  '/setup/link-password',
  '/setup/connect-blox',
  '/setup/connect-existing',
  '/setup/set-authorizer?manual=1&ip=10.0.0.2&port=3500&peerId=12D3KooWpeer',
  '/setup/connect-wifi',
  '/setup/check-connection?ssid=HomeNet',
  '/setup/complete?manual=1',
  '/setup/bluetooth',
];

const APP_ROUTES = [
  '/blox',
  '/blox/manage',
  '/users',
  '/plugins',
  '/plugins/blox-ai',
  '/blox-ai?scenario=disconnected',
  '/devices',
  '/settings',
  '/settings/blox-status-monitor',
  '/settings/mode',
  '/settings/chain',
  '/settings/pools',
  '/settings/pools/1',
  '/settings/pools/1/join-requests',
  '/settings/dapps',
  '/settings/autopin',
  '/settings/bluetooth',
  '/settings/logs',
  '/settings/about',
  '/connectdapp/FxFiles/land.fx.files/12D3KooWpeer/fxfiles%3A%2F%2Freturn/0xabc',
  '/autopin-pair?token=t0k&endpoint=https%3A%2F%2Fexample.test&returnUrl=https%3A%2F%2Fexample.test%2Fback',
];

function assertClean(capture: ConsoleCapture, allow: RegExp[] = []) {
  const errors = capture.errors.filter((e) => !allow.some((re) => re.test(e)));
  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
}

// fx-ui's gallery avatar demo loads `https://avatars.githubusercontent.com/...`, which the production CSP `img-src`
// does not allow (open item for packages/fx-ui: use a local/data: asset). The gallery is DEV-only; the CSP is not
// loosened for it.
const GALLERY_KNOWN = [/avatars\.githubusercontent\.com.*Content Security Policy/];

test.describe('setup routes (unpaired)', () => {
  for (const route of SETUP_ROUTES) {
    test(`loads ${route}`, async ({ page, consoleCapture }) => {
      await page.goto(route);
      await expect(page.locator('[data-testid="setup-shell"]')).toBeVisible();
      await expect(page.locator('[data-screen]').first()).toBeVisible();
      await expect(page).toHaveTitle(/FxBlox/);
      assertClean(consoleCapture);
    });
  }

  test('progress bar follows the route handle', async ({ page }) => {
    await page.goto('/setup/welcome');
    await expect(page.locator('[data-screen="setup-welcome"]')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await page.goto('/setup/connect-wifi');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
  });

  test('stub flow walks Welcome → Requirements via the sticky footer', async ({ page }) => {
    await page.goto('/setup/welcome');
    await page.getByTestId('setup-continue').click();
    await expect(page).toHaveURL(/\/setup\/requirements$/);
    await expect(page.locator('[data-screen="setup-requirements"]')).toBeVisible();
  });
});

test.describe('guards (unpaired)', () => {
  test('/ redirects to /setup/welcome', async ({ page, consoleCapture }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup\/welcome$/);
    assertClean(consoleCapture);
  });

  test('app routes redirect to setup without stashing', async ({ page }) => {
    await page.goto('/settings/about');
    await expect(page).toHaveURL(/\/setup\/welcome$/);
    await expect(page.getByTestId('deep-link-banner')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('fx.deepLinkStash.v1'))).toBeNull();
  });

  test('a deep link is stashed and the SetupShell shows the FxFiles banner', async ({
    page,
    consoleCapture,
  }) => {
    await page.goto('/autopin-pair?token=abc&endpoint=x');
    await expect(page).toHaveURL(/\/setup\/welcome$/);
    await expect(page.getByTestId('deep-link-banner')).toBeVisible();
    const stashed = await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem('fx.deepLinkStash.v1') ?? 'null') as {
          url: string;
        } | null,
    );
    expect(stashed?.url).toBe('/autopin-pair?token=abc&endpoint=x');
    // Navigating inside setup keeps the stash (only SetupComplete "Home" consumes it).
    await page.goto('/setup/link-password');
    await expect(page.getByTestId('deep-link-banner')).toBeVisible();
    assertClean(consoleCapture);
  });

  test('unknown routes render NotFound', async ({ page, consoleCapture }) => {
    await page.goto('/definitely-not-a-route');
    await expect(page.locator('[data-screen="not-found"]')).toBeVisible();
    assertClean(consoleCapture);
  });
});

test.describe('app routes (paired)', () => {
  for (const route of APP_ROUTES) {
    test(`loads ${route}`, async ({ page, consoleCapture }) => {
      await gotoPaired(page, route);
      await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
      await expect(page.locator('[data-screen]').first()).toBeVisible();
      await expect(page).toHaveTitle(/FxBlox/);
      assertClean(consoleCapture);
    });
  }

  test('direct deep-load of /settings/pools/1 shows the pool id', async ({
    page,
    consoleCapture,
  }) => {
    await gotoPaired(page, '/settings/pools/1');
    await expect(page.locator('[data-param="poolId"]')).toHaveText('1');
    assertClean(consoleCapture);
  });

  test('/ redirects to /blox and the responsive shell matches the viewport', async ({
    page,
  }, testInfo) => {
    await gotoPaired(page, '/');
    await expect(page).toHaveURL(/\/blox$/);
    // Tailwind tripwire: the app's own classes must be compiled (bg-background-app in dark = #212529).
    await expect(page.getByTestId('app-shell')).toHaveCSS('background-color', 'rgb(33, 37, 41)');
    if (testInfo.project.name === 'desktop-chromium') {
      await expect(page.getByTestId('sidebar')).toBeVisible();
      await expect(page.getByTestId('top-bar')).toBeVisible();
      await expect(page.getByTestId('bottom-tabs')).toBeHidden();
      await expect(page.getByTestId('mobile-header')).toBeHidden();
    } else {
      await expect(page.getByTestId('bottom-tabs')).toBeVisible();
      await expect(page.getByTestId('mobile-header')).toBeVisible();
      await expect(page.getByTestId('sidebar')).toBeHidden();
      await expect(page.getByTestId('top-bar')).toBeHidden();
    }
  });

  test('primary navigation marks the active tab and moves focus to main', async ({
    page,
  }, testInfo) => {
    await gotoPaired(page, '/blox');
    const nav =
      testInfo.project.name === 'desktop-chromium'
        ? page.getByTestId('sidebar')
        : page.getByTestId('bottom-tabs');
    await expect(nav.locator('[data-tab="blox"]')).toHaveAttribute('aria-current', 'page');
    await nav.locator('[data-tab="devices"]').click();
    await expect(page).toHaveURL(/\/devices$/);
    await expect(nav.locator('[data-tab="devices"]')).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('[data-tab="blox"]')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main#main')).toBeFocused();
  });

  test('/blox-ai consumes ?scenario once', async ({ page }) => {
    await gotoPaired(page, '/blox-ai?scenario=disconnected');
    await expect(page.locator('[data-param="prefillScenario"]')).toHaveText('disconnected');
    await expect(page).toHaveURL(/\/blox-ai$/);
  });

  test('/settings/blox-discovery redirects into setup', async ({ page }) => {
    await gotoPaired(page, '/settings/blox-discovery');
    await expect(page).toHaveURL(/\/setup\/connect-existing$/);
    await expect(page.getByTestId('back-to-app')).toBeVisible();
  });

  test('/gallery renders the fx-ui gallery', async ({ page, consoleCapture }) => {
    await gotoPaired(page, '/gallery');
    await expect(page.locator('[data-screen="gallery"]')).toBeVisible();
    assertClean(consoleCapture, GALLERY_KNOWN);
  });
});
