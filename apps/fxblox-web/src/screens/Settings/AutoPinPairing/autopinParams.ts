/**
 * Auto-pin hand-off parameters (docs/AUTOPIN-HANDOFF.md v1.1). The web receiver reads the URL FRAGMENT first
 * (`#token=…&endpoint=…&returnUrl=…` — the cloud JWT is a bearer credential and must never reach a server /
 * CDN / Referer) and falls back to the v1 query form. Pure functions — unit-tested without the DOM.
 */

export const MAX_TOKEN_BYTES = 8 * 1024;
export const RETURN_URL_PLACEHOLDERS = [
  '$secret',
  '$hardwareId',
  '$bloxPeerId',
  '$bloxName',
] as const;
export const RETURN_URL_SCHEMES = ['https:', 'fxfiles:'] as const;

export type AutoPinParamSource = 'fragment' | 'query' | 'none';

export interface AutoPinParams {
  token?: string;
  endpoint?: string;
  returnUrl?: string;
  source: AutoPinParamSource;
}

export type AutoPinParamError =
  'missingParams' | 'invalidToken' | 'invalidEndpoint' | 'invalidReturnUrl';

export type AutoPinValidation = { ok: true } | { ok: false; error: AutoPinParamError };

function read(search: URLSearchParams): Omit<AutoPinParams, 'source'> {
  const pick = (key: string): string | undefined => {
    const v = search.get(key);
    return v === null || v === '' ? undefined : v;
  };
  return { token: pick('token'), endpoint: pick('endpoint'), returnUrl: pick('returnUrl') };
}

/** Fragment first (v1.1), query as the fallback (v1). Unknown params are ignored (spec: receivers must). */
export function parseAutoPinParams(location: { hash?: string; search?: string }): AutoPinParams {
  const hash = (location.hash ?? '').replace(/^#/, '');
  if (hash) {
    const fromHash = read(new URLSearchParams(hash));
    if (fromHash.token || fromHash.endpoint || fromHash.returnUrl) {
      return { ...fromHash, source: 'fragment' };
    }
  }
  const search = (location.search ?? '').replace(/^\?/, '');
  if (search) {
    const fromQuery = read(new URLSearchParams(search));
    if (fromQuery.token || fromQuery.endpoint || fromQuery.returnUrl) {
      return { ...fromQuery, source: 'query' };
    }
  }
  return { source: 'none' };
}

/** Mobile decoded `returnUrl` once more after the linking layer; keep that, tolerating malformed input. */
export function decodeReturnUrlTemplate(returnUrl: string): string {
  try {
    return decodeURIComponent(returnUrl);
  } catch {
    return returnUrl;
  }
}

function byteLength(s: string): number {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length;
}

export function isValidToken(token: string | undefined): token is string {
  return typeof token === 'string' && token.length > 0 && byteLength(token) <= MAX_TOKEN_BYTES;
}

export function isValidEndpoint(endpoint: string | undefined): endpoint is string {
  if (!endpoint) return false;
  try {
    return new URL(endpoint).protocol === 'https:';
  } catch {
    return false;
  }
}

/** `https:` (files.fx.land) or `fxfiles:` template containing all four placeholders. */
export function isValidReturnUrlTemplate(returnUrl: string | undefined): returnUrl is string {
  if (!returnUrl) return false;
  const template = decodeReturnUrlTemplate(returnUrl);
  let protocol: string;
  try {
    protocol = new URL(template).protocol;
  } catch {
    return false;
  }
  if (!(RETURN_URL_SCHEMES as readonly string[]).includes(protocol)) return false;
  return RETURN_URL_PLACEHOLDERS.every((p) => template.includes(p));
}

/**
 * Validates the deep-link params before acting. `returnUrl` is optional (mobile parity — without it the
 * screen only shows the result), but when present it must be a valid template.
 */
export function validateAutoPinParams(params: AutoPinParams): AutoPinValidation {
  if (!params.token && !params.endpoint) return { ok: false, error: 'missingParams' };
  if (!isValidToken(params.token)) return { ok: false, error: 'invalidToken' };
  if (!isValidEndpoint(params.endpoint)) return { ok: false, error: 'invalidEndpoint' };
  if (params.returnUrl !== undefined && !isValidReturnUrlTemplate(params.returnUrl)) {
    return { ok: false, error: 'invalidReturnUrl' };
  }
  return { ok: true };
}

export interface ReturnValues {
  secret: string;
  hardwareId: string;
  bloxPeerId: string;
  bloxName: string;
}

/**
 * Substitutes the four placeholders with `encodeURIComponent` values (mobile
 * `AutoPinPairing.screen.tsx` semantics; every occurrence is replaced, and the replacement is a function so
 * `$`-patterns in values can never be interpreted by `String.replace`).
 */
export function buildReturnUrl(returnUrl: string, values: ReturnValues): string {
  const template = decodeReturnUrlTemplate(returnUrl);
  const encoded: Record<(typeof RETURN_URL_PLACEHOLDERS)[number], string> = {
    $secret: encodeURIComponent(values.secret),
    $hardwareId: encodeURIComponent(values.hardwareId || ''),
    $bloxPeerId: encodeURIComponent(values.bloxPeerId || ''),
    $bloxName: encodeURIComponent(values.bloxName),
  };
  let out = template;
  for (const placeholder of RETURN_URL_PLACEHOLDERS) {
    out = out.split(placeholder).join(encoded[placeholder]);
  }
  return out;
}
