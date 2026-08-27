import { describe, expect, test } from 'vitest';
import { TRANSCRIPT_UPLOAD_URL, buildUploadHeaders } from '../uploadTranscriptUrl';

describe('TRANSCRIPT_UPLOAD_URL', () => {
  test('points at the agreed production endpoint', () => {
    expect(TRANSCRIPT_UPLOAD_URL).toBe('https://ai-training.fx.land/transcripts');
  });
  test('is HTTPS', () => {
    expect(TRANSCRIPT_UPLOAD_URL.startsWith('https://')).toBe(true);
  });
  test('does not point at any non-fx.land host', () => {
    expect(new URL(TRANSCRIPT_UPLOAD_URL).hostname.endsWith('.fx.land')).toBe(true);
  });
});

describe('buildUploadHeaders', () => {
  test('includes Content-Type, Accept, anonymizer version', () => {
    const h = buildUploadHeaders('0.1.0');
    expect(h['Content-Type']).toBe('application/json');
    expect(h['Accept']).toBe('application/json');
    expect(h['X-Anonymizer-Version']).toBe('0.1.0');
  });
  test('does not leak auth or device-identifying headers', () => {
    const h = buildUploadHeaders('0.1.0');
    for (const forbidden of ['Authorization', 'Cookie', 'X-Device-Id', 'X-Blox-Id', 'X-User-Id']) {
      expect(h).not.toHaveProperty(forbidden);
    }
  });
  test('header set is exactly the documented three', () => {
    expect(Object.keys(buildUploadHeaders('0.1.0')).sort()).toEqual(['Accept', 'Content-Type', 'X-Anonymizer-Version']);
  });
});
