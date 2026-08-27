import { env } from '@/config/env';

/** Blox hotspot WAP API. `VITE_BLOX_AP_URL` overrides it (fake-blox: http://127.0.0.1:3500). */
export const API_URL = env.BLOX_AP_URL;

/** Build the base URL for a Blox reached at an explicit LAN ip:port (ConnectToExistingBlox / manual setup). */
export const apiUrlFor = (ip: string, port: number = 3500): string => `http://${ip}:${port}`;
