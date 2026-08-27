import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router';
import { Routes } from '@/navigation/routes';
import {
  DEAD_ROUTES,
  DEAD_ROUTE_PATH,
  ROUTE_NAME_TO_PATH,
  paths,
  slugify,
  withQuery,
} from '@/app/paths';
import { buildAppRoutes } from '@/app/routes/appRoutes';

const sample = (pattern: string) =>
  pattern
    .replace(/:poolId/g, '42')
    .replace(/:name/g, 'blox-ai')
    .replace(/:id/g, 'button');

describe('ROUTE_NAME_TO_PATH', () => {
  it('maps every mobile Routes value', () => {
    for (const route of Object.values(Routes)) {
      expect(typeof ROUTE_NAME_TO_PATH[route], `missing ${route}`).toBe('string');
    }
    expect(Object.keys(ROUTE_NAME_TO_PATH).sort()).toEqual(Object.values(Routes).sort());
  });

  it('documents exactly Hub / HubTab / root Plugin as dead routes', () => {
    expect([...DEAD_ROUTES].sort()).toEqual([Routes.Hub, Routes.HubTab, Routes.Plugin].sort());
    for (const dead of DEAD_ROUTES) expect(ROUTE_NAME_TO_PATH[dead]).toBe(DEAD_ROUTE_PATH);
  });

  it('every live route is an absolute, non-root path', () => {
    for (const route of Object.values(Routes)) {
      if (DEAD_ROUTES.has(route)) continue;
      const path = ROUTE_NAME_TO_PATH[route];
      expect(path.startsWith('/'), `${route} → ${path}`).toBe(true);
      expect(path, `${route} must not map to /`).not.toBe('/');
    }
  });

  it('spaced mobile names map to the plan slugs', () => {
    expect(ROUTE_NAME_TO_PATH[Routes.LinkPassword]).toBe('/setup/link-password');
    expect(ROUTE_NAME_TO_PATH[Routes.ConnectToWallet]).toBe('/setup/requirements');
    expect(ROUTE_NAME_TO_PATH[Routes.ConnectToBlox]).toBe('/setup/connect-blox');
    expect(ROUTE_NAME_TO_PATH[Routes.ConnectToExistingBlox]).toBe('/setup/connect-existing');
    expect(ROUTE_NAME_TO_PATH[Routes.SetBloxAuthorizer]).toBe('/setup/set-authorizer');
    expect(ROUTE_NAME_TO_PATH[Routes.ConnectToWifi]).toBe('/setup/connect-wifi');
    expect(ROUTE_NAME_TO_PATH[Routes.CheckConnection]).toBe('/setup/check-connection');
    expect(ROUTE_NAME_TO_PATH[Routes.SetupComplete]).toBe('/setup/complete');
    expect(ROUTE_NAME_TO_PATH[Routes.ComponentGallery]).toBe('/gallery');
    expect(ROUTE_NAME_TO_PATH[Routes.ButtonGroups]).toBe(`/gallery/${slugify('Button Groups')}`);
    expect(slugify('Usage Bar')).toBe('usage-bar');
  });

  it('every live path is served by the router manifests (not the catch-all)', () => {
    const routes = buildAppRoutes({ gallery: true, bloxLogs: true });
    for (const route of Object.values(Routes)) {
      if (DEAD_ROUTES.has(route)) continue;
      const path = sample(ROUTE_NAME_TO_PATH[route]);
      const matches = matchRoutes(routes, path);
      expect(matches, `no match for ${route} (${path})`).not.toBeNull();
      const leaf = matches![matches!.length - 1]!;
      expect(leaf.route.path, `${route} (${path}) fell through to the catch-all`).not.toBe('*');
    }
  });

  it('builders encode params and queries', () => {
    expect(paths.plugin('my plugin')).toBe('/plugins/my%20plugin');
    expect(paths.settings.joinRequests(7)).toBe('/settings/pools/7/join-requests');
    expect(
      paths.setup.setAuthorizer({ manual: true, ip: '10.0.0.2', port: 3500, peerId: 'p' }),
    ).toBe('/setup/set-authorizer?manual=1&ip=10.0.0.2&port=3500&peerId=p');
    expect(paths.setup.checkConnection({ ssid: 'Home Net' })).toBe(
      '/setup/check-connection?ssid=Home+Net',
    );
    expect(paths.bloxAi({ scenario: 'disconnected' })).toBe('/blox-ai?scenario=disconnected');
    expect(paths.bloxAi()).toBe('/blox-ai');
    expect(withQuery('/x', { a: false, b: undefined, c: null })).toBe('/x');
    expect(
      paths.connectDApp({
        appName: 'FxFiles',
        bundleId: 'land.fx',
        peerId: 'p',
        returnDeepLink: 'fxfiles://r',
        accountId: '0x1',
      }),
    ).toBe('/connectdapp/FxFiles/land.fx/p/fxfiles%3A%2F%2Fr/0x1');
  });
});
