/**
 * Blox hardware / pairing calls on the hotspot API (and at an explicit LAN ip for the existing-Blox flow).
 * axios → `platform/lanHttp`; BLE branch via `BleRegistry`; `{ data }` envelopes kept.
 */
import { API_URL, apiUrlFor } from './index';
import { lanJson, type LanResponse } from '@/platform/lanHttp';
import type { TBloxProperty } from '@/models';
import { ResponseAssembler, safeGetConnectedPeripherals } from '@/utils/ble';
import { noteFromProperties } from '@/utils/lanIpCache';

export type GeneralResponse = {
  status: boolean;
  msg?: string;
};

export type ExchangeResponse = { peer_id: string };

/**
 * Exchange config (app peerId + seed) with the Blox on the hotspot. `peer_id` is expected to be the 52-char
 * libp2p id; the screen keeps its length check.
 */
export const exchangeConfig = async (data: { peer_id?: string; seed?: string }): Promise<{ data: ExchangeResponse }> => {
  const form = { peer_id: data?.peer_id, seed: data?.seed };
  return lanJson<ExchangeResponse>(`${API_URL}/peer/exchange`, { method: 'POST', query: form, form, timeoutMs: 1000 * 15 });
};

export const getBloxProperties = async (): Promise<{ data: TBloxProperty }> => {
  try {
    // Check for a BLE session first
    const connectedPeripherals = await safeGetConnectedPeripherals([]);
    const first = connectedPeripherals[0];
    if (first) {
      const responseAssembler = new ResponseAssembler();
      try {
        const response = await responseAssembler.writeToBLEAndWaitForResponse('properties', first.id);
        if (response) {
          return { data: response as TBloxProperty };
        }
      } catch (bleError) {
        console.log('BLE properties fetch failed:', bleError);
      } finally {
        responseAssembler.cleanup();
      }
    }

    console.log(`Fetching properties via HTTP: ${API_URL}/properties`);
    const res = await lanJson<TBloxProperty>(`${API_URL}/properties`, { timeoutMs: 1000 * 15 });
    return res;
  } catch (error) {
    console.error('Properties fetch failed:', error);
    throw error;
  }
};

/**
 * Exchange config with a Blox at a specific IP address (LAN/PC setup).
 */
export const exchangeConfigAtIp = async (ip: string, port: number, data: { peer_id?: string; seed?: string }): Promise<{ data: ExchangeResponse }> => {
  const form = { peer_id: data?.peer_id, seed: data?.seed };
  return lanJson<ExchangeResponse>(`${apiUrlFor(ip, port)}/peer/exchange`, { method: 'POST', query: form, form, timeoutMs: 1000 * 15 });
};

/**
 * Get Blox properties from a specific IP address (LAN/PC setup). Skips BLE. A successful response feeds the
 * LAN-IP cache so the AI transport selector can use this address later.
 */
export const getBloxPropertiesAtIp = async (
  ip: string,
  port: number,
  opts: { timeoutMs?: number } = {},
): Promise<{ data: TBloxProperty }> => {
  // 15 s suits a deliberate one-off call. A scan probes several addresses at once, most of which are expected
  // to be nothing, and waiting the full 15 s on each is what made the discovery spinner outlast its own
  // results by half a minute — so the scan passes something shorter.
  const res = await lanJson<TBloxProperty>(`${apiUrlFor(ip, port)}/properties`, {
    timeoutMs: opts.timeoutMs ?? 1000 * 15,
  });
  try {
    noteFromProperties(ip, res.data, port);
  } catch {
    /* cache is best-effort */
  }
  return res;
};

/**
 * `baseUrl` defaults to the hotspot. Pass an explicit one for a Blox reached at a LAN address: the WAP setup
 * listener serves the SAME mux there, so these routes exist — but sent to 10.42.0.1 from a home network they
 * go nowhere, which turns Format Disk into a dead button and drops the post-failure config cleanup.
 */
export const bloxFormatDisk = async (
  baseUrl: string = API_URL,
): Promise<{ data: GeneralResponse }> => {
  return lanJson<GeneralResponse>(`${baseUrl}/partition`, { method: 'POST' });
};

export const bloxDeleteFulaConfig = async (
  baseUrl: string = API_URL,
): Promise<{ data: GeneralResponse }> => {
  return lanJson<GeneralResponse>(`${baseUrl}/delete-fula-config`, { method: 'POST' });
};

export const getReadinessAtIp = async (ip: string, port = 3500, timeoutMs = 3000): Promise<LanResponse<unknown>> => {
  return lanJson(`${apiUrlFor(ip, port)}/readiness`, { timeoutMs });
};
