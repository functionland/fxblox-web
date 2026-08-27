import { describe, expect, it } from 'vitest';
import { parseQrPayload } from '../QRScannerDialog';

describe('parseQrPayload (mobile QRScannerModal semantics)', () => {
  it('accepts JSON with api + endpoint', () => {
    expect(parseQrPayload(JSON.stringify({ api: 'k', endpoint: 'https://e' }))).toEqual({
      ok: true,
      api: 'k',
      endpoint: 'https://e',
    });
  });

  it('reports missing fields vs invalid JSON', () => {
    expect(parseQrPayload(JSON.stringify({ api: 'k' }))).toEqual({
      ok: false,
      error: 'missingFields',
    });
    expect(parseQrPayload('not json')).toEqual({ ok: false, error: 'invalidFormat' });
    expect(parseQrPayload('null')).toEqual({ ok: false, error: 'missingFields' });
  });
});
