/**
 * useBleTransport — the BLE transport shared by the AI session and the Raw Diagnostics card (mobile: one
 * `BleManagerWrapper` + `safeGetConnectedPeripherals` on mount). Web Bluetooth needs a user gesture for the
 * chooser, so instead of auto-connecting on mount the screen offers a "Connect Bluetooth" button (`connect()`);
 * a session this page already opened (registry) is reused without the chooser.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BleRegistry,
  BleSession,
  ResponseAssembler,
  isFxBloxDeviceName,
  isWebBluetoothSupported,
  type BleCommandWriter,
} from '@/platform/bluetooth';
import { safeGetConnectedPeripherals } from '@/utils/ble';
import { env } from '@/config/env';

export type BleUiStatus = 'unsupported' | 'idle' | 'connecting' | 'connected' | 'error';

export interface BleTransportState {
  supported: boolean;
  status: BleUiStatus;
  error: string | null;
  deviceName: string | undefined;
  bleManager: BleCommandWriter | null;
  blePeripheralId: string | null;
  /** Opens the Chrome chooser — call from a click handler. */
  connect: () => Promise<void>;
}

export function useBleTransport(bloxPeerId: string | undefined): BleTransportState {
  const supported = isWebBluetoothSupported();
  const [status, setStatus] = useState<BleUiStatus>(supported ? 'idle' : 'unsupported');
  const [session, setSession] = useState<BleSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bleManager = useMemo<BleCommandWriter | null>(() => (session ? new ResponseAssembler(session) : null), [session]);

  // Reuse a session this page already opened (no chooser needed).
  useEffect(() => {
    let cancelled = false;
    safeGetConnectedPeripherals([])
      .then((peripherals) => {
        if (cancelled) return;
        const blox = peripherals.find((p) => isFxBloxDeviceName(p.name));
        if (!blox) return;
        const existing = BleRegistry.sessions_().find((s) => s.id === blox.id);
        if (existing) {
          setSession(existing);
          setStatus('connected');
        }
      })
      .catch(() => {
        // Nothing connected; the button covers it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    return session.onDisconnect(() => {
      setSession(null);
      setStatus(supported ? 'idle' : 'unsupported');
    });
  }, [session, supported]);

  const connect = useCallback(async () => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }
    setStatus('connecting');
    setError(null);
    try {
      const picked = await BleSession.pick({ allowChunkedWrites: env.ENABLE_BLE_CHUNKED_WRITES });
      await picked.attach();
      BleRegistry.register(picked);
      if (bloxPeerId) await BleRegistry.bind(bloxPeerId, picked.id).catch(() => undefined);
      setSession(picked);
      setStatus('connected');
    } catch (e) {
      // The chooser was dismissed — not an error.
      if ((e as { name?: string } | null)?.name === 'NotFoundError') {
        setStatus('idle');
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [supported, bloxPeerId]);

  return {
    supported,
    status,
    error,
    deviceName: session?.name,
    bleManager,
    blePeripheralId: session?.id ?? null,
    connect,
  };
}

export default useBleTransport;
