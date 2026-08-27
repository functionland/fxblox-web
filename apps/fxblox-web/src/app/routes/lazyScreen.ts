import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

export type ScreenModule = { default: ComponentType };

/**
 * `lazy` route factory for screen modules with a default export. react-router's `lazy` expects route props
 * (`Component`, …), not a default export, hence the adapter. Each screen is its own chunk.
 */
export const lazyScreen =
  (load: () => Promise<ScreenModule>): NonNullable<RouteObject['lazy']> =>
  async () => {
    const mod = await load();
    return { Component: mod.default };
  };
