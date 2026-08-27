import { describe, expect, it } from 'vitest';
import {
  MAX_TOKEN_BYTES,
  buildReturnUrl,
  isValidReturnUrlTemplate,
  parseAutoPinParams,
  validateAutoPinParams,
} from '../autopinParams';

const TEMPLATE =
  'https://files.fx.land/autopin-complete#secret=$secret&hardwareId=$hardwareId&bloxPeerId=$bloxPeerId&bloxName=$bloxName';
const LEGACY_TEMPLATE =
  'fxfiles://autopin-complete?secret=$secret&hardwareId=$hardwareId&bloxPeerId=$bloxPeerId&bloxName=$bloxName';

describe('parseAutoPinParams', () => {
  it('reads the fragment first (v1.1 carrier)', () => {
    const p = parseAutoPinParams({
      hash: `#token=jwt.a.b&endpoint=${encodeURIComponent('https://api.cloud.fx.land')}&returnUrl=${encodeURIComponent(TEMPLATE)}`,
      search: '?token=OLD&endpoint=http%3A%2F%2Fold',
    });
    expect(p.source).toBe('fragment');
    expect(p.token).toBe('jwt.a.b');
    expect(p.endpoint).toBe('https://api.cloud.fx.land');
    expect(p.returnUrl).toBe(TEMPLATE);
  });

  it('falls back to the query (v1 carrier) when the fragment carries nothing', () => {
    const p = parseAutoPinParams({
      hash: '#unrelated=1',
      search: '?token=abc&endpoint=https%3A%2F%2Fapi.cloud.fx.land',
    });
    expect(p.source).toBe('query');
    expect(p.token).toBe('abc');
    expect(p.endpoint).toBe('https://api.cloud.fx.land');
    expect(p.returnUrl).toBeUndefined();
  });

  it('returns source none without params and ignores unknown params', () => {
    expect(parseAutoPinParams({ hash: '', search: '' })).toEqual({ source: 'none' });
    expect(parseAutoPinParams({ hash: '#v=2', search: '?foo=bar' })).toEqual({ source: 'none' });
  });
});

describe('validateAutoPinParams', () => {
  const ok = { token: 'jwt', endpoint: 'https://api.cloud.fx.land', returnUrl: TEMPLATE };

  it('accepts a valid v1.1 set (and the legacy fxfiles:// template)', () => {
    expect(validateAutoPinParams({ ...ok, source: 'fragment' })).toEqual({ ok: true });
    expect(validateAutoPinParams({ ...ok, returnUrl: LEGACY_TEMPLATE, source: 'query' })).toEqual({
      ok: true,
    });
    expect(validateAutoPinParams({ token: 'jwt', endpoint: ok.endpoint, source: 'query' })).toEqual(
      {
        ok: true,
      },
    );
  });

  it('rejects missing params, oversized tokens, non-https endpoints and bad templates', () => {
    expect(validateAutoPinParams({ source: 'none' })).toEqual({
      ok: false,
      error: 'missingParams',
    });
    expect(validateAutoPinParams({ ...ok, token: undefined, source: 'query' })).toEqual({
      ok: false,
      error: 'invalidToken',
    });
    expect(
      validateAutoPinParams({ ...ok, token: 'x'.repeat(MAX_TOKEN_BYTES + 1), source: 'query' }),
    ).toEqual({ ok: false, error: 'invalidToken' });
    expect(
      validateAutoPinParams({ ...ok, endpoint: 'http://api.cloud.fx.land', source: 'query' }),
    ).toEqual({
      ok: false,
      error: 'invalidEndpoint',
    });
    expect(validateAutoPinParams({ ...ok, endpoint: 'not a url', source: 'query' })).toEqual({
      ok: false,
      error: 'invalidEndpoint',
    });
    expect(
      validateAutoPinParams({
        ...ok,
        returnUrl: 'https://files.fx.land/x#secret=$secret',
        source: 'query',
      }),
    ).toEqual({ ok: false, error: 'invalidReturnUrl' });
    expect(
      validateAutoPinParams({
        ...ok,
        returnUrl: TEMPLATE.replace('https:', 'javascript:'),
        source: 'query',
      }),
    ).toEqual({ ok: false, error: 'invalidReturnUrl' });
  });

  it('accepts a once-URL-encoded template (mobile decoded the value a second time)', () => {
    expect(isValidReturnUrlTemplate(encodeURIComponent(TEMPLATE))).toBe(true);
  });
});

describe('buildReturnUrl', () => {
  const values = {
    secret: 'sec/ret+1&2',
    hardwareId: 'hw 01',
    bloxPeerId: '12D3KooWPeer',
    bloxName: 'Living Room Blox',
  };

  it('substitutes every placeholder with encodeURIComponent values', () => {
    expect(buildReturnUrl(TEMPLATE, values)).toBe(
      'https://files.fx.land/autopin-complete#secret=sec%2Fret%2B1%262&hardwareId=hw%2001&bloxPeerId=12D3KooWPeer&bloxName=Living%20Room%20Blox',
    );
  });

  it('decodes a URL-encoded template first and treats $ in values literally', () => {
    const out = buildReturnUrl(encodeURIComponent(LEGACY_TEMPLATE), { ...values, secret: '$&$1' });
    expect(out).toBe(
      'fxfiles://autopin-complete?secret=%24%26%241&hardwareId=hw%2001&bloxPeerId=12D3KooWPeer&bloxName=Living%20Room%20Blox',
    );
  });

  it('replaces empty hardwareId / bloxPeerId with empty strings (mobile `|| ""`)', () => {
    expect(buildReturnUrl(TEMPLATE, { ...values, hardwareId: '', bloxPeerId: '' })).toBe(
      'https://files.fx.land/autopin-complete#secret=sec%2Fret%2B1%262&hardwareId=&bloxPeerId=&bloxName=Living%20Room%20Blox',
    );
  });
});
