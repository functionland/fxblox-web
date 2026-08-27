/**
 * Diagnostics "Send to Support" upload — the user-initiated support-ticket channel for the Raw Diagnostics card.
 * Deliberately DISTINCT from uploadTranscriptUrl.ts (which strips identifiers); this one carries them by design.
 * Server: POST `${AI_TRAINING_URL}/diagnostics`. Requires `kind === "diagnostics"` and a lowercase canonical UUID.
 *
 * Web deviation: if the intake host lacks CORS the POST fails as a `network error`; the card offers copy-to-clipboard
 * of the same payload (observability paragraph of the plan).
 */
import { env } from '@/config/env';
import type { DiagBundle } from './httpAiClient';

export const DIAGNOSTICS_UPLOAD_URL = `${env.AI_TRAINING_URL}/diagnostics`;
export const DIAGNOSTICS_POST_TIMEOUT_MS = 30_000;

export type ProbeStatusLike = 'checking' | 'ok' | 'failed' | 'unsupported';

export interface DiagnosticsRelayInfo {
  dns_name: string;
  status: string;
}

export interface DiagnosticsPhoneInfo {
  blox_kubo_peer_id: string;
  blox_cluster_peer_id: string | null;
  app_peer_id: string;
  phone_internet: ProbeStatusLike;
  discovery_service: ProbeStatusLike;
  relays: DiagnosticsRelayInfo[] | null;
  transport_used: string; // 'lan-http' | 'ble' | 'none'
  app_platform: string; // 'android' | 'ios' | 'web'
}

export interface DiagnosticsBloxInfo {
  generated_at?: string;
  tools?: Record<string, unknown>;
  error?: string;
}

export interface DiagnosticsPayload {
  kind: 'diagnostics';
  upload_id: string;
  generated_at: string;
  phone: DiagnosticsPhoneInfo;
  blox: DiagnosticsBloxInfo | null;
}

export interface PostDiagnosticsResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const BYTE_TO_HEX: string[] = [];
for (let i = 0; i < 256; i++) {
  BYTE_TO_HEX.push((i + 0x100).toString(16).slice(1));
}

function fillRandom(bytes: Uint8Array): void {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
    return;
  }
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}

/** RFC4122 v4 UUID in lowercase canonical 8-4-4-4-12 form. */
export function uuidv4(): string {
  const b = new Uint8Array(16);
  fillRandom(b);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = (i: number) => BYTE_TO_HEX[b[i] ?? 0] ?? '00';
  return (
    h(0) + h(1) + h(2) + h(3) + '-' +
    h(4) + h(5) + '-' +
    h(6) + h(7) + '-' +
    h(8) + h(9) + '-' +
    h(10) + h(11) + h(12) + h(13) + h(14) + h(15)
  );
}

export interface BuildDiagnosticsArgs {
  bloxKuboPeerId: string;
  bloxClusterPeerId: string | null;
  appPeerId: string;
  phoneInternet: ProbeStatusLike;
  discoveryStatus: ProbeStatusLike;
  relays: DiagnosticsRelayInfo[] | null;
  transportUsed: string;
  appPlatform: string;
  bundle: DiagBundle | null;
  bundleError?: string | null;
}

export function buildDiagnosticsPayload(args: BuildDiagnosticsArgs): DiagnosticsPayload {
  let blox: DiagnosticsBloxInfo | null;
  if (args.bundle) {
    blox = { generated_at: args.bundle.generated_at, tools: args.bundle.tools };
  } else if (args.bundleError) {
    blox = { error: args.bundleError };
  } else {
    blox = null;
  }
  return {
    kind: 'diagnostics',
    upload_id: uuidv4(),
    generated_at: new Date().toISOString(),
    phone: {
      blox_kubo_peer_id: args.bloxKuboPeerId,
      blox_cluster_peer_id: args.bloxClusterPeerId,
      app_peer_id: args.appPeerId,
      phone_internet: args.phoneInternet,
      discovery_service: args.discoveryStatus,
      relays: args.relays,
      transport_used: args.transportUsed,
      app_platform: args.appPlatform,
    },
    blox,
  };
}

export async function postDiagnostics(payload: DiagnosticsPayload, timeoutMs: number = DIAGNOSTICS_POST_TIMEOUT_MS): Promise<PostDiagnosticsResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(DIAGNOSTICS_UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (resp.ok) {
      return { ok: true, status: resp.status };
    }
    return { ok: false, status: resp.status, error: `HTTP ${resp.status}` };
  } catch (e) {
    const name = (e as { name?: string } | undefined)?.name;
    return { ok: false, error: name === 'AbortError' ? 'timeout' : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}
