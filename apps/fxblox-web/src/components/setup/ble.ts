/**
 * Web Bluetooth helpers shared by the setup screens and Bluetooth commands.
 *
 *  - `useBleConnect()` — the explicit "Connect via Bluetooth" gesture: `BleSession.pick()` (Chrome chooser),
 *    `attach()`, `BleRegistry.register()` (so `safeGetConnectedPeripherals()` / the api BLE branches see it).
 *  - `runBleCommand()` — one command through a fresh `ResponseAssembler` (cleanup in `finally`), the
 *    `writeToBLEAndWaitForResponse` shape every mobile screen used.
 *  - `currentBleSession()` — the connected session for this page, if any.
 */
import { useCallback, useState } from 'react';
import { env } from '@/config/env';
import {
  BleRegistry,
  BleSession,
  BleUnavailableError,
  ResponseAssembler,
  isWebBluetoothSupported,
} from '@/platform/bluetooth';

export type BleConnectFailure = 'unavailable' | 'cancelled' | 'failed';

export interface BleConnectResult {
  session: BleSession | null;
  failure?: BleConnectFailure;
  error?: unknown;
}

/** Chrome rejects `requestDevice()` with `NotFoundError` when the user closes the chooser. */
export function isChooserCancelled(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'NotFoundError';
}

export async function connectBle(): Promise<BleConnectResult> {
  if (!isWebBluetoothSupported()) {
    return { session: null, failure: 'unavailable', error: new BleUnavailableError() };
  }
  try {
    const session = await BleSession.pick({ allowChunkedWrites: env.ENABLE_BLE_CHUNKED_WRITES });
    await session.attach();
    BleRegistry.register(session, { makeCurrent: true });
    return { session };
  } catch (e) {
    if (isChooserCancelled(e)) return { session: null, failure: 'cancelled', error: e };
    if (e instanceof BleUnavailableError)
      return { session: null, failure: 'unavailable', error: e };
    return { session: null, failure: 'failed', error: e };
  }
}

export function useBleConnect() {
  const [connecting, setConnecting] = useState(false);
  const connect = useCallback(async (): Promise<BleConnectResult> => {
    setConnecting(true);
    try {
      return await connectBle();
    } finally {
      setConnecting(false);
    }
  }, []);
  return { connect, connecting };
}

/** The page's current BLE session when it is still connected. */
export function currentBleSession(): BleSession | null {
  const s = BleRegistry.current();
  return s && s.isConnected() ? s : null;
}

export async function runBleCommand(
  command: string,
  peripheralId: string,
  timeoutMs = 30_000,
): Promise<unknown> {
  const assembler = new ResponseAssembler();
  try {
    return await assembler.writeToBLEAndWaitForResponse(
      command,
      peripheralId,
      undefined,
      undefined,
      timeoutMs,
    );
  } finally {
    assembler.cleanup();
  }
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
