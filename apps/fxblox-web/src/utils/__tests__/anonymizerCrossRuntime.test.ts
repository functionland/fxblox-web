/**
 * Cross-runtime drift gate (half of a paired test; the other half is
 * fula-ai-training/server/tests/test_intake.py::test_canonical_js_anonymizer_output_is_accepted). The fixture is
 * byte-identical in both repos.
 */
import { describe, expect, test } from 'vitest';
import fixture from './fixtures/canonical_js_anonymizer_output.json';
import { anonymizeTranscript, type RawTranscriptEvent } from '../anonymizeTranscript';

const CANONICAL_UPLOAD_ID = '12345678-90ab-4cde-90ab-1234567890ab';
const CANONICAL_START_TS = '2026-05-23T10:00:00Z';

function canonicalInputEvents(): RawTranscriptEvent[] {
  return [
    { type: 'session_started', ts: CANONICAL_START_TS, payload: {} },
    { type: 'thought', ts: '2026-05-23T10:00:02Z', payload: 'checking discovery; saw peer at 10.0.0.5' },
    { type: 'tool_call', ts: '2026-05-23T10:00:03Z', payload: { tool: 'diag/internet', args: {} } },
    { type: 'tool_result', ts: '2026-05-23T10:00:05Z', payload: { dns_ok: true, https_discovery_ok: false } },
    { type: 'verdict', ts: '2026-05-23T10:00:10Z', payload: { summary: 'discovery unreachable', severity: 'yellow' } },
  ];
}

describe('cross-runtime drift gate', () => {
  test('JS anonymizer output matches the shared fixture byte-for-byte', () => {
    const produced = anonymizeTranscript({
      uploadId: CANONICAL_UPLOAD_ID,
      sessionStartTs: CANONICAL_START_TS,
      events: canonicalInputEvents(),
      rating: -1,
      comment: "didn't fix it; still offline",
    });
    expect(produced).toEqual(fixture);
  });
});
