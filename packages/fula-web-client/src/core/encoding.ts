/**
 * Small, dependency-free byte/string helpers shared by identity + signing.
 * Kept explicit because the Go side is byte-exact (see go-fula/blockchain/auth_signed.go).
 */

const textEncoder = new TextEncoder();

export function utf8(s: string): Uint8Array {
  return textEncoder.encode(s);
}

/** SHA-256 via WebCrypto (browser + Node ≥ 19). */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(buf);
}

/** Standard base64 with padding (Go's base64.StdEncoding). */
export function toBase64Std(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function fromBase64Std(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('fromHex: odd length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
