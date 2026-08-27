/**
 * Wi-Fi + properties calls on the Blox hotspot API. Ported from mobile with axios → `platform/lanHttp` and the
 * BLE branch resolved through `BleRegistry` (a connected session opened by this page). `{ data }` envelopes are
 * kept so screens and `useFetch` are untouched. `putApDisable` is a GET (the firmware route is GET).
 */
import { API_URL } from './index';
import { lanJson, type LanResponse } from '@/platform/lanHttp';
import { ResponseAssembler, safeGetConnectedPeripherals } from '@/utils/ble';
import { country as defaultCountry } from '@/platform/locale';

export type WifiNetwork = { essid?: string; ssid?: string; rssi?: number; signal?: number; security?: string; [k: string]: unknown };

export type WifiStatus = { status: boolean | string; [k: string]: unknown };

async function viaBle<T>(command: string): Promise<{ data: T } | null> {
  const connectedPeripherals = await safeGetConnectedPeripherals([]);
  const first = connectedPeripherals[0];
  if (!first) return null;
  const responseAssembler = new ResponseAssembler();
  try {
    console.log(`sending ${command.split(' ')[0]} command through ble`);
    const response = await responseAssembler.writeToBLEAndWaitForResponse(command, first.id);
    if (response) {
      return { data: response as T };
    }
  } catch (bleError) {
    console.log(`BLE ${command.split(' ')[0]} failed:`, bleError);
  } finally {
    responseAssembler.cleanup();
  }
  return null;
}

export const getProperties = async (): Promise<LanResponse<unknown>> => {
  return lanJson(`${API_URL}/properties`, { timeoutMs: 1000 * 15 });
};

export const postProperties = async (data: Record<string, string>): Promise<LanResponse<unknown>> => {
  return lanJson(`${API_URL}/properties`, { method: 'POST', form: data });
};

export const getWifiList = async (): Promise<{ data: WifiNetwork[] }> => {
  try {
    const ble = await viaBle<WifiNetwork[]>('wifi/list');
    if (ble) return ble;
    // Fallback to HTTP
    return lanJson<WifiNetwork[]>(`${API_URL}/wifi/list`);
  } catch (error) {
    console.error('WiFi list fetch failed:', error);
    throw error;
  }
};

export const getWifiStatus = async (): Promise<{ data: WifiStatus }> => {
  try {
    const ble = await viaBle<WifiStatus>('wifi/status');
    if (ble) return ble;
    return lanJson<WifiStatus>(`${API_URL}/wifi/status`);
  } catch (error) {
    console.error('WiFi status fetch failed:', error);
    throw error;
  }
};

export const postWifiConnect = async (data: { ssid: string; password: string; countryCode?: string }): Promise<{ data: unknown }> => {
  const countryCode = data.countryCode || defaultCountry();
  try {
    const ble = await viaBle<unknown>(`wifi/connect ${data.ssid} ${data.password} ${countryCode}`);
    if (ble) return ble;

    // Fallback to HTTP — mirrors mobile: params in the query string AND a form-encoded POST, 15 s timeout.
    const form = { ssid: data.ssid, password: data.password, countryCode };
    return lanJson(`${API_URL}/wifi/connect`, { method: 'POST', query: form, form, timeoutMs: 1000 * 15 });
  } catch (error) {
    console.error('WiFi connect failed:', error);
    throw error;
  }
};

/** The firmware route is GET (the mobile app's PUT only worked because Go ignored the method). */
export const putApDisable = async (): Promise<LanResponse<unknown>> => {
  return lanJson(`${API_URL}/ap/disable`, { method: 'GET', timeoutMs: 10_000 });
};

export const getApEnable = async (): Promise<LanResponse<unknown>> => {
  return lanJson(`${API_URL}/ap/enable`, { method: 'GET', timeoutMs: 10_000 });
};

export const getReadiness = async (timeoutMs = 3000): Promise<LanResponse<unknown>> => {
  return lanJson(`${API_URL}/readiness`, { timeoutMs });
};
