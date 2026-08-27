// Vitest environment: jsdom, plus Node's own AbortController/AbortSignal kept reachable.
//
// jsdom replaces the abort globals with its own classes while `fetch`/`Request`/`Response` stay Node's (undici).
// undici's `new Request(url, { signal })` then throws "Expected signal to be an instance of AbortSignal" — and
// react-router's data routers construct exactly that on every navigation. The classes are stashed on
// `globalThis.__nodeAbort`; `src/test/setup.ts` installs a `Request` wrapper that bridges a jsdom signal to a
// native one. Plain .mjs because Vitest imports environment modules with Node's loader (no TS transform).
import { builtinEnvironments } from 'vitest/environments';

/** @type {import('vitest/environments').Environment} */
const env = {
  name: 'jsdom-native-fetch',
  transformMode: 'web',
  async setup(global, options) {
    const nodeAbort = { AbortController: global.AbortController, AbortSignal: global.AbortSignal };
    const inner = await builtinEnvironments.jsdom.setup(global, options);
    Object.defineProperty(global, '__nodeAbort', {
      value: nodeAbort,
      configurable: true,
      enumerable: false,
      writable: true,
    });
    return inner;
  },
};

export default env;
